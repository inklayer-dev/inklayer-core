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
      this.applySearchHighlights(resources)
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
    for (const resources of this.pages.values()) this.applySearchHighlights(resources)
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

  /** Maps normalized page offsets to the rendered TextLayer text nodes. */
  private applySearchHighlights(resources: TextLayerResources): void {
    clearSearchMarks(resources.container)
    const pageMatches = this.searchMatches
      .map((match, index) => ({ match, index }))
      .filter(({ match }) => match.pageIndex === resources.pageIndex)
      .sort((left, right) => right.match.start - left.match.start)
    for (const { match, index } of pageMatches) {
      markTextRange(
        resources.container,
        match.start,
        match.length,
        index === this.activeSearchIndex
      )
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

/** Removes Core-owned search wrappers while retaining PDF.js text nodes. */
function clearSearchMarks(container: HTMLElement): void {
  for (const mark of container.querySelectorAll('mark[data-inklayer-search-match]')) {
    mark.replaceWith(...mark.childNodes)
  }
  container.normalize()
}

/** Wraps the intersecting part of each TextLayer text node in a semantic mark. */
function markTextRange(
  container: HTMLElement,
  start: number,
  length: number,
  active: boolean
): void {
  const document = container.ownerDocument
  const nodeFilter = document.defaultView?.NodeFilter.SHOW_TEXT ?? 4
  const walker = document.createTreeWalker(container, nodeFilter)
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let offset = 0
  let current = walker.nextNode()
  while (current !== null) {
    const text = current.textContent ?? ''
    nodes.push({ node: current as Text, start: offset, end: offset + text.length })
    offset += text.length
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
    const mark = document.createElement('mark')
    mark.dataset['inklayerSearchMatch'] = active ? 'active' : 'match'
    mark.className = active
      ? 'inklayer-search-highlight inklayer-search-highlight-active'
      : 'inklayer-search-highlight'
    range.surroundContents(mark)
  }
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
