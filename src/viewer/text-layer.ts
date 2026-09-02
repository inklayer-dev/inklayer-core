/**
 * @file PDF.js TextLayer lifecycle and browser-selection normalization.
 * @description Renders selectable page text, owns page-scoped listeners, and
 * converts one-page DOM Range rectangles to unscaled top-left page geometry.
 * @remarks It does not render contextual toolbars or create annotations.
 */

import type { PDFDocumentProxy, TextLayer } from 'pdfjs-dist'
import { InkLayerError } from '../domain/errors'
import type {
  PdfTextLayerAttachment,
  PdfDocumentTextSelection,
  PdfSearchMatch,
  PdfTextHighlightLayer,
  PdfTextRange,
  PdfTextSelection,
  PdfTextSelectionSource,
  PdfTextSelectionRect
} from './types'

interface TextLayerResources {
  pageIndex: number
  container: HTMLDivElement
  layer: TextLayer
  scale: number
  abortController: AbortController
  lastSelectionSignature: string
}

/** Owns all attached PDF.js TextLayers for one loaded document. */
export class PdfTextLayerController {
  private readonly document: PDFDocumentProxy
  private readonly onSelection: (selection: PdfTextSelection, source: PdfTextSelectionSource) => void
  private readonly onDocumentSelection: (
    selection: PdfDocumentTextSelection,
    source: PdfTextSelectionSource
  ) => void
  private readonly onSelectionCleared: () => void
  private readonly pages = new Map<number, TextLayerResources>()
  private readonly generations = new Map<number, number>()
  private destroyed = false
  private searchMatches: readonly PdfSearchMatch[] = []
  private activeSearchIndex: number | null = null
  private textHighlightLayers: readonly PdfTextHighlightLayer[] = []
  private lastDocumentSelectionSignature = ''

  /** Creates a TextLayer controller around one live document. */
  public constructor(
    document: PDFDocumentProxy,
    onSelection: (selection: PdfTextSelection, source: PdfTextSelectionSource) => void,
    onDocumentSelection: (
      selection: PdfDocumentTextSelection,
      source: PdfTextSelectionSource
    ) => void = () => undefined,
    onSelectionCleared: () => void = () => undefined
  ) {
    this.document = document
    this.onSelection = onSelection
    this.onDocumentSelection = onDocumentSelection
    this.onSelectionCleared = onSelectionCleared
  }

  /** Renders and owns one selectable TextLayer. */
  public async attach(attachment: PdfTextLayerAttachment): Promise<void> {
    this.assertActive('attachTextLayer')
    validateTextLayerAttachment(attachment, this.document.numPages)
    const generation = (this.generations.get(attachment.pageIndex) ?? 0) + 1
    this.generations.set(attachment.pageIndex, generation)
    this.detachResources(attachment.pageIndex)
    try {
      const [pdfjs, page] = await Promise.all([
        import('pdfjs-dist'),
        this.document.getPage(attachment.pageIndex + 1)
      ])
      this.assertCurrent(attachment.pageIndex, generation)
      const viewport = page.getViewport({
        scale: attachment.scale,
        ...(attachment.rotation === undefined ? {} : { rotation: attachment.rotation })
      })
      const container = attachment.container
      container.replaceChildren()
      container.classList.add('textLayer', 'inklayer-text-layer')
      container.dataset['inklayerTextPage'] = String(attachment.pageIndex)
      container.style.width = `${viewport.width}px`
      container.style.height = `${viewport.height}px`
      container.style.setProperty('--total-scale-factor', String(attachment.scale))
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport
      })
      const abortController = new AbortController()
      const resources: TextLayerResources = {
        pageIndex: attachment.pageIndex,
        container,
        layer,
        scale: attachment.scale,
        abortController,
        lastSelectionSignature: ''
      }
      this.pages.set(attachment.pageIndex, resources)
      this.attachSelectionListeners(resources)
      await layer.render()
      this.assertCurrent(attachment.pageIndex, generation)
      this.applyHighlights(resources)
    } catch (cause) {
      if (this.generations.get(attachment.pageIndex) === generation) {
        this.detachResources(attachment.pageIndex)
      }
      if (cause instanceof InkLayerError) throw cause
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF TextLayer rendering failed.', {
        operation: 'attachTextLayer', pageIndex: attachment.pageIndex, cause
      })
    }
  }

  /** Detaches one TextLayer and invalidates pending attachment work. */
  public detach(pageIndex: number): void {
    this.generations.set(pageIndex, (this.generations.get(pageIndex) ?? 0) + 1)
    this.detachResources(pageIndex)
  }

  /** Replaces search decorations and immediately refreshes attached pages. */
  public setSearchHighlights(
    matches: readonly PdfSearchMatch[],
    activeIndex: number | null
  ): void {
    this.assertActive('setSearchHighlights')
    if (activeIndex !== null && (!Number.isSafeInteger(activeIndex)
      || activeIndex < 0 || activeIndex >= matches.length)) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'Active PDF search result is invalid.', {
        operation: 'setSearchHighlights'
      })
    }
    this.searchMatches = matches.map((match) => ({ ...match }))
    this.activeSearchIndex = activeIndex
    for (const resources of this.pages.values()) this.applyHighlights(resources)
  }

  /** Atomically replaces ordered temporary layers and refreshes attached pages. */
  public setTextHighlightLayers(layers: readonly PdfTextHighlightLayer[]): void {
    this.assertActive('setTextHighlightLayers')
    this.textHighlightLayers = validateTextHighlightLayers(layers, this.document.numPages)
    for (const resources of this.pages.values()) this.applyHighlights(resources)
  }

  /** Clears all temporary layers, or only caller-selected layer identities. */
  public clearTextHighlightLayers(layerIds?: readonly string[]): void {
    this.assertActive('clearTextHighlightLayers')
    if (layerIds === undefined) {
      if (this.textHighlightLayers.length === 0) return
      this.textHighlightLayers = []
    } else {
      const ids = validateTextHighlightLayerIds(layerIds)
      const retained = this.textHighlightLayers.filter((layer) => !ids.has(layer.id))
      if (retained.length === this.textHighlightLayers.length) return
      this.textHighlightLayers = retained
    }
    for (const resources of this.pages.values()) this.applyHighlights(resources)
  }

  /** Clears native browser selection and permits the same text to be selected again. */
  public clearSelection(): void {
    const documents = new Set<Document>()
    for (const resources of this.pages.values()) {
      resources.lastSelectionSignature = ''
      documents.add(resources.container.ownerDocument)
    }
    this.lastDocumentSelectionSignature = ''
    for (const document of documents) document.getSelection()?.removeAllRanges()
  }

  /** Cancels and removes every attached TextLayer idempotently. */
  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.searchMatches = []
    this.textHighlightLayers = []
    for (const pageIndex of [...this.pages.keys()]) this.detach(pageIndex)
    this.generations.clear()
  }

  /** Attaches page-local completion listeners without a global selection singleton. */
  private attachSelectionListeners(resources: TextLayerResources): void {
    const signal = resources.abortController.signal
    const capture = (source: PdfTextSelectionSource): void => {
      queueMicrotask(() => this.captureSelection(resources, source))
    }
    resources.container.addEventListener('pointerup', () => capture('pointer'), { signal })
    resources.container.addEventListener('keyup', () => capture('keyboard'), { signal })
  }

  /** Emits one normalized same-page selection when browser geometry is usable. */
  private captureSelection(resources: TextLayerResources, source: PdfTextSelectionSource): void {
    if (this.destroyed || this.pages.get(resources.pageIndex) !== resources) return
    const selection = resources.container.ownerDocument.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount !== 1) {
      resources.lastSelectionSignature = ''
      this.lastDocumentSelectionSignature = ''
      this.onSelectionCleared()
      return
    }
    if (!nodeBelongsTo(resources.container, selection.anchorNode)
      || !nodeBelongsTo(resources.container, selection.focusNode)) {
      this.captureCrossPageSelection(selection, source)
      return
    }
    const text = selection.toString().trim()
    if (text.length === 0) return
    const range = selection.getRangeAt(0)
    const layerRect = resources.container.getBoundingClientRect()
    const rects = Array.from(range.getClientRects())
      .map((rect) => normalizeClientRect(rect, layerRect, resources.scale))
      .filter((rect): rect is PdfTextSelectionRect => rect !== null)
    if (rects.length === 0) return
    const signature = `${text}:${rects.map((rect) =>
      `${rect.x},${rect.y},${rect.width},${rect.height}`).join(';')}`
    if (signature === resources.lastSelectionSignature) return
    resources.lastSelectionSignature = signature
    this.onSelection({ pageIndex: resources.pageIndex, text, rects }, source)
  }

  /** Normalizes a DOM Range spanning two or more simultaneously attached pages. */
  private captureCrossPageSelection(selection: Selection, source: PdfTextSelectionSource): void {
    if (selection.rangeCount !== 1) return
    const range = selection.getRangeAt(0)
    const fragments: PdfTextSelection[] = []
    for (const resources of [...this.pages.values()].sort((left, right) =>
      left.pageIndex - right.pageIndex)) {
      if (!range.intersectsNode(resources.container)) continue
      const pageRange = range.cloneRange()
      if (!nodeBelongsTo(resources.container, range.startContainer)) {
        pageRange.setStart(resources.container, 0)
      }
      if (!nodeBelongsTo(resources.container, range.endContainer)) {
        pageRange.setEnd(resources.container, resources.container.childNodes.length)
      }
      const text = pageRange.toString().trim()
      const layerRect = resources.container.getBoundingClientRect()
      const rects = Array.from(pageRange.getClientRects())
        .map((rect) => normalizeClientRect(rect, layerRect, resources.scale))
        .filter((rect): rect is PdfTextSelectionRect => rect !== null)
      if (text.length > 0 && rects.length > 0) {
        fragments.push({ pageIndex: resources.pageIndex, text, rects })
      }
    }
    if (fragments.length < 2) return
    const text = selection.toString().trim()
    const signature = `${text}:${fragments.map((fragment) =>
      `${fragment.pageIndex}:${fragment.rects.length}`).join(';')}`
    if (signature === this.lastDocumentSelectionSignature) return
    this.lastDocumentSelectionSignature = signature
    this.onDocumentSelection({ text, fragments }, source)
  }

  /** Releases one attached layer without changing its generation. */
  private detachResources(pageIndex: number): void {
    const resources = this.pages.get(pageIndex)
    if (resources === undefined) return
    resources.abortController.abort()
    resources.layer.cancel()
    resources.container.replaceChildren()
    resources.container.classList.remove('textLayer', 'inklayer-text-layer')
    delete resources.container.dataset['inklayerTextPage']
    resources.container.style.removeProperty('--total-scale-factor')
    resources.container.style.removeProperty('width')
    resources.container.style.removeProperty('height')
    this.pages.delete(pageIndex)
  }

  /** Rebuilds legacy search and ordered caller-layer marks on one TextLayer. */
  private applyHighlights(resources: TextLayerResources): void {
    clearHighlightMarks(resources.container)
    const pageMatches = this.searchMatches
      .map((match, index) => ({ match, index }))
      .filter(({ match }) => match.pageIndex === resources.pageIndex)
      .sort((left, right) => right.match.start - left.match.start)
    for (const { match, index } of pageMatches) {
      markSearchTextRange(
        resources.container,
        match.start,
        match.length,
        index === this.activeSearchIndex
      )
    }
    for (const layer of this.textHighlightLayers) {
      if (layer.visible === false) continue
      const ranges = layer.ranges
        .map((range, index) => ({ range, index }))
        .filter(({ range }) => range.pageIndex === resources.pageIndex)
        .sort((left, right) => right.range.start - left.range.start
          || right.range.length - left.range.length || right.index - left.index)
      for (const { range, index } of ranges) {
        markLayerTextRange(
          resources.container,
          range.start,
          range.length,
          layer,
          index
        )
      }
    }
  }

  /** Throws if the controller no longer owns a live document. */
  private assertActive(operation: string): void {
    if (this.destroyed) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF TextLayer controller was destroyed.', {
        operation
      })
    }
  }

  /** Throws if asynchronous attachment lost ownership of the page. */
  private assertCurrent(pageIndex: number, generation: number): void {
    this.assertActive('attachTextLayer')
    if (this.generations.get(pageIndex) !== generation) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF TextLayer attachment was superseded.', {
        operation: 'attachTextLayer', pageIndex
      })
    }
  }
}

/** Removes Core-owned temporary wrappers while retaining PDF.js text nodes. */
function clearHighlightMarks(container: HTMLElement): void {
  const selector = 'mark[data-inklayer-search-match], mark[data-inklayer-highlight-layer]'
  for (const mark of container.querySelectorAll(selector)) {
    mark.replaceWith(...mark.childNodes)
  }
  container.normalize()
}

/** Wraps one legacy search result in a semantic mark. */
function markSearchTextRange(
  container: HTMLElement,
  start: number,
  length: number,
  active: boolean
): void {
  wrapTextRange(container, start, length, (document) => {
    const mark = document.createElement('mark')
    mark.dataset['inklayerSearchMatch'] = active ? 'active' : 'match'
    mark.className = active
      ? 'inklayer-search-highlight inklayer-search-highlight-active'
      : 'inklayer-search-highlight'
    return mark
  })
}

/** Wraps one caller-layer range with stable semantic identity and CSS tokens. */
function markLayerTextRange(
  container: HTMLElement,
  start: number,
  length: number,
  layer: PdfTextHighlightLayer,
  rangeIndex: number
): void {
  const active = layer.activeRangeIndex === rangeIndex
  wrapTextRange(container, start, length, (document) => {
    const mark = document.createElement('mark')
    mark.dataset['inklayerHighlightLayer'] = layer.id
    mark.dataset['inklayerHighlightRange'] = String(rangeIndex)
    mark.dataset['inklayerHighlightState'] = active ? 'active' : 'match'
    mark.className = active
      ? 'inklayer-text-highlight inklayer-text-highlight-active'
      : 'inklayer-text-highlight'
    mark.style.setProperty('--inklayer-text-highlight-color', layer.style.color)
    mark.style.setProperty(
      '--inklayer-text-highlight-active-color',
      layer.style.activeColor ?? layer.style.color
    )
    return mark
  })
}

/** Wraps the intersecting part of each TextLayer text node. */
function wrapTextRange(
  container: HTMLElement,
  start: number,
  length: number,
  createMark: (document: Document) => HTMLElement
): void {
  const document = container.ownerDocument
  const nodeFilter = document.defaultView?.NodeFilter
  const showText = nodeFilter?.SHOW_TEXT ?? 4
  const showElement = nodeFilter?.SHOW_ELEMENT ?? 1
  const walker = document.createTreeWalker(container, showText | showElement)
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let offset = 0
  let current = walker.nextNode()
  while (current !== null) {
    if (current.nodeType === 3) {
      const text = current.textContent ?? ''
      nodes.push({ node: current as Text, start: offset, end: offset + text.length })
      offset += text.length
    } else if ((current as Element).tagName === 'BR') {
      // PDF.js emits one presentation <br> for every TextItem.hasEOL. Search
      // offsets include that same line break even though HTMLElement.textContent
      // does not, so it must participate in the source-offset projection.
      offset += 1
    }
    current = walker.nextNode()
  }
  const end = start + length
  for (const entry of nodes) {
    const localStart = Math.max(start, entry.start) - entry.start
    const localEnd = Math.min(end, entry.end) - entry.start
    if (localStart >= localEnd) continue
    const range = document.createRange()
    range.setStart(entry.node, localStart)
    range.setEnd(entry.node, localEnd)
    range.surroundContents(createMark(document))
  }
}

const MAX_TEXT_HIGHLIGHT_LAYER_ID_LENGTH = 512
const MAX_TEXT_HIGHLIGHT_COLOR_LENGTH = 256

/** Validates and deeply detaches one atomic temporary-layer replacement. */
function validateTextHighlightLayers(
  layers: readonly PdfTextHighlightLayer[],
  pageCount: number
): PdfTextHighlightLayer[] {
  if (!Array.isArray(layers)) throw invalidTextHighlightLayers('Layers must be an array.')
  const ids = new Set<string>()
  return layers.map((layer) => {
    if (typeof layer !== 'object' || layer === null
      || typeof layer.id !== 'string' || layer.id.trim().length === 0
      || layer.id.length > MAX_TEXT_HIGHLIGHT_LAYER_ID_LENGTH || ids.has(layer.id)
      || !Array.isArray(layer.ranges)
      || typeof layer.style !== 'object' || layer.style === null
      || !isCssColor(layer.style.color)
      || (layer.style.activeColor !== undefined && !isCssColor(layer.style.activeColor))
      || (layer.visible !== undefined && typeof layer.visible !== 'boolean')) {
      throw invalidTextHighlightLayers('Temporary text-highlight layer is invalid.')
    }
    ids.add(layer.id)
    const ranges = layer.ranges.map((range: PdfTextRange) => {
      if (typeof range !== 'object' || range === null
        || !Number.isSafeInteger(range.pageIndex)
        || !Number.isSafeInteger(range.start)
        || !Number.isSafeInteger(range.length)
        || range.pageIndex < 0 || range.pageIndex >= pageCount
        || range.start < 0 || range.length <= 0
        || !Number.isSafeInteger(range.start + range.length)) {
        throw invalidTextHighlightLayers('Temporary text-highlight range is invalid.')
      }
      return { pageIndex: range.pageIndex, start: range.start, length: range.length }
    })
    const activeRangeIndex = layer.activeRangeIndex ?? null
    if (activeRangeIndex !== null && (!Number.isSafeInteger(activeRangeIndex)
      || activeRangeIndex < 0 || activeRangeIndex >= ranges.length)) {
      throw invalidTextHighlightLayers('Active temporary text-highlight range is invalid.')
    }
    return {
      id: layer.id,
      ranges,
      style: {
        color: layer.style.color,
        ...(layer.style.activeColor === undefined
          ? {}
          : { activeColor: layer.style.activeColor })
      },
      activeRangeIndex,
      visible: layer.visible ?? true
    }
  })
}

/** Validates named-layer clearing without mutating retained state. */
function validateTextHighlightLayerIds(layerIds: readonly string[]): Set<string> {
  if (!Array.isArray(layerIds)) {
    throw invalidTextHighlightLayers('Layer IDs must be an array.', 'clearTextHighlightLayers')
  }
  const ids = new Set<string>()
  for (const id of layerIds) {
    if (typeof id !== 'string' || id.trim().length === 0
      || id.length > MAX_TEXT_HIGHLIGHT_LAYER_ID_LENGTH) {
      throw invalidTextHighlightLayers(
        'Temporary text-highlight layer ID is invalid.',
        'clearTextHighlightLayers'
      )
    }
    ids.add(id)
  }
  return ids
}

/** Checks one bounded CSS color, using the host parser when available. */
function isCssColor(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0
    || value.length > MAX_TEXT_HIGHLIGHT_COLOR_LENGTH) return false
  return typeof CSS === 'undefined' || typeof CSS.supports !== 'function'
    || CSS.supports('color', value)
}

/** Creates one structured layer validation failure. */
function invalidTextHighlightLayers(
  message: string,
  operation = 'setTextHighlightLayers'
): InkLayerError {
  return new InkLayerError('PDF_FEATURE_FAILED', message, {
    operation
  })
}

/** Validates one public TextLayer page attachment. */
function validateTextLayerAttachment(
  attachment: PdfTextLayerAttachment,
  pageCount: number
): void {
  if (!Number.isSafeInteger(attachment.pageIndex) || attachment.pageIndex < 0
    || attachment.pageIndex >= pageCount || !Number.isFinite(attachment.scale)
    || attachment.scale <= 0 || typeof attachment.container !== 'object'
    || attachment.container === null
    || typeof attachment.container.replaceChildren !== 'function') {
    throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF TextLayer attachment is invalid.', {
      operation: 'attachTextLayer', pageIndex: attachment.pageIndex
    })
  }
}

/** Returns whether a selection endpoint is contained by one TextLayer. */
function nodeBelongsTo(container: HTMLElement, node: Node | null): boolean {
  return node !== null && (node === container || container.contains(node))
}

/** Converts and clips one viewport rectangle to unscaled page coordinates. */
function normalizeClientRect(
  rect: DOMRect,
  layer: DOMRect,
  scale: number
): PdfTextSelectionRect | null {
  const left = Math.max(rect.left, layer.left)
  const top = Math.max(rect.top, layer.top)
  const right = Math.min(rect.right, layer.right)
  const bottom = Math.min(rect.bottom, layer.bottom)
  if (right - left < 0.5 || bottom - top < 0.5) return null
  return {
    x: (left - layer.left) / scale,
    y: (top - layer.top) / scale,
    width: (right - left) / scale,
    height: (bottom - top) / scale
  }
}
