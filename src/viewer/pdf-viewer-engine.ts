/**
 * @file PDF.js-backed Viewer Engine implementation.
 * @description Owns dynamic PDF.js loading, document generations, optional web
 * rendering, Range transport, subscriptions, and complete idempotent teardown.
 */

import type {
  PDFDataRangeTransport,
  PDFDocumentLoadingTask,
  PDFDocumentProxy
} from 'pdfjs-dist'
import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api'
import type * as PdfJsModule from 'pdfjs-dist'
import type { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import bundledPdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url&no-inline'
import { InkLayerError } from '../domain/errors'
import { PdfDocumentFeatures } from './document-features'
import { PdfTextLayerController } from './text-layer'
import type { PdfViewerEvent, PdfViewerListener } from './events'
import { createPdfRangeTransport } from './range-transport'
import type {
  PdfCanvasWatermarkRequest,
  PdfActiveTextSelection,
  PdfDataSource,
  PdfDocumentHandle,
  PdfDocumentPermissions,
  PdfLoadProgress,
  PdfPasswordReason,
  PdfSource,
  PdfNavigationTarget,
  PdfOutlineItem,
  PdfPageRaster,
  PdfPageRasterOptions,
  PdfSearchOptions,
  PdfSearchMatch,
  PdfSearchResult,
  PdfThumbnail,
  PdfThumbnailOptions,
  PdfTextLayerAttachment,
  PdfUrlSource,
  PdfViewerEngine,
  PdfViewerEngineOptions,
  PdfViewerLayoutMode,
  PdfViewerScale,
  PdfViewerSnapshot,
  PdfWatermarkSpec,
  PdfZoomState
} from './types'
import { acquirePdfJsWorkerConfiguration } from './worker-config'
import { drawCanvasWatermark, normalizeWatermarkSpec } from './watermark'
import {
  createPdfZoomGestureController,
  stepPdfViewerScale,
  type PdfZoomGestureController
} from './zoom'

interface PdfJsPasswordResponses {
  NEED_PASSWORD: number
  INCORRECT_PASSWORD: number
}

interface PdfJsPermissionFlags {
  PRINT: number
  MODIFY_CONTENTS: number
  COPY: number
  MODIFY_ANNOTATIONS: number
  FILL_INTERACTIVE_FORMS: number
  COPY_FOR_ACCESSIBILITY: number
  ASSEMBLE: number
  PRINT_HIGH_QUALITY: number
}

/** Creates one SSR-safe Viewer Engine without importing PDF.js until `load`. */
export function createPdfViewerEngine(options: PdfViewerEngineOptions = {}): PdfViewerEngine {
  return new PdfViewerEngineImpl(options)
}

/** Concrete generation-guarded PDF.js Viewer Engine. */
class PdfViewerEngineImpl implements PdfViewerEngine {
  private readonly options: PdfViewerEngineOptions & { workerSrc: string }
  private readonly listeners = new Set<PdfViewerListener>()
  private snapshot: PdfViewerSnapshot = {
    status: 'idle',
    generation: 0,
    document: null,
    error: null,
    progress: null
  }
  private loadingTask: PDFDocumentLoadingTask | null = null
  private rangeTransport: PDFDataRangeTransport | null = null
  private rangeAbortController: AbortController | null = null
  private viewer: PDFViewer | null = null
  private linkService: PDFLinkService | null = null
  private eventBus: EventBus | null = null
  private releaseWorker: (() => void) | null = null
  private documentFeatures: PdfDocumentFeatures | null = null
  private textLayers: PdfTextLayerController | null = null
  private passwordRequest: {
    requestId: string
    generation: number
    updatePassword: (password: string) => void
  } | null = null
  private passwordAttempt = 0
  private passwordProtected = false
  private pendingLoadError: InkLayerError | null = null
  private watermark: PdfWatermarkSpec | null = null
  private textSelection: PdfActiveTextSelection | null = null
  private readonly minScale: number
  private readonly maxScale: number
  private readonly zoomStep: number
  private zoomGesture: PdfZoomGestureController | null = null
  private scaleChangingListener: ((event: { scale: number; presetValue?: string }) => void) | null = null
  private lastScaleSignature = ''
  private destroyed = false

  /** Creates one engine after validating environment-neutral options. */
  public constructor(options: PdfViewerEngineOptions) {
    if (options.workerSrc !== undefined && options.workerSrc.trim().length === 0) {
      throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'A non-empty PDF.js workerSrc is required.', {
        operation: 'createPdfViewerEngine'
      })
    }
    const minScale = options.minScale ?? 0.1
    const maxScale = options.maxScale ?? 10
    const zoomStep = options.zoomStep ?? 0.1
    if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || !Number.isFinite(zoomStep)
      || minScale <= 0 || maxScale < minScale || maxScale > 10 || zoomStep <= 0) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF Viewer zoom limits are invalid.', {
        operation: 'createPdfViewerEngine'
      })
    }
    this.minScale = minScale
    this.maxScale = maxScale
    this.zoomStep = zoomStep
    this.options = {
      ...options,
      workerSrc: options.workerSrc?.trim() ?? bundledPdfWorkerUrl
    }
  }

  /** Loads one PDF source and prevents stale generations from changing state. */
  public async load(source: PdfSource): Promise<PdfDocumentHandle> {
    this.assertActive('load')
    const normalizedSource = normalizePdfSource(source)
    const generation = this.snapshot.generation + 1
    this.passwordAttempt = 0
    this.passwordProtected = false
    this.pendingLoadError = null
    const initialProgress = createInitialLoadProgress(normalizedSource, generation)
    this.snapshot = {
      status: 'loading', generation, document: null, error: null, progress: initialProgress
    }
    this.emitState()
    this.emit({ type: 'loadProgress', progress: initialProgress })
    await this.releaseDocumentResources()

    let rangeError: InkLayerError | null = null
    try {
      const pdfjs = await loadPdfJsModule()
      this.assertCurrentGeneration(generation)
      if (this.releaseWorker === null) {
        this.releaseWorker = acquirePdfJsWorkerConfiguration(
          this.options.workerSrc,
          pdfjs.GlobalWorkerOptions
        )
      }
      await this.ensureWebViewer()
      this.assertCurrentGeneration(generation)
      const parameters = await this.createDocumentParameters(normalizedSource, pdfjs, generation, (error) => {
        rangeError = error
        if (this.isCurrentGeneration(generation)) {
          const failedTask = this.loadingTask
          this.loadingTask = null
          void failedTask?.destroy()
        }
      })
      this.assertCurrentGeneration(generation)
      const loadingTask = pdfjs.getDocument(parameters)
      this.loadingTask = loadingTask
      if (!('range' in parameters)) {
        loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          this.reportDirectLoadProgress(generation, loaded, total)
        }
      }
      loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
        this.requestPassword(generation, updatePassword, reason, pdfjs.PasswordResponses)
      }
      const documentProxy = await loadingTask.promise
      this.assertCurrentGeneration(generation)
      this.viewer?.setDocument(documentProxy)
      this.linkService?.setDocument(documentProxy)
      this.documentFeatures = new PdfDocumentFeatures(
        documentProxy,
        this.options.thumbnailSurfaceProvider
      )
      this.textLayers = new PdfTextLayerController(documentProxy, (selection) => {
        this.setTextSelection({ kind: 'page', selection })
        this.emit({ type: 'textSelected', selection })
      }, (selection) => {
        this.setTextSelection({ kind: 'document', selection })
        this.emit({ type: 'documentTextSelected', selection })
      }, () => {
        this.resetTextSelection()
      })
      const permissions = normalizeDocumentPermissions(
        await documentProxy.getPermissions(),
        pdfjs.PermissionFlag
      )
      this.assertCurrentGeneration(generation)
      const handle = createDocumentHandle(documentProxy, permissions, this.passwordProtected)
      this.snapshot = { status: 'ready', generation, document: handle, error: null, progress: null }
      this.emitState()
      this.emit({ type: 'documentLoaded', document: handle })
      return cloneDocumentHandle(handle)
    } catch (cause) {
      const error = this.pendingLoadError ?? rangeError ?? normalizePdfError(cause, 'load')
      this.pendingLoadError = null
      if (this.isCurrentGeneration(generation)) {
        await this.releaseDocumentResources()
        const cancelled = error.code === 'PDF_PASSWORD_CANCELLED'
        this.snapshot = cancelled
          ? { status: 'idle', generation, document: null, error: null, progress: null }
          : { status: 'error', generation, document: null, error, progress: null }
        this.emitState()
        if (!cancelled) this.emit({ type: 'error', error })
      }
      throw error
    }
  }

  /** Cancels current loading and returns a live engine to idle. */
  public async cancelLoad(): Promise<void> {
    this.assertActive('cancelLoad')
    const generation = this.snapshot.generation + 1
    this.snapshot = { status: 'idle', generation, document: null, error: null, progress: null }
    await this.releaseDocumentResources()
    this.emitState()
  }

  /** Supplies a credential to the current generation without storing it. */
  public submitPassword(requestId: string, password: string): void {
    this.assertActive('submitPassword')
    const request = this.requirePasswordRequest(requestId, 'submitPassword')
    this.passwordRequest = null
    this.snapshot = {
      status: 'loading', generation: request.generation, document: null, error: null,
      progress: this.snapshot.progress
    }
    this.emitState()
    request.updatePassword(password)
  }

  /** Cancels a password-gated loading task and returns the Viewer to idle. */
  public async cancelPassword(requestId: string): Promise<void> {
    this.assertActive('cancelPassword')
    this.requirePasswordRequest(requestId, 'cancelPassword')
    this.passwordRequest = null
    this.pendingLoadError = new InkLayerError(
      'PDF_PASSWORD_CANCELLED',
      'PDF password entry was cancelled.',
      { operation: 'load' }
    )
    const task = this.loadingTask
    if (task !== null) await task.destroy()
  }

  /** Returns a detached lifecycle snapshot. */
  public getSnapshot(): PdfViewerSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  /** Subscribes to Viewer events. */
  public subscribe(listener: PdfViewerListener): () => void {
    this.assertActive('subscribe')
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Returns the optional owned PDF.js web viewer. */
  public getViewer(): PDFViewer | null {
    return this.viewer
  }

  /** Returns the optional owned PDF.js EventBus. */
  public getEventBus(): EventBus | null {
    return this.eventBus
  }

  /** Applies a page-flow mode through PDF.js's virtualized web Viewer. */
  public async setLayoutMode(mode: PdfViewerLayoutMode): Promise<void> {
    this.assertActive('setLayoutMode')
    const viewer = this.requireWebViewer('setLayoutMode')
    const web = await import('pdfjs-dist/web/pdf_viewer.mjs')
    const continuous = mode === 'continuous' || mode === 'continuous-facing'
    const facing = mode === 'facing' || mode === 'continuous-facing'
    viewer.scrollMode = continuous ? web.ScrollMode.VERTICAL : web.ScrollMode.PAGE
    viewer.spreadMode = facing ? web.SpreadMode.ODD : web.SpreadMode.NONE
  }

  /** Applies a numeric or predefined scale to the owned web Viewer. */
  public setScale(scale: PdfViewerScale): void {
    this.assertActive('setScale')
    const viewer = this.requireWebViewer('setScale')
    if (typeof scale === 'number') {
      if (!Number.isFinite(scale) || scale < this.minScale || scale > this.maxScale) {
        throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF Viewer scale is invalid.', {
          operation: 'setScale'
        })
      }
      viewer.currentScale = scale
      this.emitScaleChanged()
      return
    }
    if (!isPdfScalePreset(scale)) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF Viewer scale preset is invalid.', {
        operation: 'setScale'
      })
    }
    viewer.currentScaleValue = scale
    this.emitScaleChanged()
  }

  /** Returns one detached scale snapshot from the owned PDF.js Viewer. */
  public getScale(): PdfZoomState {
    const viewer = this.requireWebViewer('getScale')
    const scale = Number.isFinite(viewer.currentScale) && viewer.currentScale > 0
      ? viewer.currentScale
      : 1
    return {
      value: normalizeViewerScaleValue(viewer.currentScaleValue, scale),
      scale,
      percentage: Math.round(scale * 100),
      minScale: this.minScale,
      maxScale: this.maxScale
    }
  }

  /** Applies one numeric toolbar zoom-in step from the resolved live scale. */
  public zoomIn(): void {
    this.setScale(stepPdfViewerScale(
      this.getScale().scale, 'in', this.zoomStep, this.minScale, this.maxScale
    ))
  }

  /** Applies one numeric toolbar zoom-out step from the resolved live scale. */
  public zoomOut(): void {
    this.setScale(stepPdfViewerScale(
      this.getScale().scale, 'out', this.zoomStep, this.minScale, this.maxScale
    ))
  }

  /** Navigates the owned web Viewer to one zero-based page. */
  public goToPage(pageIndex: number): void {
    this.assertActive('goToPage')
    const viewer = this.requireWebViewer('goToPage')
    const pageCount = this.snapshot.document?.numPages ?? 0
    if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'PDF page navigation target is invalid.', {
        operation: 'goToPage', pageIndex
      })
    }
    viewer.scrollPageIntoView({ pageNumber: pageIndex + 1 })
  }

  /** Returns the resolved outline for the current document. */
  public async getOutline(): Promise<readonly PdfOutlineItem[]> {
    return await this.requireDocumentFeatures('getOutline').getOutline()
  }

  /** Resolves one named or explicit current-document destination. */
  public async resolveDestination(
    destination: string | readonly unknown[]
  ): Promise<PdfNavigationTarget | null> {
    return await this.requireDocumentFeatures('resolveDestination').resolveDestination(destination)
  }

  /** Searches the current document without prescribing search UI. */
  public async search(query: string, options?: PdfSearchOptions): Promise<PdfSearchResult> {
    return await this.requireDocumentFeatures('search').search(query, options)
  }

  /** Applies transient search highlights to every currently attached TextLayer. */
  public setSearchHighlights(
    matches: readonly PdfSearchMatch[],
    activeIndex: number | null = null
  ): void {
    this.assertActive('setSearchHighlights')
    if (this.textLayers === null || this.snapshot.status !== 'ready') {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'A ready PDF document is required.', {
        operation: 'setSearchHighlights'
      })
    }
    this.textLayers.setSearchHighlights(matches, activeIndex)
  }

  /** Clears search decorations without changing the search text cache. */
  public clearSearchHighlights(): void {
    this.assertActive('clearSearchHighlights')
    this.textLayers?.setSearchHighlights([], null)
  }

  /** Returns normalized selection after native DOM focus has moved to product UI. */
  public getTextSelection(): PdfActiveTextSelection | null {
    this.assertActive('getTextSelection')
    return this.textSelection === null ? null : cloneActiveTextSelection(this.textSelection)
  }

  /** Clears both the retained selection and its native browser decoration. */
  public clearTextSelection(): void {
    this.assertActive('clearTextSelection')
    this.textLayers?.clearSelection()
    this.resetTextSelection()
  }

  /** Renders one cached current-document thumbnail. */
  public async renderThumbnail(options: PdfThumbnailOptions): Promise<PdfThumbnail> {
    return await this.requireDocumentFeatures('renderThumbnail').renderThumbnail(options)
  }

  /** Renders a full page raster and applies the matching watermark target. */
  public async renderPageRaster(options: PdfPageRasterOptions): Promise<PdfPageRaster> {
    const target = options.target ?? 'viewer'
    return await this.requireDocumentFeatures('renderPageRaster').renderPageRaster(
      options,
      (canvas, pixelRatio) => drawCanvasWatermark(this.watermark, {
        canvas,
        pageIndex: options.pageIndex,
        pixelRatio
      }, target)
    )
  }

  /** Renders one selectable PDF.js TextLayer for the current document. */
  public async attachTextLayer(attachment: PdfTextLayerAttachment): Promise<void> {
    this.assertActive('attachTextLayer')
    if (this.textLayers === null || this.snapshot.status !== 'ready') {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'A ready PDF document is required.', {
        operation: 'attachTextLayer', pageIndex: attachment.pageIndex
      })
    }
    await this.textLayers.attach(attachment)
  }

  /** Detaches one current-document TextLayer. */
  public detachTextLayer(pageIndex: number): void {
    this.assertActive('detachTextLayer')
    this.textLayers?.detach(pageIndex)
  }

  /** Replaces the presentation-only watermark policy. */
  public setWatermark(spec: PdfWatermarkSpec | null): void {
    this.assertActive('setWatermark')
    this.watermark = normalizeWatermarkSpec(spec)
  }

  /** Returns a detached active watermark policy. */
  public getWatermark(): PdfWatermarkSpec | null {
    return this.watermark === null ? null : structuredClone(this.watermark)
  }

  /** Draws the configured watermark as a page-render post-pass. */
  public drawWatermark(request: PdfCanvasWatermarkRequest): void {
    this.assertActive('drawWatermark')
    drawCanvasWatermark(this.watermark, request)
  }

  /** Releases every owned resource and emits destruction exactly once. */
  public async destroy(): Promise<void> {
    if (this.destroyed) return
    this.destroyed = true
    const generation = this.snapshot.generation + 1
    await this.releaseDocumentResources()
    this.zoomGesture?.destroy()
    this.zoomGesture = null
    if (this.eventBus !== null && this.scaleChangingListener !== null) {
      this.eventBus.off('scalechanging', this.scaleChangingListener)
    }
    this.scaleChangingListener = null
    this.releaseWorker?.()
    this.releaseWorker = null
    this.viewer = null
    this.linkService = null
    this.eventBus = null
    this.snapshot = { status: 'destroyed', generation, document: null, error: null, progress: null }
    this.emitState()
    this.emit({ type: 'destroyed' })
    this.listeners.clear()
  }

  /** Creates PDF.js parameters for byte, direct URL, or validated Range input. */
  private async createDocumentParameters(
    source: PdfSource,
    pdfjs: typeof PdfJsModule,
    generation: number,
    onRangeError: (error: InkLayerError) => void
  ): Promise<DocumentInitParameters> {
    if (isDataSource(source)) return { data: source.data }
    const url = String(source.url)
    const rangeMode = source.range ?? 'auto'
    if (rangeMode === false) return createDirectUrlParameters(source, true)
    const controller = new AbortController()
    this.rangeAbortController = controller
    const fetchImplementation = this.options.fetch ?? globalThis.fetch
    if (typeof fetchImplementation !== 'function') {
      throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'Fetch is required for PDF Range loading.', {
        operation: 'createPdfRangeTransport'
      })
    }
    try {
      const transport = await createPdfRangeTransport({
        url,
        signal: controller.signal,
        fetch: fetchImplementation,
        Transport: pdfjs.PDFDataRangeTransport,
        onError: onRangeError,
        onProgress: (loaded, total) => {
          const phase = loaded >= total ? 'parsing' : 'downloading'
          this.emitLoadProgress(createLoadProgress(generation, phase, loaded, total, true))
        },
        ...(source.headers === undefined ? {} : { headers: source.headers }),
        ...(source.credentials === undefined ? {} : { credentials: source.credentials }),
        ...(source.rangeChunkSize === undefined ? {} : { chunkSize: source.rangeChunkSize })
      })
      this.assertCurrentGeneration(generation)
      this.rangeTransport = transport
      return {
        range: transport,
        disableStream: true,
        disableAutoFetch: true,
        ...(source.rangeChunkSize === undefined ? {} : { rangeChunkSize: source.rangeChunkSize })
      }
    } catch (cause) {
      controller.abort()
      if (rangeMode === 'auto' && cause instanceof InkLayerError
        && cause.code === 'PDF_RANGE_UNSUPPORTED') {
        this.rangeAbortController = null
        this.emitLoadProgress(createLoadProgress(generation, 'downloading', 0, null, false))
        return createDirectUrlParameters(source, false)
      }
      throw cause
    }
  }

  /** Dynamically creates PDF.js web Viewer resources only when a container exists. */
  private async ensureWebViewer(): Promise<void> {
    if (this.options.container === undefined || this.viewer !== null) return
    const web = await import('pdfjs-dist/web/pdf_viewer.mjs')
    const eventBus = new web.EventBus()
    const linkService = new web.PDFLinkService({ eventBus })
    const viewer = new web.PDFViewer({
      container: this.options.container,
      eventBus,
      linkService,
      ...(this.options.viewerElement === undefined ? {} : { viewer: this.options.viewerElement })
    })
    linkService.setViewer(viewer)
    this.eventBus = eventBus
    this.linkService = linkService
    this.viewer = viewer
    this.scaleChangingListener = () => this.emitScaleChanged()
    eventBus.on('scalechanging', this.scaleChangingListener)
    if (this.options.enablePinchZoom !== false) {
      this.zoomGesture = createPdfZoomGestureController({
        container: this.options.container,
        getScale: () => this.getScale().scale,
        setScale: (scale) => this.setScale(scale),
        minScale: this.minScale,
        maxScale: this.maxScale
      })
    }
  }

  /** Releases the current Range, Viewer document, and loading task resources. */
  private async releaseDocumentResources(): Promise<void> {
    this.passwordRequest = null
    this.resetTextSelection()
    this.textLayers?.destroy()
    this.textLayers = null
    this.documentFeatures?.destroy()
    this.documentFeatures = null
    this.rangeAbortController?.abort()
    this.rangeAbortController = null
    this.rangeTransport?.abort()
    this.rangeTransport = null
    if (this.viewer !== null) {
      this.viewer.setDocument(null as unknown as PDFDocumentProxy)
    }
    this.linkService?.setDocument(null)
    const loadingTask = this.loadingTask
    this.loadingTask = null
    if (loadingTask !== null) {
      await loadingTask.destroy()
    }
  }

  /** Pauses one current load and emits credential-free request metadata. */
  private requestPassword(
    generation: number,
    updatePassword: (password: string) => void,
    reason: number,
    responses: PdfJsPasswordResponses
  ): void {
    if (!this.isCurrentGeneration(generation)) return
    this.passwordAttempt += 1
    this.passwordProtected = true
    const normalizedReason: PdfPasswordReason = reason === responses.INCORRECT_PASSWORD
      ? 'incorrect'
      : 'required'
    const requestId = `password-${generation}-${this.passwordAttempt}`
    this.passwordRequest = { requestId, generation, updatePassword }
    this.snapshot = {
      status: 'awaiting-password', generation, document: null, error: null,
      progress: this.snapshot.progress
    }
    this.emitState()
    this.emit({
      type: 'passwordRequired',
      request: { requestId, reason: normalizedReason, attempt: this.passwordAttempt }
    })
  }

  /** Returns the matching active password request or rejects stale UI input. */
  private requirePasswordRequest(
    requestId: string,
    operation: string
  ): NonNullable<PdfViewerEngineImpl['passwordRequest']> {
    const request = this.passwordRequest
    if (request === null || request.requestId !== requestId
      || !this.isCurrentGeneration(request.generation)) {
      throw new InkLayerError('PDF_LOAD_FAILED', 'PDF password request is no longer active.', {
        operation
      })
    }
    return request
  }

  /** Emits a cloned current snapshot. */
  private emitState(): void {
    this.emit({ type: 'stateChanged', snapshot: this.getSnapshot() })
  }

  /** Normalizes PDF.js direct-download progress and transitions to parsing at completion. */
  private reportDirectLoadProgress(generation: number, loaded: number, total: number): void {
    const normalizedTotal = Number.isFinite(total) && total > 0 ? total : null
    const normalizedLoaded = Number.isFinite(loaded) && loaded > 0
      ? Math.min(loaded, normalizedTotal ?? loaded)
      : 0
    const phase = normalizedTotal !== null && normalizedLoaded >= normalizedTotal
      ? 'parsing'
      : 'downloading'
    this.emitLoadProgress(
      createLoadProgress(generation, phase, normalizedLoaded, normalizedTotal, false)
    )
  }

  /** Retains and emits progress only while its load generation remains current. */
  private emitLoadProgress(progress: PdfLoadProgress): void {
    if (!this.isCurrentGeneration(progress.generation)
      || (this.snapshot.status !== 'loading' && this.snapshot.status !== 'awaiting-password')) return
    this.snapshot = { ...this.snapshot, progress }
    this.emit({ type: 'loadProgress', progress })
  }

  /** Retains and emits one detached normalized text selection. */
  private setTextSelection(selection: PdfActiveTextSelection): void {
    this.textSelection = cloneActiveTextSelection(selection)
    this.emit({ type: 'textSelectionChanged', selection })
  }

  /** Clears retained selection exactly once. */
  private resetTextSelection(): void {
    if (this.textSelection === null) return
    this.textSelection = null
    this.emit({ type: 'textSelectionChanged', selection: null })
  }

  /** Emits scale state only when its requested or resolved value changed. */
  private emitScaleChanged(): void {
    if (this.viewer === null) return
    const state = this.getScale()
    const signature = `${String(state.value)}:${state.scale}`
    if (signature === this.lastScaleSignature) return
    this.lastScaleSignature = signature
    this.emit({ type: 'scaleChanged', state })
  }

  /** Emits one event while isolating and reporting listener failures. */
  private emit(event: PdfViewerEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(cloneViewerEvent(event))
      } catch (cause) {
        this.options.onListenerError?.(cause)
      }
    }
  }

  /** Throws after engine destruction. */
  private assertActive(operation: string): void {
    if (this.destroyed) {
      throw new InkLayerError('ENGINE_DESTROYED', 'PDF Viewer Engine has been destroyed.', { operation })
    }
  }

  /** Returns live document features or throws before/after a ready document. */
  private requireDocumentFeatures(operation: string): PdfDocumentFeatures {
    this.assertActive(operation)
    if (this.documentFeatures === null || this.snapshot.status !== 'ready') {
      throw new InkLayerError('PDF_FEATURE_FAILED', 'A ready PDF document is required.', {
        operation
      })
    }
    return this.documentFeatures
  }

  /** Returns the configured PDF.js web Viewer or explains the missing host. */
  private requireWebViewer(operation: string): PDFViewer {
    if (this.viewer === null) {
      throw new InkLayerError(
        'PDF_FEATURE_FAILED',
        'A Viewer container is required for page layout operations.',
        { operation }
      )
    }
    return this.viewer
  }

  /** Throws when asynchronous work no longer owns the current generation. */
  private assertCurrentGeneration(generation: number): void {
    if (!this.isCurrentGeneration(generation)) {
      throw new InkLayerError('PDF_LOAD_FAILED', 'PDF load was cancelled or superseded.', {
        operation: 'load'
      })
    }
  }

  /** Returns whether a generation still owns engine state. */
  private isCurrentGeneration(generation: number): boolean {
    return !this.destroyed && this.snapshot.generation === generation
  }
}

/** Returns whether a source contains in-memory PDF data. */
function isDataSource(source: PdfSource): source is PdfDataSource {
  return 'data' in source
}

/** Copies PDF data before PDF.js may transfer the source buffer. */
function copyPdfData(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data.slice(0))
}

/** Validates and snapshots one source before asynchronous loading begins. */
function normalizePdfSource(source: PdfSource): PdfSource {
  if (typeof source !== 'object' || source === null) {
    throw invalidPdfSource('PDF source must be an object.')
  }
  if ('data' in source) {
    if (!(source.data instanceof ArrayBuffer) && !(source.data instanceof Uint8Array)) {
      throw invalidPdfSource('PDF data must be an ArrayBuffer or Uint8Array.')
    }
    return { data: copyPdfData(source.data) }
  }
  if (!('url' in source) || (typeof source.url !== 'string' && !(source.url instanceof URL))) {
    throw invalidPdfSource('PDF URL source must contain a string or URL.')
  }
  const url = String(source.url)
  if (url.trim().length === 0) throw invalidPdfSource('PDF URL cannot be empty.')
  if (source.range !== undefined && source.range !== true
    && source.range !== false && source.range !== 'auto') {
    throw invalidPdfSource('PDF Range mode is unsupported.')
  }
  if (source.credentials !== undefined
    && !new Set<RequestCredentials>(['omit', 'same-origin', 'include']).has(source.credentials)) {
    throw invalidPdfSource('PDF credentials mode is unsupported.')
  }
  let headers: Record<string, string> | undefined
  if (source.headers !== undefined) {
    if (typeof source.headers !== 'object' || source.headers === null || Array.isArray(source.headers)
      || Object.values(source.headers).some((value) => typeof value !== 'string')) {
      throw invalidPdfSource('PDF headers must be a string record.')
    }
    headers = { ...source.headers }
  }
  return {
    url,
    ...(headers === undefined ? {} : { headers }),
    ...(source.credentials === undefined ? {} : { credentials: source.credentials }),
    ...(source.range === undefined ? {} : { range: source.range }),
    ...(source.rangeChunkSize === undefined ? {} : { rangeChunkSize: source.rangeChunkSize })
  }
}

/** Creates the first truthful progress phase before asynchronous loading begins. */
function createInitialLoadProgress(source: PdfSource, generation: number): PdfLoadProgress {
  if (isDataSource(source)) {
    return createLoadProgress(generation, 'parsing', source.data.byteLength, source.data.byteLength, false)
  }
  const range = source.range !== false
  return createLoadProgress(generation, range ? 'probing' : 'downloading', 0, null, range)
}

/** Creates one normalized immutable load progress value. */
function createLoadProgress(
  generation: number,
  phase: PdfLoadProgress['phase'],
  loaded: number,
  total: number | null,
  range: boolean
): PdfLoadProgress {
  const percentage = total === null || total <= 0
    ? null
    : Math.min(100, Math.max(0, Math.round(loaded / total * 100)))
  return { generation, phase, loaded, total, percentage, range }
}

/** Creates direct PDF.js URL parameters with explicit Range behavior. */
function createDirectUrlParameters(source: PdfUrlSource, disableRange: boolean): DocumentInitParameters {
  return {
    url: String(source.url),
    disableRange,
    ...(source.headers === undefined ? {} : { httpHeaders: { ...source.headers } }),
    ...(source.credentials === undefined ? {} : { withCredentials: source.credentials === 'include' })
  }
}

/** Creates a stable handle from a loaded PDF.js document proxy. */
function createDocumentHandle(
  document: PDFDocumentProxy,
  permissions: PdfDocumentPermissions,
  passwordProtected: boolean
): PdfDocumentHandle {
  return {
    document,
    numPages: document.numPages,
    fingerprints: [...document.fingerprints],
    permissions: { ...permissions },
    passwordProtected
  }
}

/** Clones a document handle container while retaining its PDF.js proxy. */
function cloneDocumentHandle(handle: PdfDocumentHandle): PdfDocumentHandle {
  return {
    document: handle.document,
    numPages: handle.numPages,
    fingerprints: [...handle.fingerprints],
    permissions: { ...handle.permissions },
    passwordProtected: handle.passwordProtected
  }
}

/** Clones snapshot containers while intentionally retaining the PDF.js proxy. */
function cloneSnapshot(snapshot: PdfViewerSnapshot): PdfViewerSnapshot {
  return {
    status: snapshot.status,
    generation: snapshot.generation,
    error: snapshot.error,
    progress: snapshot.progress === null ? null : { ...snapshot.progress },
    document: snapshot.document === null
      ? null
      : cloneDocumentHandle(snapshot.document)
  }
}

/** Clones event containers before delivering them to one listener. */
function cloneViewerEvent(event: PdfViewerEvent): PdfViewerEvent {
  switch (event.type) {
    case 'loadProgress':
      return { type: 'loadProgress', progress: { ...event.progress } }
    case 'stateChanged':
      return { type: 'stateChanged', snapshot: cloneSnapshot(event.snapshot) }
    case 'scaleChanged':
      return { type: 'scaleChanged', state: { ...event.state } }
    case 'documentLoaded':
      return { type: 'documentLoaded', document: cloneDocumentHandle(event.document) }
    case 'passwordRequired':
      return { type: 'passwordRequired', request: { ...event.request } }
    case 'error':
      return { type: 'error', error: event.error }
    case 'textSelected':
      return {
        type: 'textSelected',
        selection: {
          ...event.selection,
          rects: event.selection.rects.map((rect) => ({ ...rect }))
        }
      }
    case 'documentTextSelected':
      return {
        type: 'documentTextSelected',
        selection: {
          text: event.selection.text,
          fragments: event.selection.fragments.map((fragment) => ({
            ...fragment,
            rects: fragment.rects.map((rect) => ({ ...rect }))
          }))
        }
      }
    case 'textSelectionChanged':
      return {
        type: 'textSelectionChanged',
        selection: event.selection === null ? null : cloneActiveTextSelection(event.selection)
      }
    case 'destroyed':
      return { type: 'destroyed' }
  }
}

/** Clones retained same-page or document-spanning text selection geometry. */
function cloneActiveTextSelection(selection: PdfActiveTextSelection): PdfActiveTextSelection {
  if (selection.kind === 'page') {
    return {
      kind: 'page',
      selection: {
        ...selection.selection,
        rects: selection.selection.rects.map((rect) => ({ ...rect }))
      }
    }
  }
  return {
    kind: 'document',
    selection: {
      text: selection.selection.text,
      fragments: selection.selection.fragments.map((fragment) => ({
        ...fragment,
        rects: fragment.rects.map((rect) => ({ ...rect }))
      }))
    }
  }
}

/** Narrows runtime strings to the PDF.js-compatible adaptive scale set. */
function isPdfScalePreset(value: string): value is Exclude<PdfViewerScale, number> {
  return value === 'auto' || value === 'page-actual' || value === 'page-fit'
    || value === 'page-width' || value === 'page-height'
}

/** Converts PDF.js's string-valued scale property into the public closed union. */
function normalizeViewerScaleValue(value: string, resolvedScale: number): PdfViewerScale {
  if (isPdfScalePreset(value)) return value
  const numeric = Number.parseFloat(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : resolvedScale
}

/** Converts nullable PDF.js permission flags to a closed Core policy. */
function normalizeDocumentPermissions(
  values: readonly number[] | null,
  flags: PdfJsPermissionFlags
): PdfDocumentPermissions {
  if (values === null) {
    return {
      print: 'high-resolution', copy: true, copyForAccessibility: true,
      modify: true, annotate: true, fillForms: true, assemble: true
    }
  }
  const permissions = new Set(values)
  const canPrint = permissions.has(flags.PRINT)
  return {
    print: !canPrint
      ? 'none'
      : permissions.has(flags.PRINT_HIGH_QUALITY) ? 'high-resolution' : 'low-resolution',
    copy: permissions.has(flags.COPY),
    copyForAccessibility: permissions.has(flags.COPY_FOR_ACCESSIBILITY),
    modify: permissions.has(flags.MODIFY_CONTENTS),
    annotate: permissions.has(flags.MODIFY_ANNOTATIONS),
    fillForms: permissions.has(flags.FILL_INTERACTIVE_FORMS),
    assemble: permissions.has(flags.ASSEMBLE)
  }
}

/** Converts arbitrary PDF.js failures to the shared structured error contract. */
function normalizePdfError(cause: unknown, operation: string): InkLayerError {
  if (cause instanceof InkLayerError) return cause
  return new InkLayerError('PDF_LOAD_FAILED', 'PDF document loading failed.', { operation, cause })
}

/** Loads the browser build normally and the Node legacy build at runtime only. */
async function loadPdfJsModule(): Promise<typeof PdfJsModule> {
  if (typeof document !== 'undefined') return import('pdfjs-dist')
  const nodeLegacyModule = 'pdfjs-dist/legacy/build/pdf.mjs'
  return import(/* @vite-ignore */ nodeLegacyModule) as Promise<typeof PdfJsModule>
}

/** Creates a structured invalid PDF source error. */
function invalidPdfSource(message: string): InkLayerError {
  return new InkLayerError('PDF_LOAD_FAILED', message, { operation: 'validatePdfSource' })
}
