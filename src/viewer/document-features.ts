/**
 * @file Generation-scoped PDF document feature controller.
 * @description Owns outline resolution, normalized full-document search,
 * thumbnail rendering/cache, cancellation, and platform surface cleanup.
 * @remarks It exposes no product panels and becomes invalid when its document
 * generation is replaced or destroyed.
 */

import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RefProxy,
  RenderTask,
  TextItem
} from 'pdfjs-dist/types/src/display/api'
import { InkLayerError } from '../domain/errors'
import type {
  PdfNavigationTarget,
  PdfOutlineItem,
  PdfPageRaster,
  PdfPageRasterOptions,
  PdfSearchMatch,
  PdfSearchOptions,
  PdfSearchResult,
  PdfThumbnail,
  PdfThumbnailOptions,
  PdfThumbnailSurface,
  PdfThumbnailSurfaceProvider
} from './types'

interface RawOutlineItem {
  title: string
  bold: boolean
  italic: boolean
  color: Uint8ClampedArray
  dest: string | readonly unknown[] | null
  url: string | null
  items: readonly unknown[]
}

/** Owns asynchronous document sub-features for one loaded generation. */
export class PdfDocumentFeatures {
  private readonly document: PDFDocumentProxy
  private readonly surfaceProvider: PdfThumbnailSurfaceProvider
  private readonly controller = new AbortController()
  private readonly textCache = new Map<number, Promise<string>>()
  private readonly thumbnailCache = new Map<string, Promise<PdfThumbnail>>()
  private readonly renderTasks = new Set<RenderTask>()

  /** Creates a controller around one live PDF.js document. */
  public constructor(
    document: PDFDocumentProxy,
    surfaceProvider: PdfThumbnailSurfaceProvider | undefined
  ) {
    this.document = document
    this.surfaceProvider = surfaceProvider ?? createBrowserThumbnailSurfaceProvider()
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
    const maxResults = options.maxResults ?? 1_000
    if (!Number.isSafeInteger(maxResults) || maxResults <= 0 || maxResults > 100_000) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'Search result limit is invalid.', {
        operation: 'search'
      })
    }
    const needle = normalizeSearchValue(normalizedQuery, options.matchCase ?? false)
    const matches: PdfSearchMatch[] = []
    try {
      for (let pageIndex = 0; pageIndex < this.document.numPages; pageIndex += 1) {
        const pageText = await this.getPageText(pageIndex)
        this.assertActive('search')
        const haystack = normalizeSearchValue(pageText, options.matchCase ?? false)
        let cursor = 0
        let pageMatchIndex = 0
        while (cursor <= haystack.length - needle.length) {
          const start = haystack.indexOf(needle, cursor)
          if (start < 0) break
          cursor = start + Math.max(needle.length, 1)
          if ((options.wholeWord ?? false) && !isWholeWord(haystack, start, needle.length)) continue
          matches.push({
            pageIndex,
            matchIndex: pageMatchIndex,
            start,
            length: needle.length,
            preview: createSearchPreview(pageText, start, needle.length)
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
    const cached = this.textCache.get(pageIndex)
    if (cached !== undefined) return await cached
    const pending = this.extractPageText(pageIndex)
    this.textCache.set(pageIndex, pending)
    try {
      return await pending
    } catch (cause) {
      this.textCache.delete(pageIndex)
      throw cause
    }
  }

  /** Extracts one page's text with stable line separators. */
  private async extractPageText(pageIndex: number): Promise<string> {
    validatePageIndex(pageIndex, this.document.numPages)
    const page = await this.document.getPage(pageIndex + 1)
    this.assertActive('search')
    const content = await page.getTextContent()
    this.assertActive('search')
    return content.items.map((item) => isTextItem(item)
      ? `${item.str}${item.hasEOL ? '\n' : ''}`
      : '').join('')
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

/** Normalizes Unicode search input with optional case folding. */
function normalizeSearchValue(value: string, matchCase: boolean): string {
  const normalized = value.normalize('NFKC')
  return matchCase ? normalized : normalized.toLocaleLowerCase()
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
