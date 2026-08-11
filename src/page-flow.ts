/**
 * @file Continuous multi-page PDF viewport controller.
 * @description Owns page placeholders, overscanned PDF Canvas rendering,
 * TextLayer and Annotation overlay attachment, current-page tracking, and
 * teardown without framework lifecycle duplication.
 */

import type { AnnotationEngine } from './annotation/annotation-engine'
import { InkLayerError } from './domain/errors'
import type { PdfViewerEngine, PdfViewerScale, PdfZoomState } from './viewer/types'
import { resolvePdfViewerScale, stepPdfViewerScale } from './viewer/zoom'

/** Continuous page-flow construction options. */
export interface PdfPageFlowOptions {
  /** Ready Viewer supplying page rasters and TextLayers. */
  viewer: PdfViewerEngine
  /** Optional Annotation Engine attached to visible page overlays. */
  annotations?: AnnotationEngine
  /** Scroll container receiving Core-owned page shells. */
  container: HTMLDivElement
  /** Numeric or adaptive PDF layout scale; defaults to one. */
  scale?: PdfViewerScale
  /** Physical pixels per Canvas layout pixel; defaults to device ratio capped at two. */
  pixelRatio?: number
  /** Vertical layout gap in CSS pixels; defaults to 16. */
  pageGap?: number
  /** Intersection root margin used for render-ahead; defaults to one viewport. */
  overscan?: string
  /** Receives zero-based current-page changes. */
  onCurrentPageChanged?: (pageIndex: number) => void
  /** Receives structured asynchronous mount failures. */
  onError?: (error: InkLayerError) => void
}

/** Live continuous page-flow commands. */
export interface PdfPageFlowController {
  /** Returns the current zero-based page inferred from visibility. */
  getCurrentPage(): number
  /** Scrolls one page shell into view without replacing document state. */
  scrollToPage(pageIndex: number, behavior?: ScrollBehavior): void
  /** Rebuilds page geometry and visible layers at one new scale. */
  setScale(scale: PdfViewerScale): Promise<void>
  /** Returns requested and resolved page-flow scale state. */
  getScale(): PdfZoomState
  /** Applies one bounded numeric zoom-in step. */
  zoomIn(): Promise<void>
  /** Applies one bounded numeric zoom-out step. */
  zoomOut(): Promise<void>
  /** Releases observers, renders, TextLayers, annotation pages, and DOM. */
  destroy(): void
}

interface PageShell {
  pageIndex: number
  root: HTMLDivElement
  canvas: HTMLCanvasElement
  textLayer: HTMLDivElement
  annotationLayer: HTMLDivElement
  mounted: boolean
  generation: number
}

/** Creates and mounts one Core-owned continuous page flow. */
export async function createPdfPageFlow(
  options: PdfPageFlowOptions
): Promise<PdfPageFlowController> {
  const controller = new PdfPageFlowControllerImpl(options)
  await controller.initialize()
  return controller
}

/** Concrete observer-driven continuous page-flow controller. */
class PdfPageFlowControllerImpl implements PdfPageFlowController {
  private readonly options: PdfPageFlowOptions
  private readonly shells = new Map<number, PageShell>()
  private observer: IntersectionObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private scaleValue: PdfViewerScale
  private scale: number
  private readonly minScale = 0.1
  private readonly maxScale = 10
  private readonly zoomStep = 0.1
  private readonly pixelRatio: number
  private currentPage = 0
  private destroyed = false
  private scrollListener: (() => void) | null = null

  /** Validates browser and ready-document requirements. */
  public constructor(options: PdfPageFlowOptions) {
    const snapshot = options.viewer.getSnapshot()
    if (snapshot.status !== 'ready' || snapshot.document === null
      || typeof IntersectionObserver !== 'function') {
      throw pageFlowError('A ready browser Viewer and IntersectionObserver are required.')
    }
    this.options = options
    this.scaleValue = options.scale ?? 1
    this.scale = typeof this.scaleValue === 'number' ? validateScale(this.scaleValue) : 1
    this.pixelRatio = validatePixelRatio(options.pixelRatio
      ?? Math.min(globalThis.devicePixelRatio || 1, 2))
  }

  /** Creates placeholders before observing visibility. */
  public async initialize(resolveScale = true): Promise<void> {
    const handle = this.options.viewer.getSnapshot().document
    if (handle === null) throw pageFlowError('The PDF document was replaced before page flow initialized.')
    const container = this.options.container
    if (resolveScale) this.scale = await this.resolveScale(this.scaleValue)
    container.replaceChildren()
    container.classList.add('inklayer-page-flow')
    container.style.display = 'grid'
    container.style.gap = `${this.options.pageGap ?? 16}px`
    container.style.alignItems = 'start'
    for (let pageIndex = 0; pageIndex < handle.numPages; pageIndex += 1) {
      const page = await handle.document.getPage(pageIndex + 1)
      this.assertActive()
      const viewport = page.getViewport({ scale: this.scale })
      const shell = createPageShell(container.ownerDocument, pageIndex, viewport.width, viewport.height)
      this.shells.set(pageIndex, shell)
      container.append(shell.root)
    }
    this.observer = new IntersectionObserver((entries) => this.handleIntersections(entries), {
      root: container,
      rootMargin: this.options.overscan ?? '100% 0px',
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1]
    })
    for (const shell of this.shells.values()) this.observer.observe(shell.root)
    this.scrollListener = () => this.updateCurrentPageFromViewport()
    container.addEventListener('scroll', this.scrollListener, { passive: true })
    if (this.resizeObserver === null && typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => {
        if (!isAdaptiveScale(this.scaleValue) || this.destroyed) return
        void this.setScale(this.scaleValue).catch((cause: unknown) => {
          this.options.onError?.(normalizePageFlowError(cause, this.currentPage))
        })
      })
      this.resizeObserver.observe(container)
    }
    await this.mountPage(0)
  }

  /** Returns current visibility-derived page identity. */
  public getCurrentPage(): number {
    return this.currentPage
  }

  /** Scrolls directly to a stable page placeholder. */
  public scrollToPage(pageIndex: number, behavior: ScrollBehavior = 'auto'): void {
    this.assertPage(pageIndex)
    this.setCurrentPage(pageIndex)
    this.shells.get(pageIndex)?.root.scrollIntoView({ block: 'start', behavior })
  }

  /** Rebuilds all page placeholders while preserving current page identity. */
  public async setScale(scale: PdfViewerScale): Promise<void> {
    this.assertActive()
    const nextScale = await this.resolveScale(scale)
    if (nextScale === this.scale && scale === this.scaleValue) return
    const pageIndex = this.currentPage
    this.scaleValue = scale
    this.scale = nextScale
    this.releasePages()
    await this.initialize(false)
    this.scrollToPage(pageIndex)
  }

  /** Returns a detached scale state for framework toolbar projection. */
  public getScale(): PdfZoomState {
    return {
      value: this.scaleValue,
      scale: this.scale,
      percentage: Math.round(this.scale * 100),
      minScale: this.minScale,
      maxScale: this.maxScale
    }
  }

  /** Applies one numeric page-flow zoom-in step. */
  public async zoomIn(): Promise<void> {
    await this.setScale(stepPdfViewerScale(
      this.scale, 'in', this.zoomStep, this.minScale, this.maxScale
    ))
  }

  /** Applies one numeric page-flow zoom-out step. */
  public async zoomOut(): Promise<void> {
    await this.setScale(stepPdfViewerScale(
      this.scale, 'out', this.zoomStep, this.minScale, this.maxScale
    ))
  }

  /** Releases every page resource and consumer-owned container metadata. */
  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.releasePages()
    const container = this.options.container
    container.replaceChildren()
    container.classList.remove('inklayer-page-flow')
    container.style.removeProperty('display')
    container.style.removeProperty('gap')
    container.style.removeProperty('align-items')
  }

  /** Mounts intersecting pages and frees pages beyond the overscan margin. */
  private handleIntersections(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const pageIndex = Number(entry.target.getAttribute('data-inklayer-flow-page'))
      if (entry.isIntersecting) {
        void this.mountPage(pageIndex).catch((cause: unknown) => {
          this.options.onError?.(normalizePageFlowError(cause, pageIndex))
        })
      } else {
        this.unmountPage(pageIndex)
      }
    }
  }

  /** Renders and attaches all three page layers once for one generation. */
  private async mountPage(pageIndex: number): Promise<void> {
    const shell = this.shells.get(pageIndex)
    if (shell === undefined || shell.mounted || this.destroyed) return
    shell.mounted = true
    const generation = shell.generation + 1
    shell.generation = generation
    try {
      const raster = await this.options.viewer.renderPageRaster({
        pageIndex,
        scale: this.scale,
        pixelRatio: this.pixelRatio,
        target: 'viewer'
      })
      if (this.destroyed || shell.generation !== generation || !shell.mounted) return
      const bitmap = await createImageBitmap(raster.blob)
      try {
        shell.canvas.width = Math.ceil(raster.width * raster.pixelRatio)
        shell.canvas.height = Math.ceil(raster.height * raster.pixelRatio)
        shell.canvas.style.width = `${raster.width}px`
        shell.canvas.style.height = `${raster.height}px`
        shell.canvas.getContext('2d')?.drawImage(bitmap, 0, 0, shell.canvas.width, shell.canvas.height)
      } finally {
        bitmap.close()
      }
      await this.options.viewer.attachTextLayer({
        pageIndex,
        container: shell.textLayer,
        scale: this.scale
      })
      await this.options.annotations?.attachPage({
        pageIndex,
        container: shell.annotationLayer,
        width: raster.width / this.scale,
        height: raster.height / this.scale,
        scale: this.scale
      })
      shell.root.dataset['inklayerFlowMounted'] = 'true'
    } catch (cause) {
      shell.mounted = false
      delete shell.root.dataset['inklayerFlowMounted']
      if (!this.destroyed) throw cause
    }
  }

  /** Frees one overscan-exited page but retains its stable placeholder. */
  private unmountPage(pageIndex: number): void {
    const shell = this.shells.get(pageIndex)
    if (shell === undefined || !shell.mounted) return
    shell.mounted = false
    shell.generation += 1
    this.options.viewer.detachTextLayer(pageIndex)
    this.options.annotations?.detachPage(pageIndex)
    shell.canvas.width = 1
    shell.canvas.height = 1
    shell.canvas.style.removeProperty('width')
    shell.canvas.style.removeProperty('height')
    delete shell.root.dataset['inklayerFlowMounted']
  }

  /** Releases observer and every attached page while retaining controller validity. */
  private releasePages(): void {
    if (this.scrollListener !== null) {
      this.options.container.removeEventListener('scroll', this.scrollListener)
      this.scrollListener = null
    }
    this.observer?.disconnect()
    this.observer = null
    for (const pageIndex of this.shells.keys()) this.unmountPage(pageIndex)
    this.shells.clear()
  }

  /** Chooses the page occupying the largest area of the actual scroll viewport. */
  private updateCurrentPageFromViewport(): void {
    const viewport = this.options.container.getBoundingClientRect()
    let bestPage = this.currentPage
    let bestVisibleHeight = -1
    for (const shell of this.shells.values()) {
      const rect = shell.root.getBoundingClientRect()
      const visibleHeight = Math.max(0,
        Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top))
      if (visibleHeight > bestVisibleHeight) {
        bestVisibleHeight = visibleHeight
        bestPage = shell.pageIndex
      }
    }
    this.setCurrentPage(bestPage)
  }

  /** Resolves one requested scale against the current page and scroll viewport. */
  private async resolveScale(value: PdfViewerScale): Promise<number> {
    if (typeof value === 'number') return validateScale(value)
    const handle = this.options.viewer.getSnapshot().document
    if (handle === null) throw pageFlowError('A ready PDF document is required to resolve scale.')
    const page = await handle.document.getPage(this.currentPage + 1)
    const viewport = page.getViewport({ scale: 1 })
    const container = this.options.container
    const bounds = container.getBoundingClientRect()
    const resolved = resolvePdfViewerScale(value, {
      containerWidth: container.clientWidth || bounds.width,
      containerHeight: container.clientHeight || bounds.height,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
      horizontalPadding: 28,
      verticalPadding: 28
    })
    return Math.min(this.maxScale, Math.max(this.minScale, resolved))
  }

  /** Updates current page only when the best visible page changes. */
  private setCurrentPage(pageIndex: number): void {
    if (!Number.isSafeInteger(pageIndex) || pageIndex === this.currentPage) return
    this.currentPage = pageIndex
    this.options.onCurrentPageChanged?.(pageIndex)
  }

  /** Rejects commands after destruction. */
  private assertActive(): void {
    if (this.destroyed) throw pageFlowError('PDF page flow has been destroyed.')
  }

  /** Rejects navigation outside current document placeholders. */
  private assertPage(pageIndex: number): void {
    this.assertActive()
    if (!Number.isSafeInteger(pageIndex) || !this.shells.has(pageIndex)) {
      throw pageFlowError('PDF page-flow target is invalid.', pageIndex)
    }
  }
}

/** Creates one stable layered page placeholder. */
function createPageShell(
  document: Document,
  pageIndex: number,
  width: number,
  height: number
): PageShell {
  const root = document.createElement('div')
  root.className = 'inklayer-page-flow-page'
  root.dataset['inklayerFlowPage'] = String(pageIndex)
  root.style.position = 'relative'
  root.style.width = `${width}px`
  root.style.height = `${height}px`
  root.style.margin = '0 auto'
  const canvas = document.createElement('canvas')
  canvas.className = 'inklayer-page-flow-canvas'
  canvas.setAttribute('aria-label', `PDF page ${pageIndex + 1}`)
  const textLayer = document.createElement('div')
  textLayer.className = 'inklayer-page-flow-text'
  const annotationLayer = document.createElement('div')
  annotationLayer.className = 'inklayer-page-flow-annotations'
  for (const layer of [canvas, textLayer, annotationLayer]) {
    layer.style.position = 'absolute'
    layer.style.inset = '0'
  }
  root.append(canvas, textLayer, annotationLayer)
  return { pageIndex, root, canvas, textLayer, annotationLayer, mounted: false, generation: 0 }
}

/** Validates a bounded document scale. */
function validateScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10) {
    throw pageFlowError('PDF page-flow scale is invalid.')
  }
  return scale
}

/** Returns whether container changes must re-resolve one requested preset. */
function isAdaptiveScale(scale: PdfViewerScale): boolean {
  return scale === 'auto' || scale === 'page-fit'
    || scale === 'page-width' || scale === 'page-height'
}

/** Validates a bounded raster pixel ratio. */
function validatePixelRatio(pixelRatio: number): number {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0 || pixelRatio > 4) {
    throw pageFlowError('PDF page-flow pixel ratio is invalid.')
  }
  return pixelRatio
}

/** Creates a page-flow feature failure with safe page context. */
function pageFlowError(message: string, pageIndex?: number): InkLayerError {
  return new InkLayerError('PDF_FEATURE_FAILED', message, {
    operation: 'PdfPageFlow',
    ...(pageIndex === undefined ? {} : { pageIndex })
  })
}

/** Preserves Core failures and normalizes provider failures for async callbacks. */
function normalizePageFlowError(cause: unknown, pageIndex: number): InkLayerError {
  return cause instanceof InkLayerError
    ? cause
    : new InkLayerError('PDF_FEATURE_FAILED', 'PDF page-flow rendering failed.', {
      operation: 'PdfPageFlow.mountPage',
      pageIndex,
      cause
    })
}
