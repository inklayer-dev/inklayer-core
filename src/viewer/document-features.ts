/**
 * @file Generation-scoped PDF document feature controller.
 * @description Owns outline resolution, literal and isolated regex search,
 * text geometry, thumbnail rendering/cache, cancellation, and surface cleanup.
 * @remarks It exposes no product panels and becomes invalid when its document
 * generation is replaced or destroyed.
 */

import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RefProxy,
  RenderTask,
  TextItem,
  TextStyle
} from 'pdfjs-dist/types/src/display/api'
import { InkLayerError } from '../domain/errors'
import type {
  PdfNavigationTarget,
  PdfOutlineItem,
  PdfPageRaster,
  PdfPageRasterOptions,
  PdfResolvedTextRange,
  PdfResolveTextRangesOptions,
  PdfSearchManyInputQuery,
  PdfSearchMatch,
  PdfSearchManyOptions,
  PdfSearchManyProgress,
  PdfSearchManyQueryResult,
  PdfSearchManyResult,
  PdfSearchOptions,
  PdfSearchResult,
  PdfThumbnail,
  PdfThumbnailOptions,
  PdfThumbnailSurface,
  PdfThumbnailSurfaceProvider,
  PdfTextRange,
  PdfTextSelectionRect
} from './types'
import {
  createBrowserRegexMatcher,
  type RegexMatcherFactory,
  type RegexMatcherSession
} from './regex-matcher'
import type { RegexMatcherQueryResult } from './regex-matcher-protocol'

interface RawOutlineItem {
  title: string
  bold: boolean
  italic: boolean
  color: Uint8ClampedArray
  dest: string | readonly unknown[] | null
  url: string | null
  items: readonly unknown[]
}

interface PreparedSearchManyQueryBase {
  readonly id: string
  readonly query: string
  readonly maxResults: number
  readonly matches: PdfSearchMatch[]
  truncated: boolean
}

interface PreparedTextSearchManyQuery extends PreparedSearchManyQueryBase {
  readonly kind: 'text'
  readonly needle: string
  readonly matchCase: boolean
  readonly matchDiacritics: boolean
  readonly wholeWord: boolean
}

interface PreparedRegexSearchManyQuery extends PreparedSearchManyQueryBase {
  readonly kind: 'regex'
  readonly source: string
  readonly flags: string
}

type PreparedSearchManyQuery = PreparedTextSearchManyQuery | PreparedRegexSearchManyQuery

interface PageTextSpan {
  readonly start: number
  readonly end: number
  readonly item: TextItem
  readonly style: TextStyle | undefined
}

interface PageTextData {
  readonly page: PDFPageProxy
  readonly text: string
  readonly spans: readonly PageTextSpan[]
}

/** Owns asynchronous document sub-features for one loaded generation. */
export class PdfDocumentFeatures {
  private readonly document: PDFDocumentProxy
  private readonly surfaceProvider: PdfThumbnailSurfaceProvider
  private readonly regexMatcherFactory: RegexMatcherFactory
  private readonly controller = new AbortController()
  private readonly textCache = new Map<number, Promise<PageTextData>>()
  private readonly thumbnailCache = new Map<string, Promise<PdfThumbnail>>()
  private readonly renderTasks = new Set<RenderTask>()

  /** Creates a controller around one live PDF.js document. */
  public constructor(
    document: PDFDocumentProxy,
    surfaceProvider: PdfThumbnailSurfaceProvider | undefined,
    regexMatcherFactory: RegexMatcherFactory = createBrowserRegexMatcher
  ) {
    this.document = document
    this.surfaceProvider = surfaceProvider ?? createBrowserThumbnailSurfaceProvider()
    this.regexMatcherFactory = regexMatcherFactory
  }

  /** Resolves and sanitizes the document outline tree. */
  public async getOutline(): Promise<readonly PdfOutlineItem[]> {
    this.assertActive('getOutline')
    try {
      const outline: unknown = await this.document.getOutline()
      this.assertActive('getOutline')
      if (outline === null) return []
      if (!Array.isArray(outline)) throw new TypeError('PDF outline must be an array or null.')
      return await Promise.all(outline.map(async (item) => this.normalizeOutlineItem(item)))
    } catch (cause) {
      throw this.normalizeFeatureError(cause, 'getOutline')
    }
  }

  /** Resolves a named or explicit PDF destination into a zero-based page target. */
  public async resolveDestination(
    destination: string | readonly unknown[]
  ): Promise<PdfNavigationTarget | null> {
    this.assertActive('resolveDestination')
    try {
      const explicit: unknown = typeof destination === 'string'
        ? await this.document.getDestination(destination)
        : destination
      this.assertActive('resolveDestination')
      if (explicit === null) return null
      if (!Array.isArray(explicit) || explicit.length < 2) {
        throw new TypeError('PDF destination must be a non-empty explicit destination array.')
      }
      const pageIndex = await this.resolveDestinationPage(explicit[0])
      this.assertActive('resolveDestination')
      if (pageIndex < 0 || pageIndex >= this.document.numPages) {
        throw new RangeError('PDF destination page is outside the document.')
      }
      const target: PdfNavigationTarget = { pageIndex }
      const mode = explicit[1]
      if (isNameObject(mode) && mode.name === 'XYZ') {
        const left = finiteNumber(explicit[2])
        const top = finiteNumber(explicit[3])
        const zoom = positiveNumber(explicit[4])
        if (left !== undefined) target.left = left
        if (top !== undefined) target.top = top
        if (zoom !== undefined) target.zoom = zoom
      }
      return target
    } catch (cause) {
      throw this.normalizeFeatureError(cause, 'resolveDestination')
    }
  }

  /** Searches page text in deterministic page and character order. */
  public async search(query: string, options: PdfSearchOptions = {}): Promise<PdfSearchResult> {
    this.assertActive('search')
    const normalizedQuery = query.trim()
    if (normalizedQuery.length === 0) return { query: '', matches: [], truncated: false }
    const maxResults = validateSearchResultLimit(options.maxResults, 'search')
    const matchCase = options.matchCase ?? false
    const matchDiacritics = options.matchDiacritics ?? false
    const needle = normalizeSearchValue(normalizedQuery, matchCase, matchDiacritics).text
    if (needle.length === 0) {
      return { query: normalizedQuery, matches: [], truncated: false }
    }
    const matches: PdfSearchMatch[] = []
    try {
      for (let pageIndex = 0; pageIndex < this.document.numPages; pageIndex += 1) {
        const pageText = await this.getPageText(pageIndex)
        this.assertActive('search')
        const normalizedPage = normalizeSearchValue(pageText, matchCase, matchDiacritics)
        const haystack = normalizedPage.text
        let cursor = 0
        let pageMatchIndex = 0
        while (cursor <= haystack.length - needle.length) {
          const start = haystack.indexOf(needle, cursor)
          if (start < 0) break
          cursor = start + Math.max(needle.length, 1)
          if ((options.wholeWord ?? false) && !isWholeWord(haystack, start, needle.length)) continue
          const sourceStart = normalizedPage.starts[start] ?? start
          const sourceEnd = normalizedPage.ends[start + needle.length - 1]
            ?? sourceStart + needle.length
          const sourceLength = sourceEnd - sourceStart
          matches.push({
            pageIndex,
            matchIndex: pageMatchIndex,
            start: sourceStart,
            length: sourceLength,
            text: pageText.slice(sourceStart, sourceStart + sourceLength),
            preview: createSearchPreview(pageText, sourceStart, sourceLength)
          })
          pageMatchIndex += 1
          if (matches.length >= maxResults) {
            return { query: normalizedQuery, matches, truncated: true }
          }
        }
      }
      return { query: normalizedQuery, matches, truncated: false }
    } catch (cause) {
      throw this.normalizeFeatureError(cause, 'search')
    }
  }

  /** Searches ordered queries while extracting each document page at most once. */
  public async searchMany(
    queries: readonly PdfSearchManyInputQuery[],
    options: PdfSearchManyOptions = {}
  ): Promise<PdfSearchManyResult> {
    this.assertSearchManyActive(options.signal)
    const prepared = prepareSearchManyQueries(queries)
    const maxTotalResults = validateSearchManyTotalLimit(options.maxTotalResults)
    if (prepared.every((query) => !isPreparedQueryActive(query))) {
      return createSearchManyResult(prepared, false)
    }
    const hasRegex = prepared.some((query) => query.kind === 'regex')
    let regexMatcher: RegexMatcherSession | null = null
    let regexAbort: AbortController | null = null
    let removeRegexAbort = (): void => undefined
    const totalPages = this.document.numPages
    let totalResults = 0
    let batchTruncated = false
    try {
      if (hasRegex) {
        regexMatcher = this.regexMatcherFactory()
        const composed = composeSearchManyAbort(this.controller.signal, options.signal)
        regexAbort = composed.controller
        removeRegexAbort = composed.cleanup
      }
      reportSearchManyProgress(options.onProgress, 0, totalPages)
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        this.assertSearchManyActive(options.signal)
        const pageText = await waitForSearchMany(
          this.getPageText(pageIndex),
          this.controller.signal,
          options.signal
        )
        this.assertSearchManyActive(options.signal)
        const normalizedPages = new Map<string, NormalizedSearchValue>()
        const regexResults = regexMatcher === null || regexAbort === null
          ? new Map<string, RegexMatcherQueryResult>()
          : new Map((await regexMatcher.matchPage(
              pageText,
              prepared.flatMap((query) => query.kind !== 'regex'
                || query.truncated || query.matches.length >= query.maxResults
                ? []
                : [{
                    id: query.id,
                    source: query.source,
                    flags: query.flags,
                    maxResults: query.maxResults - query.matches.length
                  }]),
              regexAbort.signal
            )).map((result) => [result.id, result]))
        this.assertSearchManyActive(options.signal)
        for (const query of prepared) {
          if (!isPreparedQueryActive(query)) continue
          const pageMatches = query.kind === 'text'
            ? findLiteralPageMatches(query, pageText, normalizedPages)
            : regexResults.get(query.id)?.matches ?? []
          for (const [pageMatchIndex, match] of pageMatches.entries()) {
            this.assertSearchManyActive(options.signal)
            query.matches.push(createBatchSearchMatch(
              pageText,
              pageIndex,
              pageMatchIndex,
              match.start,
              match.length
            ))
            totalResults += 1
            if (totalResults >= maxTotalResults) {
              batchTruncated = true
              if (query.matches.length >= query.maxResults) query.truncated = true
              break
            }
            if (query.matches.length >= query.maxResults) {
              query.truncated = true
              break
            }
          }
          if (batchTruncated) break
        }
        reportSearchManyProgress(options.onProgress, pageIndex + 1, totalPages)
        if (batchTruncated
          || prepared.every((query) => !isPreparedQueryActive(query))) break
      }
      this.assertSearchManyActive(options.signal)
      return createSearchManyResult(prepared, batchTruncated)
    } catch (cause) {
      if (cause instanceof InkLayerError) throw cause
      throw this.normalizeFeatureError(cause, 'searchMany')
    } finally {
      removeRegexAbort()
      regexMatcher?.destroy()
    }
  }

  /** Resolves UTF-16 page-text ranges without requiring a mounted TextLayer. */
  public async resolveTextRanges(
    ranges: readonly PdfTextRange[],
    options: PdfResolveTextRangesOptions = {}
  ): Promise<readonly PdfResolvedTextRange[]> {
    this.assertTextRangeActive(options.signal)
    const prepared = validateTextRanges(ranges, this.document.numPages)
    const pages = new Map<number, {
      readonly data: PageTextData
      readonly viewport: ReturnType<PDFPageProxy['getViewport']>
    }>()
    const resolved: PdfResolvedTextRange[] = []
    const measureText = createBrowserTextMeasurer()
    try {
      for (const range of prepared) {
        this.assertTextRangeActive(options.signal)
        let page = pages.get(range.pageIndex)
        if (page === undefined) {
          const data = await waitForTextRanges(
            this.getPageTextData(range.pageIndex),
            this.controller.signal,
            options.signal
          )
          this.assertTextRangeActive(options.signal)
          page = { data, viewport: data.page.getViewport({ scale: 1 }) }
          pages.set(range.pageIndex, page)
        }
        resolved.push(resolveTextRange(range, page.data, page.viewport, measureText))
      }
      this.assertTextRangeActive(options.signal)
      return resolved
    } catch (cause) {
      if (cause instanceof InkLayerError) throw cause
      throw this.normalizeFeatureError(cause, 'resolveTextRanges')
    }
  }

  /** Renders and caches one PNG thumbnail without exposing a working canvas. */
  public async renderThumbnail(options: PdfThumbnailOptions): Promise<PdfThumbnail> {
    this.assertActive('renderThumbnail')
    validatePageIndex(options.pageIndex, this.document.numPages)
    const maxWidth = options.maxWidth ?? 160
    const pixelRatio = options.pixelRatio ?? defaultPixelRatio()
    if (!Number.isFinite(maxWidth) || maxWidth < 32 || maxWidth > 2_048) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'Thumbnail width is outside the supported range.', {
        operation: 'renderThumbnail', pageIndex: options.pageIndex
      })
    }
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0 || pixelRatio > 4) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'Thumbnail pixel ratio is outside the supported range.', {
        operation: 'renderThumbnail', pageIndex: options.pageIndex
      })
    }
    const cacheKey = `${options.pageIndex}:${maxWidth}:${pixelRatio}`
    const cached = this.thumbnailCache.get(cacheKey)
    if (cached !== undefined) return cloneThumbnail(await cached)
    const pending = this.renderThumbnailUncached(options.pageIndex, maxWidth, pixelRatio)
    this.thumbnailCache.set(cacheKey, pending)
    try {
      return cloneThumbnail(await pending)
    } catch (cause) {
      this.thumbnailCache.delete(cacheKey)
      throw this.normalizeFeatureError(cause, 'renderThumbnail', options.pageIndex)
    }
  }

  /** Renders one uncached full-page PNG with an optional post-render pass. */
  public async renderPageRaster(
    options: PdfPageRasterOptions,
    afterRender?: (canvas: HTMLCanvasElement, pixelRatio: number) => void
  ): Promise<PdfPageRaster> {
    this.assertActive('renderPageRaster')
    validatePageIndex(options.pageIndex, this.document.numPages)
    const scale = options.scale ?? 1
    const pixelRatio = options.pixelRatio ?? 1
    if (!Number.isFinite(scale) || scale <= 0 || scale > 10
      || !Number.isFinite(pixelRatio) || pixelRatio <= 0 || pixelRatio > 4) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF page raster options are invalid.', {
        operation: 'renderPageRaster', pageIndex: options.pageIndex
      })
    }
    const page = await this.document.getPage(options.pageIndex + 1)
    const layoutViewport = page.getViewport({ scale })
    const rasterViewport = page.getViewport({ scale: scale * pixelRatio })
    const surface = this.surfaceProvider.create(
      Math.max(1, Math.ceil(rasterViewport.width)),
      Math.max(1, Math.ceil(rasterViewport.height))
    )
    try {
      const task = renderThumbnailPage(page, surface, rasterViewport)
      this.renderTasks.add(task)
      try {
        await task.promise
      } finally {
        this.renderTasks.delete(task)
      }
      this.assertActive('renderPageRaster')
      afterRender?.(surface.canvas, pixelRatio)
      const blob = await surface.encode()
      this.assertActive('renderPageRaster')
      return {
        pageIndex: options.pageIndex,
        width: layoutViewport.width,
        height: layoutViewport.height,
        pixelRatio,
        blob
      }
    } catch (cause) {
      throw this.normalizeFeatureError(cause, 'renderPageRaster', options.pageIndex)
    } finally {
      surface.release()
    }
  }

  /** Cancels document feature work and releases cached values. */
  public destroy(): void {
    if (this.controller.signal.aborted) return
    this.controller.abort()
    for (const task of this.renderTasks) task.cancel()
    this.renderTasks.clear()
    this.textCache.clear()
    this.thumbnailCache.clear()
  }

  /** Normalizes one untrusted outline node recursively. */
  private async normalizeOutlineItem(value: unknown): Promise<PdfOutlineItem> {
    const item = parseRawOutlineItem(value)
    const target = item.dest === null ? null : await this.resolveDestination(item.dest)
    const items = await Promise.all(item.items.map(async (child) => this.normalizeOutlineItem(child)))
    return {
      title: item.title,
      bold: item.bold,
      italic: item.italic,
      color: rgbToCss(item.color),
      target,
      url: item.url,
      items
    }
  }

  /** Resolves the page component of one explicit destination. */
  private async resolveDestinationPage(value: unknown): Promise<number> {
    if (Number.isSafeInteger(value) && typeof value === 'number') return value
    if (!isRefProxy(value)) throw new TypeError('PDF destination page reference is invalid.')
    return await this.document.getPageIndex(value)
  }

  /** Returns cached normalized text for one zero-based page. */
  private async getPageText(pageIndex: number): Promise<string> {
    return (await this.getPageTextData(pageIndex)).text
  }

  /** Returns cached source text, item offsets, and the owning PDF.js page. */
  private async getPageTextData(pageIndex: number): Promise<PageTextData> {
    const cached = this.textCache.get(pageIndex)
    if (cached !== undefined) return await cached
    const pending = this.extractPageTextData(pageIndex)
    this.textCache.set(pageIndex, pending)
    try {
      return await pending
    } catch (cause) {
      this.textCache.delete(pageIndex)
      throw cause
    }
  }

  /** Extracts one page's text with stable line separators. */
  private async extractPageTextData(pageIndex: number): Promise<PageTextData> {
    validatePageIndex(pageIndex, this.document.numPages)
    const page = await this.document.getPage(pageIndex + 1)
    this.assertActive('search')
    const content = await page.getTextContent()
    this.assertActive('search')
    const text: string[] = []
    const spans: PageTextSpan[] = []
    let offset = 0
    for (const item of content.items) {
      if (!isTextItem(item)) continue
      const start = offset
      text.push(item.str)
      offset += item.str.length
      spans.push({ start, end: offset, item, style: content.styles[item.fontName] })
      if (item.hasEOL) {
        text.push('\n')
        offset += 1
      }
    }
    return { page, text: text.join(''), spans }
  }

  /** Performs one uncached page render and PNG encoding. */
  private async renderThumbnailUncached(
    pageIndex: number,
    maxWidth: number,
    pixelRatio: number
  ): Promise<PdfThumbnail> {
    const page = await this.document.getPage(pageIndex + 1)
    this.assertActive('renderThumbnail')
    const baseViewport = page.getViewport({ scale: 1 })
    const layoutScale = maxWidth / baseViewport.width
    const viewport = page.getViewport({ scale: layoutScale * pixelRatio })
    const width = maxWidth
    const height = baseViewport.height * layoutScale
    const surface = this.surfaceProvider.create(
      Math.max(1, Math.ceil(viewport.width)),
      Math.max(1, Math.ceil(viewport.height))
    )
    try {
      const task = renderThumbnailPage(page, surface, viewport)
      this.renderTasks.add(task)
      try {
        await task.promise
      } finally {
        this.renderTasks.delete(task)
      }
      this.assertActive('renderThumbnail')
      const blob = await surface.encode()
      this.assertActive('renderThumbnail')
      return { pageIndex, width, height, blob }
    } finally {
      surface.release()
    }
  }

  /** Rejects operations after document replacement. */
  private assertActive(operation: string): void {
    if (this.controller.signal.aborted) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF document feature work was cancelled.', {
        operation
      })
    }
  }

  /** Rejects caller, document-generation, and destruction cancellation uniformly. */
  private assertSearchManyActive(signal: AbortSignal | undefined): void {
    if (this.controller.signal.aborted || signal?.aborted === true) {
      throw searchManyCancelled()
    }
  }

  /** Rejects caller, document-generation, and destruction cancellation uniformly. */
  private assertTextRangeActive(signal: AbortSignal | undefined): void {
    if (this.controller.signal.aborted || signal?.aborted === true) {
      throw textRangesCancelled()
    }
  }

  /** Converts unknown feature failures into one structured Core error. */
  private normalizeFeatureError(
    cause: unknown,
    operation: string,
    pageIndex?: number
  ): InkLayerError {
    if (cause instanceof InkLayerError) return cause
    return new InkLayerError('PDF_FEATURE_FAILED', 'PDF document feature operation failed.', {
      operation,
      ...(pageIndex === undefined ? {} : { pageIndex }),
      cause
    })
  }
}

const MAX_SEARCH_QUERY_ID_LENGTH = 512
const MAX_SEARCH_MANY_QUERIES = 10_000
const MAX_REGEX_SOURCE_LENGTH = 16_384
const DEFAULT_SEARCH_RESULT_LIMIT = 1_000
const MAX_SEARCH_RESULT_LIMIT = 100_000
const DEFAULT_SEARCH_MANY_TOTAL_LIMIT = 100_000
const MAX_SEARCH_MANY_TOTAL_LIMIT = 1_000_000

/** Validates and detaches source ranges before any page work starts. */
function validateTextRanges(
  ranges: readonly PdfTextRange[],
  pageCount: number
): PdfTextRange[] {
  if (!Array.isArray(ranges)) {
    throw textRangeFailure('PDF text ranges must be an array.')
  }
  return ranges.map((range) => {
    if (typeof range !== 'object' || range === null
      || !Number.isSafeInteger(range.pageIndex)
      || !Number.isSafeInteger(range.start)
      || !Number.isSafeInteger(range.length)
      || range.pageIndex < 0 || range.pageIndex >= pageCount
      || range.start < 0 || range.length <= 0
      || !Number.isSafeInteger(range.start + range.length)) {
      throw textRangeFailure(
        'PDF text range is invalid.',
        typeof range === 'object' && range !== null && Number.isSafeInteger(range.pageIndex)
          ? range.pageIndex
          : undefined
      )
    }
    return { pageIndex: range.pageIndex, start: range.start, length: range.length }
  })
}

/** Resolves one validated range against exact extracted-text item boundaries. */
function resolveTextRange(
  range: PdfTextRange,
  page: PageTextData,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
  measureText: TextMeasurer | null
): PdfResolvedTextRange {
  const end = range.start + range.length
  if (end > page.text.length
    || !isUtf16Boundary(page.text, range.start)
    || !isUtf16Boundary(page.text, end)) {
    throw textRangeFailure(
      'PDF text range is outside the extracted page text or splits a surrogate pair.',
      range.pageIndex
    )
  }
  const rects: PdfTextSelectionRect[] = []
  for (const span of page.spans) {
    if (span.end <= range.start) continue
    if (span.start >= end) break
    const localStart = Math.max(range.start, span.start) - span.start
    const localEnd = Math.min(end, span.end) - span.start
    if (localEnd <= localStart) continue
    rects.push(resolveTextItemRect(
      span.item,
      localStart,
      localEnd,
      viewport,
      range.pageIndex,
      span.style,
      measureText
    ))
  }
  if (rects.length === 0) {
    throw textRangeFailure(
      'PDF text range contains no text item geometry.',
      range.pageIndex
    )
  }
  return {
    pageIndex: range.pageIndex,
    start: range.start,
    length: range.length,
    text: page.text.slice(range.start, end),
    rects
  }
}

/** Projects one selected TextItem slice through the scale-one page viewport. */
function resolveTextItemRect(
  item: TextItem,
  start: number,
  end: number,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
  pageIndex: number,
  style: TextStyle | undefined,
  measureText: TextMeasurer | null
): PdfTextSelectionRect {
  const itemTransform = finiteMatrix(item.transform)
  const viewportTransform = finiteMatrix(viewport.transform)
  if (itemTransform === null || viewportTransform === null
    || !Number.isFinite(item.width) || item.width <= 0
    || !Number.isFinite(item.height) || item.height <= 0
    || item.str.length === 0 || start < 0 || end > item.str.length || end <= start
    || !isUtf16Boundary(item.str, start) || !isUtf16Boundary(item.str, end)) {
    throw textRangeFailure('PDF text item has no exact usable geometry.', pageIndex)
  }
  const transform = multiplyMatrices(viewportTransform, itemTransform)
  const directionLength = Math.hypot(transform[0], transform[1])
  const userUnit = typeof viewport.userUnit === 'number' && Number.isFinite(viewport.userUnit)
    ? Math.abs(viewport.userUnit)
    : 1
  const advanceLength = item.width * userUnit
  if (directionLength <= 0 || advanceLength <= 0) {
    throw textRangeFailure('PDF text item has degenerate advance geometry.', pageIndex)
  }
  const directionX = transform[0] / directionLength
  const directionY = transform[1] / directionLength
  let [startRatio, endRatio] = resolveTextAdvanceRatios(
    item.str,
    start,
    end,
    style,
    measureText
  )
  if (item.dir === 'rtl') {
    const logicalStartRatio = startRatio
    startRatio = 1 - endRatio
    endRatio = 1 - logicalStartRatio
  }
  const startX = transform[4] + (directionX * advanceLength * startRatio)
  const startY = transform[5] + (directionY * advanceLength * startRatio)
  const endX = transform[4] + (directionX * advanceLength * endRatio)
  const endY = transform[5] + (directionY * advanceLength * endRatio)
  const points: Array<readonly [number, number]> = [
    [startX, startY],
    [endX, endY],
    [endX + transform[2], endY + transform[3]],
    [startX + transform[2], startY + transform[3]]
  ]
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const left = Math.max(0, Math.min(...xs))
  const top = Math.max(0, Math.min(...ys))
  const right = Math.min(viewport.width, Math.max(...xs))
  const bottom = Math.min(viewport.height, Math.max(...ys))
  if (![left, top, right, bottom].every(Number.isFinite)
    || right - left <= 0 || bottom - top <= 0) {
    throw textRangeFailure('PDF text item geometry falls outside the page viewport.', pageIndex)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

type TextMeasurer = (value: string, fontFamily: string) => number | null

/** Uses the browser's loaded PDF.js font to retain proportional glyph advances. */
function createBrowserTextMeasurer(): TextMeasurer | null {
  if (typeof document === 'undefined') return null
  try {
    const context = document.createElement('canvas').getContext('2d')
    if (context === null) return null
    return (value, fontFamily) => {
      try {
        context.font = `100px ${fontFamily}`
        const width = context.measureText(value).width
        return Number.isFinite(width) && width >= 0 ? width : null
      } catch {
        return null
      }
    }
  } catch {
    return null
  }
}

/** Resolves substring advances, with a deterministic linear fallback off-browser. */
function resolveTextAdvanceRatios(
  value: string,
  start: number,
  end: number,
  style: TextStyle | undefined,
  measureText: TextMeasurer | null
): [number, number] {
  const fallback: [number, number] = [start / value.length, end / value.length]
  if (measureText === null || style === undefined || style.vertical) return fallback
  const total = measureText(value, style.fontFamily)
  const startWidth = measureText(value.slice(0, start), style.fontFamily)
  const endWidth = measureText(value.slice(0, end), style.fontFamily)
  if (total === null || startWidth === null || endWidth === null || total <= 0
    || startWidth < 0 || endWidth <= startWidth || endWidth > total) return fallback
  return [startWidth / total, endWidth / total]
}

/** Multiplies two PDF-style affine matrices. */
function multiplyMatrices(
  first: readonly [number, number, number, number, number, number],
  second: readonly [number, number, number, number, number, number]
): [number, number, number, number, number, number] {
  return [
    (first[0] * second[0]) + (first[2] * second[1]),
    (first[1] * second[0]) + (first[3] * second[1]),
    (first[0] * second[2]) + (first[2] * second[3]),
    (first[1] * second[2]) + (first[3] * second[3]),
    (first[0] * second[4]) + (first[2] * second[5]) + first[4],
    (first[1] * second[4]) + (first[3] * second[5]) + first[5]
  ]
}

/** Returns one finite six-value affine matrix or null. */
function finiteMatrix(value: readonly unknown[]): [number, number, number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 6 || !value.every(Number.isFinite)) return null
  return value as [number, number, number, number, number, number]
}

/** Prevents caller ranges from bisecting one UTF-16 surrogate pair. */
function isUtf16Boundary(value: string, offset: number): boolean {
  if (offset <= 0 || offset >= value.length) return true
  const previous = value.charCodeAt(offset - 1)
  const next = value.charCodeAt(offset)
  return !(previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF)
}

/** Creates one structured exact-range validation or projection failure. */
function textRangeFailure(message: string, pageIndex?: number): InkLayerError {
  return new InkLayerError('PDF_FEATURE_FAILED', message, {
    operation: 'resolveTextRanges',
    ...(pageIndex === undefined ? {} : { pageIndex })
  })
}

interface SourceSearchMatch {
  readonly start: number
  readonly length: number
}

/** Returns whether one prepared query can still contribute results. */
function isPreparedQueryActive(query: PreparedSearchManyQuery): boolean {
  return !query.truncated && query.matches.length < query.maxResults
    && (query.kind === 'regex' || query.needle.length > 0)
}

/** Finds one literal query on a page while reusing normalization variants. */
function findLiteralPageMatches(
  query: PreparedTextSearchManyQuery,
  pageText: string,
  normalizedPages: Map<string, NormalizedSearchValue>
): SourceSearchMatch[] {
  const normalizationKey = `${String(query.matchCase)}:${String(query.matchDiacritics)}`
  let normalizedPage = normalizedPages.get(normalizationKey)
  if (normalizedPage === undefined) {
    normalizedPage = normalizeSearchValue(pageText, query.matchCase, query.matchDiacritics)
    normalizedPages.set(normalizationKey, normalizedPage)
  }
  const matches: SourceSearchMatch[] = []
  let cursor = 0
  while (cursor <= normalizedPage.text.length - query.needle.length) {
    const start = normalizedPage.text.indexOf(query.needle, cursor)
    if (start < 0) break
    cursor = start + query.needle.length
    if (query.wholeWord && !isWholeWord(normalizedPage.text, start, query.needle.length)) continue
    const sourceStart = normalizedPage.starts[start] ?? start
    const sourceEnd = normalizedPage.ends[start + query.needle.length - 1]
      ?? sourceStart + query.needle.length
    matches.push({ start: sourceStart, length: sourceEnd - sourceStart })
    if (query.matches.length + matches.length >= query.maxResults) break
  }
  return matches
}

/** Projects one source match into the public batch-search result shape. */
function createBatchSearchMatch(
  pageText: string,
  pageIndex: number,
  matchIndex: number,
  start: number,
  length: number
): PdfSearchMatch {
  return {
    pageIndex,
    matchIndex,
    start,
    length,
    text: pageText.slice(start, start + length),
    preview: createSearchPreview(pageText, start, length)
  }
}

/** Validates and prepares detached mutable accumulators for batch search. */
function prepareSearchManyQueries(
  queries: readonly PdfSearchManyInputQuery[]
): PreparedSearchManyQuery[] {
  if (!Array.isArray(queries)) {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'Batch search queries must be an array.', {
      operation: 'searchMany'
    })
  }
  if (queries.length > MAX_SEARCH_MANY_QUERIES) {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'Batch search contains too many queries.', {
      operation: 'searchMany'
    })
  }
  const ids = new Set<string>()
  return queries.map((input) => {
    if (typeof input !== 'object' || input === null
      || typeof input.id !== 'string' || input.id.trim().length === 0
      || input.id.length > MAX_SEARCH_QUERY_ID_LENGTH) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'Batch search query is invalid.', {
        operation: 'searchMany'
      })
    }
    if (ids.has(input.id)) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'Batch search query identifiers must be unique.', {
        operation: 'searchMany'
      })
    }
    ids.add(input.id)
    if ('kind' in input) {
      if (input.kind !== 'regex' || typeof input.source !== 'string'
        || input.source.trim().length === 0 || input.source.length > MAX_REGEX_SOURCE_LENGTH) {
        throw searchManyFailure('Batch regular-expression query is invalid.')
      }
      const flags = normalizeRegexFlags(input.options?.flags)
      validateRegexSyntax(input.source, flags)
      return {
        id: input.id,
        kind: 'regex',
        query: input.source,
        source: input.source,
        flags,
        maxResults: validateSearchResultLimit(input.options?.maxResults, 'searchMany'),
        matches: [],
        truncated: false
      }
    }
    if (typeof input.query !== 'string') {
      throw searchManyFailure('Batch search query is invalid.')
    }
    const query = input.query.trim()
    const matchCase = input.options?.matchCase ?? false
    const matchDiacritics = input.options?.matchDiacritics ?? false
    const maxResults = validateSearchResultLimit(
      input.options?.maxResults,
      'searchMany'
    )
    return {
      id: input.id,
      kind: 'text',
      query,
      needle: query.length === 0
        ? ''
        : normalizeSearchValue(query, matchCase, matchDiacritics).text,
      matchCase,
      matchDiacritics,
      wholeWord: input.options?.wholeWord ?? false,
      maxResults,
      matches: [],
      truncated: false
    }
  })
}

/** Forwards document and caller cancellation into one Worker-owned signal. */
function composeSearchManyAbort(
  documentSignal: AbortSignal,
  callerSignal: AbortSignal | undefined
): { readonly controller: AbortController; readonly cleanup: () => void } {
  const controller = new AbortController()
  const cancel = (): void => controller.abort()
  documentSignal.addEventListener('abort', cancel, { once: true })
  callerSignal?.addEventListener('abort', cancel, { once: true })
  if (documentSignal.aborted || callerSignal?.aborted === true) controller.abort()
  return {
    controller,
    cleanup: () => {
      documentSignal.removeEventListener('abort', cancel)
      callerSignal?.removeEventListener('abort', cancel)
    }
  }
}

/** Canonicalizes the supported serializable regex flags. */
function normalizeRegexFlags(value: string | undefined): string {
  const flags = value ?? ''
  if (typeof flags !== 'string' || !/^[imsu]*$/u.test(flags)
    || new Set(flags).size !== flags.length) {
    throw searchManyFailure('Batch regular-expression flags are invalid.')
  }
  return [...flags].sort((left, right) => 'imsu'.indexOf(left) - 'imsu'.indexOf(right)).join('')
}

/** Compiles one pattern during atomic preflight without executing it. */
function validateRegexSyntax(source: string, flags: string): void {
  try {
    void new RegExp(source, flags)
  } catch (cause) {
    throw new InkLayerError(
      'PDF_FEATURE_FAILED',
      'Batch regular-expression syntax is invalid.',
      { operation: 'searchMany', cause }
    )
  }
}

/** Validates the optional batch-wide retained-match limit. */
function validateSearchManyTotalLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_SEARCH_MANY_TOTAL_LIMIT
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_SEARCH_MANY_TOTAL_LIMIT) {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'Batch search result limit is invalid.', {
      operation: 'searchMany'
    })
  }
  return limit
}

/** Validates one ordinary or batched per-query retained-match limit. */
function validateSearchResultLimit(value: number | undefined, operation: string): number {
  const limit = value ?? DEFAULT_SEARCH_RESULT_LIMIT
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_SEARCH_RESULT_LIMIT) {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'Search result limit is invalid.', {
      operation
    })
  }
  return limit
}

/** Creates a fully detached immutable-shaped result from private accumulators. */
function createSearchManyResult(
  queries: readonly PreparedSearchManyQuery[],
  truncated: boolean
): PdfSearchManyResult {
  const results: PdfSearchManyQueryResult[] = queries.map((query) => ({
    id: query.id,
    query: query.query,
    matches: query.matches.map((match) => ({ ...match })),
    truncated: query.truncated
  }))
  return { queries: results, truncated }
}

/** Reports one detached monotonic progress value. */
function reportSearchManyProgress(
  listener: ((progress: PdfSearchManyProgress) => void) | undefined,
  completedPages: number,
  totalPages: number
): void {
  listener?.({
    completedPages,
    totalPages,
    percentage: totalPages === 0 ? 100 : Math.round((completedPages / totalPages) * 100)
  })
}

/** Awaits one shared extraction promise while permitting prompt caller cancellation. */
async function waitForSearchMany<T>(
  work: Promise<T>,
  documentSignal: AbortSignal,
  callerSignal: AbortSignal | undefined
): Promise<T> {
  if (documentSignal.aborted || callerSignal?.aborted === true) throw searchManyCancelled()
  return await new Promise<T>((resolve, reject) => {
    const cancel = (): void => {
      cleanup()
      reject(searchManyCancelled())
    }
    const cleanup = (): void => {
      documentSignal.removeEventListener('abort', cancel)
      callerSignal?.removeEventListener('abort', cancel)
    }
    documentSignal.addEventListener('abort', cancel, { once: true })
    callerSignal?.addEventListener('abort', cancel, { once: true })
    void work.then((value) => {
      cleanup()
      resolve(value)
    }, (cause: unknown) => {
      cleanup()
      reject(cause)
    })
  })
}

/** Awaits shared page data while permitting prompt range-resolution cancellation. */
async function waitForTextRanges<T>(
  work: Promise<T>,
  documentSignal: AbortSignal,
  callerSignal: AbortSignal | undefined
): Promise<T> {
  if (documentSignal.aborted || callerSignal?.aborted === true) throw textRangesCancelled()
  return await new Promise<T>((resolve, reject) => {
    const cancel = (): void => {
      cleanup()
      reject(textRangesCancelled())
    }
    const cleanup = (): void => {
      documentSignal.removeEventListener('abort', cancel)
      callerSignal?.removeEventListener('abort', cancel)
    }
    documentSignal.addEventListener('abort', cancel, { once: true })
    callerSignal?.addEventListener('abort', cancel, { once: true })
    void work.then((value) => {
      cleanup()
      resolve(value)
    }, (cause: unknown) => {
      cleanup()
      reject(cause)
    })
  })
}

/** Returns the stable cancellation error shared by every batch-search exit. */
function searchManyCancelled(): InkLayerError {
  return new InkLayerError('PDF_FEATURE_CANCELLED', 'PDF batch search was cancelled.', {
    operation: 'searchMany'
  })
}

/** Returns one structured batch-query validation failure. */
function searchManyFailure(message: string): InkLayerError {
  return new InkLayerError('PDF_FEATURE_FAILED', message, { operation: 'searchMany' })
}

/** Returns the stable cancellation error for text-range geometry work. */
function textRangesCancelled(): InkLayerError {
  return new InkLayerError('PDF_FEATURE_CANCELLED', 'PDF text range resolution was cancelled.', {
    operation: 'resolveTextRanges'
  })
}

/** Creates the default browser canvas allocation and PNG encoding port. */
export function createBrowserThumbnailSurfaceProvider(): PdfThumbnailSurfaceProvider {
  return {
    /** Allocates one detached HTML canvas and matching PNG encoder. */
    create(width, height) {
      if (typeof document === 'undefined') {
        throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'Thumbnail rendering requires a browser surface provider.', {
          operation: 'renderThumbnail'
        })
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (context === null) {
        throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'Canvas 2D is unavailable for thumbnail rendering.', {
          operation: 'renderThumbnail'
        })
      }
      return {
        canvas,
        context,
        encode: async () => await encodeCanvas(canvas),
        release: () => {
          canvas.width = 0
          canvas.height = 0
        }
      }
    }
  }
}

/** Encodes one HTML canvas as a PNG Blob. */
async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('Canvas PNG encoding returned no data.'))
      else resolve(blob)
    }, 'image/png')
  })
}

/** Calls PDF.js render with its required canvas and context pair. */
function renderThumbnailPage(
  page: PDFPageProxy,
  surface: PdfThumbnailSurface,
  viewport: ReturnType<PDFPageProxy['getViewport']>
): RenderTask {
  return page.render({ canvas: surface.canvas, canvasContext: surface.context, viewport })
}

/** Parses one PDF.js outline value without trusting recursive `any` fields. */
function parseRawOutlineItem(value: unknown): RawOutlineItem {
  if (!isRecord(value) || typeof value['title'] !== 'string'
    || typeof value['bold'] !== 'boolean' || typeof value['italic'] !== 'boolean'
    || !(value['color'] instanceof Uint8ClampedArray)
    || (value['url'] !== null && typeof value['url'] !== 'string')
    || !Array.isArray(value['items'])) {
    throw new TypeError('PDF outline item is malformed.')
  }
  const destination = value['dest']
  if (destination !== null && typeof destination !== 'string' && !Array.isArray(destination)) {
    throw new TypeError('PDF outline destination is malformed.')
  }
  return {
    title: value['title'],
    bold: value['bold'],
    italic: value['italic'],
    color: value['color'],
    dest: destination,
    url: value['url'],
    items: value['items']
  }
}

/** Returns whether a PDF content item contains rendered text. */
function isTextItem(value: unknown): value is TextItem {
  return isRecord(value) && typeof value['str'] === 'string' && typeof value['hasEOL'] === 'boolean'
}

/** Returns whether a value is a PDF.js indirect reference proxy. */
function isRefProxy(value: unknown): value is RefProxy {
  return isRecord(value) && Number.isSafeInteger(value['num']) && Number.isSafeInteger(value['gen'])
}

/** Returns whether a destination mode exposes a name. */
function isNameObject(value: unknown): value is { name: string } {
  return isRecord(value) && typeof value['name'] === 'string'
}

/** Returns whether an unknown value is a non-null record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Returns one finite number or undefined for PDF null placeholders. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Returns one positive finite number or undefined. */
function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value)
  return number !== undefined && number > 0 ? number : undefined
}

/** Converts a three-byte PDF outline color to a CSS hex value. */
function rgbToCss(color: Uint8ClampedArray): string {
  if (color.length < 3) return '#000000'
  return `#${[color[0], color[1], color[2]].map((part) =>
    (part ?? 0).toString(16).padStart(2, '0')).join('')}`
}

interface NormalizedSearchValue {
  text: string
  starts: number[]
  ends: number[]
}

interface SearchGrapheme {
  value: string
  start: number
  end: number
}

/** Normalizes Unicode search input while retaining source-offset projection. */
function normalizeSearchValue(
  value: string,
  matchCase: boolean,
  matchDiacritics: boolean
): NormalizedSearchValue {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  for (const grapheme of segmentSearchGraphemes(value)) {
    const compatibilityNormalized = grapheme.value.normalize('NFKC')
    const diacriticNormalized = matchDiacritics
      ? compatibilityNormalized
      : compatibilityNormalized.normalize('NFD').replace(/\p{M}/gu, '')
    const normalized = matchCase ? diacriticNormalized : diacriticNormalized.toLowerCase()
    text += normalized
    for (let index = 0; index < normalized.length; index += 1) {
      starts.push(grapheme.start)
      ends.push(grapheme.end)
    }
  }
  return { text, starts, ends }
}

/** Groups base code points with following combining marks for stable offsets. */
function segmentSearchGraphemes(value: string): SearchGrapheme[] {
  const graphemes: SearchGrapheme[] = []
  let offset = 0
  for (const codePoint of value) {
    const start = offset
    offset += codePoint.length
    const previous = graphemes.at(-1)
    if (/\p{M}/u.test(codePoint) && previous !== undefined) {
      previous.value += codePoint
      previous.end = offset
    } else {
      graphemes.push({ value: codePoint, start, end: offset })
    }
  }
  return graphemes
}

/** Returns whether a match is bounded by non-word characters. */
function isWholeWord(value: string, start: number, length: number): boolean {
  const before = start === 0 ? '' : value[start - 1] ?? ''
  const after = value[start + length] ?? ''
  const word = /[\p{L}\p{N}_]/u
  return !word.test(before) && !word.test(after)
}

/** Creates one single-line search result preview. */
function createSearchPreview(value: string, start: number, length: number): string {
  const from = Math.max(0, start - 36)
  const to = Math.min(value.length, start + length + 36)
  const fragment = value.slice(from, to).replace(/\s+/gu, ' ').trim()
  return `${from > 0 ? '…' : ''}${fragment}${to < value.length ? '…' : ''}`
}

/** Validates a zero-based page index against a loaded document. */
function validatePageIndex(pageIndex: number, pageCount: number): void {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'Page index is outside the loaded document.', {
      operation: 'documentFeature', pageIndex
    })
  }
}

/** Returns a conservative browser raster ratio. */
function defaultPixelRatio(): number {
  return typeof devicePixelRatio === 'number' ? Math.min(Math.max(devicePixelRatio, 1), 2) : 1
}

/** Returns a detached thumbnail container around the immutable Blob. */
function cloneThumbnail(value: PdfThumbnail): PdfThumbnail {
  return { ...value }
}
