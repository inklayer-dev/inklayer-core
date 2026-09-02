/**
 * @file Complete framework-free InkLayer Core browser demonstration.
 * @description Exercises real PDF.js rendering, one Annotation Engine, every
 * tool, comments, reload, zoom, byte exporters, downloads, and teardown.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist'
import passwordPdfUrl from '../../../tests/fixtures/pdf/pr6531_1.pdf?url'

import {
  buildSecureRedactedPdf,
  buildSecureRasterPrintPdf,
  createAnnotationEngine,
  createBrowserThumbnailSurfaceProvider,
  createPdfPageFlow,
  createPdfZoomGestureController,
  createPdfViewerEngine,
  downloadBlob,
  InkLayerError,
  printPdfBlob,
  resolvePdfViewerScale,
  stepPdfViewerScale,
  type Annotation,
  type AnnotationEngine,
  type AnnotationTool,
  type PdfActiveTextSelection,
  type PdfOutlineItem,
  type PdfPasswordRequest,
  type PdfPageFlowController,
  type PdfSource,
  type PdfTextSelection,
  type PdfViewerEngine,
  type PdfViewerScale,
  type PdfZoomGestureController
} from '@inklayer-dev/core'
import {
  hideImportedPdfJsAnnotations,
  importPdfJsAnnotationsWithMetadata,
  type ImportPdfJsAnnotationsWithMetadataResult
} from '@inklayer-dev/core/import/pdfjs'
import {
  createKeywordHighlighter,
  type KeywordHighlighter,
  type KeywordHighlighterSnapshot
} from '@inklayer-dev/core/highlighter'
import '@inklayer-dev/core/style'
import './demo.css'
import { createLongDocumentPdf, createMixedPagePdf, createSamplePdf } from './sample-pdf'
import {
  DEMO_CUSTOM_ANNOTATIONS,
  DEMO_ISSUE_MARKER_TYPE,
  DEMO_MEASUREMENT_TYPE,
  DEMO_REVIEW_AREA_TYPE
} from './annotation-plugins'
import { DEMO_CODE_EXAMPLES } from './ui/demo-code-examples'
import { appMarkup, instanceMarkup } from './ui/demo-shell'
import { toolIcon } from './ui/tool-catalog'
import { HighlighterPanel } from './ui/highlighter-panel'
import { StampSignPanel } from './ui/stamp-sign-panel'
import { WorkspaceView } from './ui/workspace-view'

const DEMO_VIEWS = [
  'viewer', 'annotations', 'stamp-sign', 'highlighter', 'redaction', 'watermark',
  'custom-annotations'
] as const
type DemoView = typeof DEMO_VIEWS[number]

/** Returns whether one route owns an interactive Annotation Engine surface. */
function isAnnotationDemo(view: DemoView): boolean {
  return view === 'annotations' || view === 'stamp-sign' || view === 'custom-annotations'
}

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('Vanilla example root was not found.')

root.innerHTML = appMarkup()

const grid = requireElement<HTMLElement>(root, '#instance-grid')
const destroyAll = requireElement<HTMLButtonElement>(root, '#destroy-all')
const demoRouteLinks = [...root.querySelectorAll<HTMLAnchorElement>('[data-demo-route]')]
const samplePdf = createSamplePdf()
let instances: DemoInstance[] = []
let activeDemoView: DemoView = readDemoView()
let demoActivationGeneration = 0

/** Product-owned presentation of one structured recovery outcome. */
interface RecoveryOutcome {
  state: 'error' | 'warning' | 'success'
  summary: string
  code: string
  operation: string
  context: string
}

/** Owns one complete demo Viewer and Annotation Engine lifecycle. */
class DemoInstance {
  public readonly demoView: DemoView
  private readonly parent: HTMLElement
  private readonly host: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly textLayerHost: HTMLDivElement
  private readonly annotationHost: HTMLDivElement
  private readonly status: HTMLElement
  private readonly loadProgress: HTMLOutputElement
  private readonly toolSelect: HTMLSelectElement
  private readonly appearanceColor: HTMLInputElement
  private readonly appearanceWidth: HTMLInputElement
  private readonly appearanceFillColor: HTMLInputElement
  private readonly appearanceOpacity: HTMLInputElement
  private readonly appearanceDash: HTMLSelectElement
  private readonly appearanceFontSize: HTMLInputElement
  private readonly textSelectionMenu: HTMLDivElement
  private readonly view: WorkspaceView
  private textSelectionFocusReturn: HTMLElement | null = null
  private viewer: PdfViewerEngine
  private annotations: AnnotationEngine
  private readonly highlighter: KeywordHighlighter
  private readonly highlighterPanel: HighlighterPanel
  private readonly stampSignPanel: StampSignPanel | null
  private readonly unsubscribeHighlighter: () => void
  private document: PDFDocumentProxy | null = null
  private currentPageIndex = 0
  private scaleValue: PdfViewerScale = 1
  private scale = 1
  private renderTask: { cancel(): void; promise: Promise<unknown> } | null = null
  private thumbnailUrls: string[] = []
  private unsubscribeViewer: () => void
  private unsubscribeAnnotations: () => void
  private pageFlow: PdfPageFlowController | null = null
  private prefersContinuous: boolean
  private source: PdfSource = { data: samplePdf }
  private sourcePdf = samplePdf
  private sourceName = 'generated sample'
  private loadCancelled = false
  private passwordRequestId: string | null = null
  private failNextRasterEncode = false
  private recoveryRetry: (() => Promise<void>) | null = null
  private resizeObserver: ResizeObserver | null = null
  private singlePageGesture: PdfZoomGestureController | null = null
  private gestureScale = 1
  private pendingGestureScale: number | null = null
  private gestureScaleCommit: Promise<void> | null = null
  private readonly customAnnotationDisposers: Array<() => void> = []
  private copyCodeResetTimer: ReturnType<typeof setTimeout> | null = null
  private readonly nativeImports = new Map<number, ImportPdfJsAnnotationsWithMetadataResult>()

  /** Creates DOM and Core instances for one isolated card. */
  public constructor(parent: HTMLElement, label: string, accent: string, demoView: DemoView) {
    this.parent = parent
    this.demoView = demoView
    this.prefersContinuous = true
    this.host = document.createElement('article')
    this.host.className = 'instance-card'
    this.host.dataset['demoView'] = demoView
    this.host.style.setProperty('--inklayer-author-label-background', accent)
    this.host.innerHTML = instanceMarkup(label)
    parent.append(this.host)
    this.view = new WorkspaceView(this.host)
    this.canvas = requireElement(this.host, '.pdf-canvas')
    this.textLayerHost = requireElement(this.host, '.text-layer-host')
    this.annotationHost = requireElement(this.host, '.annotation-host')
    this.status = requireElement(this.host, '.instance-status')
    this.loadProgress = requireElement(this.host, '.load-progress')
    this.toolSelect = requireElement(this.host, '.tool-select')
    this.appearanceColor = requireElement(this.host, '.appearance-color')
    this.appearanceWidth = requireElement(this.host, '.appearance-width')
    this.appearanceFillColor = requireElement(this.host, '.appearance-fill-color')
    this.appearanceOpacity = requireElement(this.host, '.appearance-opacity')
    this.appearanceDash = requireElement(this.host, '.appearance-dash')
    this.appearanceFontSize = requireElement(this.host, '.appearance-font-size')
    this.textSelectionMenu = requireElement(this.host, '.text-selection-menu')
    const browserSurfaces = createBrowserThumbnailSurfaceProvider()
    this.viewer = createPdfViewerEngine({
      thumbnailSurfaceProvider: {
        create: (width, height) => {
          const surface = browserSurfaces.create(width, height)
          return {
            ...surface,
            encode: async () => {
              if (this.failNextRasterEncode) {
                this.failNextRasterEncode = false
                throw new Error('Intentional recovery-demo raster encoding failure.')
              }
              return await surface.encode()
            }
          }
        }
      }
    })
    this.viewer.setWatermark({
      text: `${label} · InkLayer Core`,
      layout: 'repeated',
      opacity: 0.1,
      rotation: -28,
      targets: { viewer: true, print: true, export: true, thumbnails: false }
    })
    this.annotations = createAnnotationEngine({
      root: this.host,
      currentUser: { id: label.toLowerCase(), name: label },
      accessibility: {
        rootLabel: `${label} PDF annotation workspace`,
        pageLabel: (pageIndex) => `${label} annotations on page ${pageIndex + 1}`
      }
    })
    this.annotations.setImageAsset('signature', createDemoSignature(label, accent))
    this.annotations.setImageAsset('stamp', createDemoStamp())
    this.annotations.setTool(demoView === 'annotations' ? 'text-select' : 'select')
    this.annotations.setAuthorLabelVisibility('auto')
    this.highlighter = createKeywordHighlighter({
      viewer: {
        getSnapshot: () => this.viewer.getSnapshot(),
        subscribe: (listener) => this.viewer.subscribe(listener),
        searchMany: (queries, options) => this.viewer.searchMany(queries, options),
        resolveTextRanges: (ranges, options) => this.viewer.resolveTextRanges(ranges, options),
        setTextHighlightLayers: (layers) => this.viewer.setTextHighlightLayers(layers),
        clearTextHighlightLayers: (ids) => this.viewer.clearTextHighlightLayers(ids),
        goToPage: (pageIndex) => {
          void this.showPage(pageIndex).catch((cause: unknown) => this.reportError(cause))
        }
      },
      annotations: {
        getAnnotations: () => this.annotations.getAnnotations(),
        createTextMarkupsFromRanges: (type, inputs, options) =>
          this.annotations.createTextMarkupsFromRanges(type, inputs, options)
      }
    })
    this.highlighterPanel = new HighlighterPanel(
      requireElement(this.host, '.highlighter-panel'),
      this.highlighter,
      (cause) => this.reportError(cause),
      demoView === 'redaction' ? { mode: 'redaction' } : {}
    )
    this.stampSignPanel = demoView === 'stamp-sign'
      ? new StampSignPanel({
          root: requireElement(this.host, '.stamp-sign-panel'),
          annotations: this.annotations,
          getPageCount: () => this.document?.numPages ?? 0,
          getCurrentPageIndex: () => this.currentPageIndex,
          getPageSize: async (pageIndex) => await this.getPageSize(pageIndex),
          showPage: async (pageIndex) => await this.showPage(pageIndex),
          onStatus: (message) => this.setStatus(message),
          onError: (cause) => this.reportError(cause)
        })
      : null
    this.unsubscribeHighlighter = this.highlighter.subscribe((snapshot) => {
      this.updateRedactionOutputActions(snapshot)
    })
    this.updateRedactionOutputActions(this.highlighter.getSnapshot())
    if (demoView === 'custom-annotations') this.installCustomAnnotationTypes()
    this.configureDemoView()
    this.updateAppearanceControls()
    this.unsubscribeAnnotations = this.annotations.subscribe((event) => {
      this.pushEvent(`annotation · ${event.type}`)
      if (event.type === 'selectionChanged' || event.type === 'annotationUpdated') {
        this.updateAppearanceControls()
      }
      if (event.type === 'annotationAdded' || event.type === 'annotationUpdated'
        || event.type === 'annotationDeleted' || event.type === 'selectionChanged') {
        this.renderAnnotationList()
        this.stampSignPanel?.syncSelection(this.selectedAnnotation())
      }
      if (event.type === 'toolChanged') {
        this.toolSelect.value = event.tool
        this.syncToolButtons()
        this.updateAppearanceControls()
      }
      if (event.type === 'imageAssetRequired') {
        this.setStatus(`Choose or create a ${event.tool} image before placing it.`)
      }
    })
    this.unsubscribeViewer = this.viewer.subscribe((event) => {
      this.pushEvent(`viewer · ${event.type}`)
      if (event.type === 'passwordRequired') this.showPasswordRequest(event.request)
      if (event.type === 'documentLoaded' && event.document.passwordProtected) {
        this.showRecoverySuccess('Password retry opened the protected PDF.')
      }
      if (event.type === 'textSelectionChanged') this.handleTextSelectionChange(event.selection)
      if (event.type === 'loadProgress') {
        const label = event.progress.phase === 'probing'
          ? 'Checking Range support'
          : event.progress.phase === 'downloading' ? 'Downloading PDF' : 'Parsing PDF'
        const percentage = event.progress.percentage === null
          ? ''
          : ` · ${event.progress.percentage}%`
        const bytes = event.progress.total === null
          ? `${event.progress.loaded.toLocaleString()} bytes`
          : `${event.progress.loaded.toLocaleString()}/${event.progress.total.toLocaleString()} bytes`
        const mode = event.progress.range ? 'Range' : 'direct'
        this.loadProgress.hidden = false
        this.loadProgress.dataset['phase'] = event.progress.phase
        this.loadProgress.dataset['range'] = String(event.progress.range)
        this.loadProgress.dataset['loaded'] = String(event.progress.loaded)
        this.loadProgress.dataset['total'] = event.progress.total === null
          ? ''
          : String(event.progress.total)
        this.loadProgress.textContent = `${label} · ${bytes}${percentage} · ${mode}`
        const stageProgress = requireElement<HTMLElement>(this.host, '.stage-progress')
        stageProgress.hidden = false
        this.setStatus(`${label}${percentage}`)
      }
    })
    this.bindControls()
    this.bindWorkspaceShell()
    this.attachSinglePageGesture()
    if (typeof ResizeObserver === 'function') {
      const pageScroll = requireElement<HTMLDivElement>(this.host, '.page-scroll')
      this.resizeObserver = new ResizeObserver(() => {
        if (this.pageFlow !== null || !isAdaptiveScale(this.scaleValue)) return
        void this.setViewerScale(this.scaleValue).catch((cause: unknown) => this.reportError(cause))
      })
      this.resizeObserver.observe(pageScroll)
    }
  }

  /** Attaches only the selected isolated workspace to the public demo shell. */
  public setActive(active: boolean): void {
    if (!active) {
      this.closeMobilePanels()
      this.host.remove()
      return
    }
    if (this.host.parentElement !== this.parent) this.parent.append(this.host)
    this.configureDemoView()
  }

  /** Configures the controls owned by this instance's one fixed capability. */
  private configureDemoView(): void {
    const view = this.demoView
    this.closeMobilePanels()
    if (view === 'viewer') this.activatePanel('side', 'pages')
    if (view === 'annotations' || view === 'stamp-sign' || view === 'watermark'
      || view === 'custom-annotations') {
      this.activatePanel('right', 'tools')
    }
    if (view === 'highlighter' || view === 'redaction') this.activatePanel('side', 'highlighter')
    if (window.matchMedia('(max-width: 960px)').matches) {
      if (view === 'annotations' || view === 'stamp-sign' || view === 'watermark'
        || view === 'custom-annotations') {
        this.host.classList.add('right-panel-open')
      }
      if (view === 'highlighter' || view === 'redaction') this.host.classList.add('left-panel-open')
    }
    const subtitle = requireElement<HTMLElement>(this.host, '.workspace-title > div > span')
    subtitle.textContent = view === 'viewer'
      ? 'Viewing, navigation, search and page flow'
      : view === 'annotations'
        ? 'Create, style, review and export annotations'
        : view === 'stamp-sign'
          ? 'Place visual stamps and signatures once or across page ranges'
        : view === 'highlighter'
          ? 'Prepared rules, temporary previews and permanent highlights'
          : view === 'redaction'
            ? 'Review matches and export an image-only redacted PDF'
            : view === 'watermark'
              ? 'Apply one watermark policy across viewer, print and export'
            : 'Application-owned annotation types with semantic data'
    const leftToggle = requireElement<HTMLButtonElement>(
      this.host, '.mobile-panel-toggle[data-panel="left"]'
    )
    const keywordWorkflow = view === 'highlighter' || view === 'redaction'
    const leftLabel = keywordWorkflow ? 'Open keyword rules' : 'Open document navigation'
    leftToggle.setAttribute('aria-label', leftLabel)
    requireElement<HTMLElement>(leftToggle, '.control-label').textContent =
      keywordWorkflow ? 'Rules' : 'Navigate'
    requireElement<HTMLElement>(this.host, '.left-sidebar').setAttribute(
      'aria-label', view === 'redaction'
        ? 'Keyword Redaction'
        : view === 'highlighter' ? 'Keyword Highlighter' : 'Document navigation'
    )
    const rightSidebar = requireElement<HTMLElement>(this.host, '.right-sidebar')
    rightSidebar.setAttribute('aria-label', view === 'stamp-sign'
      ? 'Stamp and signature workspace'
      : view === 'watermark' ? 'Watermark workspace' : 'Annotation workspace')
    const rightTabs = this.host.querySelectorAll<HTMLButtonElement>('[data-right-tab]')
    const toolsTab = rightTabs[0]
    const annotationsTab = rightTabs[1]
    if (toolsTab !== undefined) {
      toolsTab.textContent = view === 'stamp-sign'
        ? 'Stamp & Sign'
        : view === 'watermark' ? 'Watermark' : 'Tools'
    }
    if (annotationsTab !== undefined) {
      annotationsTab.textContent = view === 'stamp-sign' ? 'Placed' : 'Annotations'
    }
    const rightToggle = requireElement<HTMLButtonElement>(
      this.host, '.mobile-panel-toggle[data-panel="right"]'
    )
    rightToggle.textContent = view === 'stamp-sign'
      ? 'Stamp & Sign'
      : view === 'watermark' ? 'Watermark' : 'Tools'
    rightToggle.setAttribute('aria-label', view === 'stamp-sign'
      ? 'Open stamp and signature tools'
      : view === 'watermark' ? 'Open watermark controls' : 'Open annotation tools')
    const exportPdfTitle = requireElement<HTMLElement>(this.host, '.export-pdf strong')
    const exportPdfDescription = requireElement<HTMLElement>(this.host, '.export-pdf span')
    exportPdfTitle.textContent = view === 'stamp-sign'
      ? 'Stamped PDF'
      : view === 'highlighter'
        ? 'Highlighted PDF'
        : view === 'watermark' ? 'Watermarked PDF' : 'Annotated PDF'
    exportPdfDescription.textContent = view === 'stamp-sign'
      ? 'Stamp and signature appearances'
      : view === 'highlighter'
        ? 'Searchable text with editable highlights'
        : view === 'watermark' ? 'Source PDF with the current watermark' : 'Native, editable annotations'
  }

  /** Loads or replaces the sample document, then renders its current page. */
  public async load(reload = false): Promise<void> {
    this.setStatus('Loading PDF…')
    if (reload || this.document === null) {
      const shouldUseContinuous = this.pageFlow !== null || this.prefersContinuous
      this.pageFlow?.destroy()
      this.pageFlow = null
      const handle = await this.viewer.load(this.source)
      this.document = handle.document
      if ('url' in this.source) this.sourcePdf = new Uint8Array(await handle.document.getData())
      this.currentPageIndex = Math.min(this.currentPageIndex, handle.numPages - 1)
      await this.loadDocumentControls()
      if (shouldUseContinuous) {
        if (this.demoView === 'annotations') await this.importAllNativeAnnotations()
        await this.showContinuous()
      }
      else await this.renderCurrentPage()
    } else {
      await this.renderCurrentPage()
    }
    if (this.demoView === 'highlighter' || this.demoView === 'redaction') {
      try {
        await this.highlighterPanel.scanPreparedRules()
      } catch (cause) {
        this.reportError(cause)
      }
    }
  }

  /** Seeds the public showcase while the deterministic test harness stays empty. */
  public seedShowcase(): void {
    if (this.annotations.repository.getAll().length > 0) return
    this.annotations.createTextMarkup('highlight', {
      pageIndex: 0,
      text: 'Overview and document navigation',
      rects: [{ x: 24, y: 78, width: 188, height: 18 }]
    })
    const rectangle = this.annotations.createAnnotation({
      type: 'rectangle', pageIndex: 0,
      bounds: { x: 42, y: 126, width: 152, height: 58 },
      content: { text: 'Review area' }
    })
    this.annotations.createAnnotation({
      type: 'signature', pageIndex: 0,
      bounds: { x: 220, y: 182, width: 150, height: 50 },
      content: {
        text: 'Demo signature',
        signature: { kind: 'image', image: this.requireImageAsset('signature').image }
      }
    })
    this.annotations.setSelection({ ids: [rectangle.id], primaryId: rectangle.id })
    this.renderAnnotationList()
    this.setStatus(`Ready · ${this.sourceName} · page 1/${this.document?.numPages ?? 0} · 3 annotations`)
  }

  /** Seeds one example of each application-owned custom annotation. */
  public seedCustomShowcase(): void {
    if (this.annotations.repository.getAll().length > 0) return
    this.annotations.createAnnotation({
      type: DEMO_MEASUREMENT_TYPE,
      pageIndex: 0,
      bounds: { x: 36, y: 110, width: 142, height: 54 },
      content: { text: 'Measurement box' },
      typeData: { schemaVersion: 1, payload: { width: 142, height: 54, unit: 'pt' } }
    })
    this.annotations.createAnnotation({
      type: DEMO_REVIEW_AREA_TYPE,
      pageIndex: 0,
      bounds: { x: 204, y: 110, width: 168, height: 70 },
      content: { text: 'High-risk review area' },
      typeData: {
        schemaVersion: 1,
        payload: { category: 'legal-risk', severity: 'high', status: 'pending' }
      }
    })
    const issue = this.annotations.createAnnotation({
      type: DEMO_ISSUE_MARKER_TYPE,
      pageIndex: 0,
      bounds: { x: 388, y: 108, width: 24, height: 24 },
      content: { text: 'Missing signature' },
      typeData: {
        schemaVersion: 1,
        payload: { code: 'MISSING_SIGNATURE', severity: 'warning', resolved: false }
      }
    })
    this.annotations.setSelection({ ids: [issue.id], primaryId: issue.id })
    this.renderAnnotationList()
    this.setStatus('Ready · 3 application-owned custom annotations')
  }

  /** Renders canvas, TextLayer, native annotations, and Core annotation overlay. */
  private async renderCurrentPage(): Promise<void> {
    const document = this.document
    if (document === null) throw new Error('Demo PDF document is not loaded.')
    const page = await document.getPage(this.currentPageIndex + 1)
    const viewport = page.getViewport({ scale: this.scale })
    const context = this.canvas.getContext('2d')
    if (context === null) throw new Error('Canvas 2D context is unavailable.')
    if (this.demoView === 'annotations') await this.importNativeAnnotations(this.currentPageIndex)
    this.renderTask?.cancel()
    this.canvas.width = Math.ceil(viewport.width)
    this.canvas.height = Math.ceil(viewport.height)
    this.canvas.style.width = `${viewport.width}px`
    this.canvas.style.height = `${viewport.height}px`
    this.annotationHost.style.width = `${viewport.width}px`
    this.annotationHost.style.height = `${viewport.height}px`
    this.textLayerHost.style.width = `${viewport.width}px`
    this.textLayerHost.style.height = `${viewport.height}px`
    this.renderTask = page.render({ canvas: this.canvas, canvasContext: context, viewport })
    await this.renderTask.promise
    this.viewer.drawWatermark({ canvas: this.canvas, pageIndex: this.currentPageIndex })
    await this.viewer.attachTextLayer({
      pageIndex: this.currentPageIndex,
      container: this.textLayerHost,
      scale: this.scale,
      rotation: normalizeRotation(page.rotate)
    })
    if (isAnnotationDemo(this.demoView)) {
      await this.annotations.attachPage({
        pageIndex: this.currentPageIndex,
        container: this.annotationHost,
        width: viewport.width / this.scale,
        height: viewport.height / this.scale,
        scale: this.scale
      })
    }
    this.updateScaleControls()
    this.syncDocumentUi()
    this.setStatus(`Ready · ${this.sourceName} · page ${this.currentPageIndex + 1}/${document.numPages} · ${this.annotations.repository.getAll().length} annotations`)
  }

  /** Imports one page's supported native PDF annotations into the editable repository. */
  private async importNativeAnnotations(pageIndex: number): Promise<void> {
    const document = this.document
    if (document === null || this.nativeImports.has(pageIndex)) return
    const page = await document.getPage(pageIndex + 1)
    const [xMin, yMin, xMax, yMax] = normalizePageView(page.view)
    const imported = await importPdfJsAnnotationsWithMetadata([{
      pageIndex,
      pageBox: { xMin, yMin, xMax, yMax, rotation: normalizeRotation(page.rotate) },
      annotations: await page.getAnnotations()
    }], this.sourcePdf)
    this.nativeImports.set(pageIndex, imported)
    hideImportedPdfJsAnnotations(
      document.annotationStorage,
      imported.supportedIds,
      new Map(imported.annotations.map((annotation) => [annotation.id, annotation.pageIndex]))
    )
    for (const annotation of imported.annotations) {
      if (this.annotations.repository.getById(annotation.id) === undefined) {
        this.annotations.repository.add(annotation)
      }
    }
  }

  /** Preserves native annotation editing when the document starts in Continuous view. */
  private async importAllNativeAnnotations(): Promise<void> {
    const pageCount = this.document?.numPages ?? 0
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      await this.importNativeAnnotations(pageIndex)
    }
  }

  /** Finalizes shared document chrome for either single-page or Continuous rendering. */
  private syncDocumentUi(): void {
    const document = this.document
    if (document === null) return
    requireElement<HTMLElement>(this.host, '.stage-progress').hidden = true
    this.loadProgress.hidden = true
    requireElement<HTMLOutputElement>(this.host, '.page-count').value = String(document.numPages)
    requireElement<HTMLInputElement>(this.host, '.page-number').value = String(
      this.currentPageIndex + 1
    )
    requireElement<HTMLElement>(this.host, '.status-page').textContent =
      `Page ${this.currentPageIndex + 1} of ${document.numPages}`
    this.updateActiveThumbnail()
  }

  /** Releases all resources and removes this instance card. */
  public async destroy(): Promise<void> {
    this.pageFlow?.destroy()
    this.pageFlow = null
    for (const dispose of this.customAnnotationDisposers.splice(0)) dispose()
    this.renderTask?.cancel()
    this.renderTask = null
    this.unsubscribeViewer()
    this.unsubscribeAnnotations()
    this.releaseThumbnailUrls()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.singlePageGesture?.destroy()
    this.singlePageGesture = null
    this.highlighterPanel.destroy()
    this.unsubscribeHighlighter()
    this.highlighter.destroy()
    this.annotations.destroy()
    await this.viewer.destroy()
    if (this.copyCodeResetTimer !== null) clearTimeout(this.copyCodeResetTimer)
    this.copyCodeResetTimer = null
    this.host.remove()
  }

  /** Populates product UI from Core-owned outline and thumbnail services. */
  private async loadDocumentControls(): Promise<void> {
    const document = this.document
    if (document === null) return
    this.releaseThumbnailUrls()
    const outlineHost = requireElement<HTMLDivElement>(this.host, '.outline-items')
    const thumbnailHost = requireElement<HTMLDivElement>(this.host, '.thumbnail-items')
    outlineHost.replaceChildren()
    thumbnailHost.replaceChildren()
    const outline = await this.viewer.getOutline()
    for (const item of flattenOutline(outline)) {
      if (item.target === null) continue
      const button = documentFor(this.host).createElement('button')
      button.type = 'button'
      button.textContent = item.title
      button.addEventListener('click', () => {
        void this.showPage(item.target?.pageIndex ?? 0).catch((cause: unknown) => this.reportError(cause))
      })
      outlineHost.append(button)
    }
    for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
      const thumbnail = await this.viewer.renderThumbnail({ pageIndex, maxWidth: 86 })
      const url = URL.createObjectURL(thumbnail.blob)
      this.thumbnailUrls.push(url)
      const button = documentFor(this.host).createElement('button')
      button.type = 'button'
      button.className = 'thumbnail-button'
      button.dataset['pageIndex'] = String(pageIndex)
      button.setAttribute('aria-label', `Open page ${pageIndex + 1}`)
      const image = documentFor(this.host).createElement('img')
      image.src = url
      image.alt = `Page ${pageIndex + 1} thumbnail`
      image.width = Math.round(thumbnail.width)
      image.height = Math.round(thumbnail.height)
      const label = documentFor(this.host).createElement('span')
      label.textContent = String(pageIndex + 1)
      button.append(image, label)
      button.addEventListener('click', () => {
        void this.showPage(pageIndex).catch((cause: unknown) => this.reportError(cause))
      })
      thumbnailHost.append(button)
    }
  }

  /** Switches the single-page demo surface without reloading the PDF document. */
  private async showPage(pageIndex: number): Promise<void> {
    const document = this.document
    if (document === null || !Number.isSafeInteger(pageIndex)
      || pageIndex < 0 || pageIndex >= document.numPages) return
    if (this.pageFlow !== null) {
      this.currentPageIndex = pageIndex
      this.pageFlow.scrollToPage(pageIndex, 'smooth')
      this.setStatus(`Continuous · page ${pageIndex + 1}/${document.numPages}`)
      return
    }
    const previousPageIndex = this.currentPageIndex
    this.viewer.detachTextLayer(previousPageIndex)
    this.annotations.detachPage(previousPageIndex)
    this.currentPageIndex = pageIndex
    await this.renderCurrentPage()
  }

  /** Returns one rotation-aware unscaled page size for product-owned batch placement. */
  private async getPageSize(pageIndex: number): Promise<{ width: number; height: number }> {
    const document = this.document
    if (document === null || !Number.isSafeInteger(pageIndex)
      || pageIndex < 0 || pageIndex >= document.numPages) {
      throw new Error('Stamp & Sign page is unavailable.')
    }
    const page = await document.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale: 1 })
    return { width: viewport.width, height: viewport.height }
  }

  /** Runs Core search and renders only the product-owned result controls. */
  private async runSearch(): Promise<void> {
    const input = requireElement<HTMLInputElement>(this.host, '.search-input')
    const resultsHost = requireElement<HTMLDivElement>(this.host, '.search-results')
    const result = await this.viewer.search(input.value, { wholeWord: false, maxResults: 30 })
    this.viewer.setSearchHighlights(result.matches, result.matches.length === 0 ? null : 0)
    resultsHost.replaceChildren()
    result.matches.forEach((match, index) => {
      const button = documentFor(this.host).createElement('button')
      button.type = 'button'
      button.textContent = `Page ${match.pageIndex + 1} · ${match.preview}`
      button.addEventListener('click', () => {
        this.viewer.setSearchHighlights(result.matches, index)
        void this.showPage(match.pageIndex).catch((cause: unknown) => this.reportError(cause))
      })
      resultsHost.append(button)
    })
    this.setStatus(`${result.matches.length} search results${result.truncated ? ' (limited)' : ''}`)
  }

  /** Presents product UI for one retained Core text selection. */
  private handleTextSelectionChange(selection: PdfActiveTextSelection | null): void {
    if (this.demoView !== 'annotations') {
      this.textSelectionMenu.hidden = true
      return
    }
    if (selection === null) {
      this.textSelectionMenu.hidden = true
      if (this.textSelectionMenu.contains(this.host.ownerDocument.activeElement)) {
        this.restoreTextSelectionFocus()
      } else {
        this.textSelectionFocusReturn = null
      }
      return
    }
    const tool = this.annotations.getTool()
    if (tool === 'highlight' || tool === 'strikeout' || tool === 'underline') {
      this.applyTextMarkup(tool)
      return
    }
    const nativeSelection = this.host.ownerDocument.getSelection()
    const anchor = nativeSelection !== null && nativeSelection.rangeCount === 1
      ? nativeSelection.getRangeAt(0).getBoundingClientRect()
      : this.host.getBoundingClientRect()
    this.textSelectionMenu.style.left = `${anchor.left + anchor.width / 2}px`
    this.textSelectionMenu.style.top = `${anchor.top}px`
    this.textSelectionMenu.hidden = false
    if (selection.source === 'keyboard') {
      const active = this.host.ownerDocument.activeElement
      this.textSelectionFocusReturn = active instanceof HTMLElement && this.host.contains(active)
        ? active
        : this.host
      queueMicrotask(() => this.textSelectionMenu.querySelector<HTMLButtonElement>('button')?.focus())
    }
  }

  /** Creates page-scoped markup from the current retained Core selection. */
  private applyTextMarkup(type: 'highlight' | 'strikeout' | 'underline'): void {
    const active = this.viewer.getTextSelection()
    if (active === null) return
    const selections: readonly PdfTextSelection[] = active.kind === 'page'
      ? [active.selection]
      : active.selection.fragments
    const annotations = selections.map((selection) => this.annotations.createTextMarkup(type, {
      pageIndex: selection.pageIndex,
      text: selection.text,
      rects: selection.rects.map((rect) => ({ ...rect }))
    }))
    const ids = annotations.map((annotation) => annotation.id)
    const primaryId = ids.at(-1)
    if (ids.length > 1) {
      this.annotations.setSelection(primaryId === undefined ? { ids: [] } : { ids, primaryId })
    }
    this.viewer.clearTextSelection()
    this.restoreTextSelectionFocus()
    this.setStatus(active.kind === 'document'
      ? `Created grouped ${type} from cross-page PDF text`
      : `Created ${type} from selected PDF text`)
  }

  /** Revokes product-owned thumbnail object URLs before reload or destroy. */
  private releaseThumbnailUrls(): void {
    for (const url of this.thumbnailUrls) URL.revokeObjectURL(url)
    this.thumbnailUrls = []
  }

  /** Connects product-shell controls to public Core APIs. */
  private bindControls(): void {
    this.toolSelect.addEventListener('change', () => {
      const tool = this.toolSelect.value as AnnotationTool
      this.annotations.setTool(tool)
      if (tool !== 'select') this.annotations.setSelection({ ids: [] })
      this.updateAppearanceControls()
      if ((tool === 'highlight' || tool === 'strikeout' || tool === 'underline')
        && this.viewer.getTextSelection() !== null) {
        this.applyTextMarkup(tool)
      } else {
        if (tool !== 'text-select') this.textSelectionMenu.hidden = true
        this.setStatus(`Tool: ${tool}`)
      }
    })
    this.appearanceColor.addEventListener('input', () => this.applyAppearanceControl())
    this.appearanceWidth.addEventListener('input', () => this.applyAppearanceControl())
    this.appearanceFillColor.addEventListener('input', () => this.applyAppearanceControl())
    this.appearanceOpacity.addEventListener('input', () => this.applyAppearanceControl())
    this.appearanceDash.addEventListener('change', () => this.applyAppearanceControl())
    this.appearanceFontSize.addEventListener('input', () => this.applyAppearanceControl())
    requireElement<HTMLSelectElement>(this.host, '.tag-visibility').addEventListener('change', (event) => {
      const visibility = (event.currentTarget as HTMLSelectElement).value
      if (visibility === 'auto' || visibility === 'always' || visibility === 'hidden') {
        this.annotations.setAuthorLabelVisibility(visibility)
        this.setStatus(`Annotation tags: ${visibility}`)
      }
    })
    this.textSelectionMenu.addEventListener('pointerdown', (event) => event.preventDefault())
    this.textSelectionMenu.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-text-markup]')
      const type = button?.dataset['textMarkup']
      if (type === 'highlight' || type === 'strikeout' || type === 'underline') {
        this.applyTextMarkup(type)
      }
    })
    this.textSelectionMenu.addEventListener('keydown', (event) => {
      const buttons = [...this.textSelectionMenu.querySelectorAll<HTMLButtonElement>('button')]
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && index >= 0) {
        buttons[(index + 1) % buttons.length]?.focus()
        event.preventDefault()
      } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && index >= 0) {
        buttons[(index - 1 + buttons.length) % buttons.length]?.focus()
        event.preventDefault()
      } else if (event.key === 'Escape') {
        this.viewer.clearTextSelection()
        this.restoreTextSelectionFocus()
        event.preventDefault()
      }
    })
    requireElement<HTMLButtonElement>(this.host, '.zoom-in').addEventListener('click', () => {
      void this.stepViewerScale('in').catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.zoom-out').addEventListener('click', () => {
      void this.stepViewerScale('out').catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLSelectElement>(this.host, '.scale-select').addEventListener('change', (event) => {
      const value = parseScaleValue((event.currentTarget as HTMLSelectElement).value)
      void this.setViewerScale(value).catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.continuous').addEventListener('click', () => {
      void this.showContinuous().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.single').addEventListener('click', () => {
      void this.showSingle().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.prepare-print').addEventListener('click', () => {
      void this.prepareRasterPrint().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.export-redacted').addEventListener('click', () => {
      void this.exportRedactedPdf().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.print').addEventListener('click', () => {
      void this.printRaster().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.password-sample').addEventListener('click', () => {
      void this.loadPasswordSample().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.range-sample').addEventListener('click', () => {
      void this.loadRangeSample().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.mixed-sample').addEventListener('click', () => {
      void this.replaceSource(createMixedPagePdf(), 'mixed-page fixture')
        .catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.long-sample').addEventListener('click', () => {
      void this.replaceSource(createLongDocumentPdf(), 'long-document fixture')
        .catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.fail-url').addEventListener('click', () => {
      void this.runUrlRecovery('url').catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.fail-range').addEventListener('click', () => {
      void this.runUrlRecovery('range').catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.fail-render').addEventListener('click', () => {
      void this.runRenderRecovery().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.retry-recovery').addEventListener('click', () => {
      void this.retryRecovery().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.cancel-load').addEventListener('click', () => {
      void this.cancelLoading().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLInputElement>(this.host, '.pdf-file').addEventListener('change', (event) => {
      void this.loadSelectedFile(event).catch((cause: unknown) => this.reportError(cause))
    })
    const passwordForm = requireElement<HTMLFormElement>(this.host, '.password-form')
    passwordForm.addEventListener('submit', (event) => {
      event.preventDefault()
      const requestId = this.passwordRequestId
      if (requestId === null) return
      const input = requireElement<HTMLInputElement>(passwordForm, '.password-input')
      this.passwordRequestId = null
      requireElement<HTMLDialogElement>(this.host, '.password-dialog').close()
      this.viewer.submitPassword(requestId, input.value)
      input.value = ''
      this.setStatus('Checking PDF password…')
    })
    requireElement<HTMLButtonElement>(passwordForm, '.cancel-password').addEventListener('click', () => {
      void this.cancelPassword().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.reload').addEventListener('click', () => {
      void this.load(true).catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLFormElement>(this.host, '.search-form').addEventListener('submit', (event) => {
      event.preventDefault()
      void this.runSearch().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.comment').addEventListener('click', () => this.addComment())
    requireElement<HTMLButtonElement>(this.host, '.delete').addEventListener('click', () => this.deleteSelected())
    requireElement<HTMLButtonElement>(this.host, '.export-pdf').addEventListener('click', () => {
      void this.exportPdf().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.export-excel').addEventListener('click', () => {
      void this.exportExcel().catch((cause: unknown) => this.reportError(cause))
    })
  }

  /** Connects the product workspace chrome without leaking it into Core. */
  private bindWorkspaceShell(): void {
    const codeExample = DEMO_CODE_EXAMPLES[this.demoView]
    const codeDialog = requireElement<HTMLDialogElement>(this.host, '.code-dialog')
    const codeToggle = requireElement<HTMLButtonElement>(this.host, '.show-code')
    const codeCopy = requireElement<HTMLButtonElement>(codeDialog, '.code-copy')
    const codeBlock = requireElement<HTMLElement>(codeDialog, '.code-block code')
    const codeVariants = requireElement<HTMLElement>(codeDialog, '.code-variants')
    let selectedSource = codeExample.source
    requireElement<HTMLElement>(codeDialog, '.code-title').textContent = codeExample.title
    requireElement<HTMLElement>(codeDialog, '.code-summary').textContent = codeExample.summary
    requireElement<HTMLElement>(codeDialog, '.code-requirement').textContent =
      codeExample.requirement
    codeBlock.textContent = selectedSource
    requireElement<HTMLAnchorElement>(codeDialog, '.code-guide').href = codeExample.guideUrl
    requireElement<HTMLAnchorElement>(codeDialog, '.code-source').href = codeExample.sourceUrl
    if (codeExample.variants !== undefined) {
      codeVariants.hidden = false
      for (const [index, variant] of codeExample.variants.entries()) {
        const button = documentFor(this.host).createElement('button')
        button.type = 'button'
        button.role = 'tab'
        button.textContent = variant.label
        button.setAttribute('aria-selected', String(index === 0))
        button.addEventListener('click', () => {
          selectedSource = variant.source
          codeBlock.textContent = selectedSource
          for (const peer of codeVariants.querySelectorAll('[role="tab"]')) {
            peer.setAttribute('aria-selected', String(peer === button))
          }
          codeBlock.parentElement?.scrollTo({ top: 0 })
        })
        codeVariants.append(button)
      }
    }
    codeToggle.addEventListener('click', () => codeDialog.showModal())
    requireElement<HTMLButtonElement>(codeDialog, '.code-close').addEventListener(
      'click', () => codeDialog.close()
    )
    codeDialog.addEventListener('click', (event) => {
      if (event.target === codeDialog) codeDialog.close()
    })
    codeCopy.addEventListener('click', () => {
      void copyText(selectedSource, codeDialog.ownerDocument).then(() => {
        codeCopy.textContent = 'Copied'
        codeCopy.dataset['copied'] = 'true'
        if (this.copyCodeResetTimer !== null) clearTimeout(this.copyCodeResetTimer)
        this.copyCodeResetTimer = setTimeout(() => {
          codeCopy.textContent = 'Copy code'
          delete codeCopy.dataset['copied']
          this.copyCodeResetTimer = null
        }, 1_800)
      }).catch((cause: unknown) => this.reportError(cause))
    })

    for (const button of this.host.querySelectorAll<HTMLButtonElement>('[data-side-tab]')) {
      button.addEventListener('click', () => this.activatePanel('side', button.dataset['sideTab'] ?? 'pages'))
    }
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('[data-right-tab]')) {
      button.addEventListener('click', () => this.activatePanel('right', button.dataset['rightTab'] ?? 'tools'))
    }
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('[data-tool], [data-tool-shortcut]')) {
      button.addEventListener('click', () => {
        const tool = button.dataset['tool'] ?? button.dataset['toolShortcut']
        if (tool === undefined) return
        this.toolSelect.value = tool
        this.toolSelect.dispatchEvent(new Event('change', { bubbles: true }))
        if (window.matchMedia('(max-width: 960px)').matches) this.closeMobilePanels()
      })
    }
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('.mobile-panel-toggle')) {
      button.addEventListener('click', () => this.openMobilePanel(button.dataset['panel'] === 'left' ? 'left' : 'right'))
    }
    for (const button of this.host.querySelectorAll<HTMLButtonElement>('.mobile-panel-close')) {
      button.addEventListener('click', () => this.closeMobilePanels())
    }
    requireElement<HTMLElement>(this.host, '.mobile-scrim').addEventListener('click', () => this.closeMobilePanels())

    requireElement<HTMLButtonElement>(this.host, '.previous-page').addEventListener('click', () => {
      void this.showPage(Math.max(0, this.currentPageIndex - 1)).catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.next-page').addEventListener('click', () => {
      void this.showPage(Math.min((this.document?.numPages ?? 1) - 1, this.currentPageIndex + 1))
        .catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLInputElement>(this.host, '.page-number').addEventListener('change', (event) => {
      const page = Number.parseInt((event.currentTarget as HTMLInputElement).value, 10)
      void this.showPage(page - 1).catch((cause: unknown) => this.reportError(cause))
    })

    const outputToggle = requireElement<HTMLButtonElement>(this.host, '.output-toggle')
    const outputMenu = requireElement<HTMLElement>(this.host, '.output-menu')
    outputToggle.addEventListener('click', () => {
      outputMenu.hidden = !outputMenu.hidden
      outputToggle.setAttribute('aria-expanded', String(!outputMenu.hidden))
    })
    outputMenu.addEventListener('click', () => {
      outputMenu.hidden = true
      outputToggle.setAttribute('aria-expanded', 'false')
    })

    const lab = requireElement<HTMLDialogElement>(this.host, '.capability-dialog')
    const labToggle = requireElement<HTMLButtonElement>(this.host, '.capability-toggle')
    labToggle.addEventListener('click', () => {
      lab.showModal()
      labToggle.setAttribute('aria-expanded', 'true')
    })
    requireElement<HTMLButtonElement>(this.host, '.capability-close').addEventListener('click', () => lab.close())
    lab.addEventListener('close', () => labToggle.setAttribute('aria-expanded', 'false'))
    lab.addEventListener('click', (event) => {
      if (event.target === lab) lab.close()
    })
    for (const button of lab.querySelectorAll<HTMLButtonElement>(
      '.password-sample, .mixed-sample, .long-sample'
    )) {
      button.addEventListener('click', () => lab.close())
    }
    requireElement<HTMLButtonElement>(this.host, '.restart-instance').addEventListener('click', () => destroyAll.click())

    const watermarkEnabled = requireElement<HTMLInputElement>(this.host, '.watermark-enabled')
    const watermarkText = requireElement<HTMLInputElement>(this.host, '.watermark-text')
    const watermarkLayout = requireElement<HTMLSelectElement>(this.host, '.watermark-layout')
    const watermarkOpacity = requireElement<HTMLInputElement>(this.host, '.watermark-opacity')
    const watermarkRotation = requireElement<HTMLInputElement>(this.host, '.watermark-rotation')
    const watermarkViewer = requireElement<HTMLInputElement>(this.host, '.watermark-target-viewer')
    const watermarkPrint = requireElement<HTMLInputElement>(this.host, '.watermark-target-print')
    const watermarkExport = requireElement<HTMLInputElement>(this.host, '.watermark-target-export')
    const updateWatermarkOutputs = (): void => {
      requireElement<HTMLOutputElement>(this.host, '.watermark-opacity-value').value =
        `${Math.round(Number(watermarkOpacity.value) * 100)}%`
      requireElement<HTMLOutputElement>(this.host, '.watermark-rotation-value').value =
        `${watermarkRotation.value}°`
    }
    const updateWatermark = (): void => {
      this.viewer.setWatermark(watermarkEnabled.checked ? {
        text: watermarkText.value.trim() || 'InkLayer Core',
        layout: watermarkLayout.value === 'center' ? 'center' : 'repeated',
        opacity: Number(watermarkOpacity.value),
        rotation: Number(watermarkRotation.value),
        targets: {
          viewer: watermarkViewer.checked,
          print: watermarkPrint.checked,
          export: watermarkExport.checked,
          thumbnails: false
        }
      } : null)
      void this.load(true).catch((cause: unknown) => this.reportError(cause))
    }
    watermarkOpacity.addEventListener('input', updateWatermarkOutputs)
    watermarkRotation.addEventListener('input', updateWatermarkOutputs)
    for (const control of [
      watermarkEnabled, watermarkText, watermarkLayout, watermarkOpacity, watermarkRotation,
      watermarkViewer, watermarkPrint, watermarkExport
    ]) control.addEventListener('change', updateWatermark)
    updateWatermarkOutputs()
    requireElement<HTMLInputElement>(this.host, '.owner-only').addEventListener('change', (event) => {
      const enabled = (event.currentTarget as HTMLInputElement).checked
      this.annotations.setPermissions(enabled ? { mode: 'owner-only' } : { mode: 'unrestricted' })
      this.pushEvent(`capability · permissions ${enabled ? 'owner-only' : 'unrestricted'}`)
      this.setStatus(`Annotation permissions: ${enabled ? 'owner-only' : 'unrestricted'}`)
    })
    this.toolSelect.value = this.annotations.getTool()
    this.syncToolButtons()
  }

  /** Registers every application Definition and mounts a custom-only palette. */
  private installCustomAnnotationTypes(): void {
    for (const item of DEMO_CUSTOM_ANNOTATIONS) {
      this.customAnnotationDisposers.push(
        this.annotations.annotationTypes.register(item.createDefinition())
      )
    }
    const group = documentFor(this.host).createElement('section')
    group.className = 'tool-group custom-tool-group'
    group.innerHTML = `<h3>Application Definitions</h3><div class="tool-grid">${DEMO_CUSTOM_ANNOTATIONS.map((item) => `<button class="tool-button" type="button" data-tool="${item.type}" aria-label="${item.label}" title="${item.description}">${toolIcon(item.iconTool)}<span>${item.label}</span></button>`).join('')}</div>`
    requireElement<HTMLElement>(this.host, '.tool-palette').append(group)
    for (const item of DEMO_CUSTOM_ANNOTATIONS) {
      const option = documentFor(this.host).createElement('option')
      option.value = item.type
      option.textContent = item.label
      this.toolSelect.append(option)
    }
  }

  /** Switches one sidebar tab while preserving accessible selected state. */
  private activatePanel(region: 'side' | 'right', name: string): void {
    this.view.activatePanel(region, name)
  }

  /** Opens a responsive navigation or inspector drawer. */
  private openMobilePanel(region: 'left' | 'right'): void {
    this.view.openMobilePanel(region)
  }

  /** Closes every responsive drawer. */
  private closeMobilePanels(): void {
    this.view.closeMobilePanels()
  }

  /** Mirrors the active Core tool into every product-owned tool control. */
  private syncToolButtons(): void {
    this.view.syncToolButtons(this.annotations.getTool())
  }

  /** Adds one compact sanitized Core activity item for the developer lab. */
  private pushEvent(message: string): void {
    this.view.pushEvent(message)
  }

  /** Renders the canonical repository as a navigable product review list. */
  private renderAnnotationList(): void {
    const annotations = this.annotations.repository.getAll()
    const selectedId = this.annotations.repository.getSelection().primaryId
    this.view.renderAnnotationList(annotations, selectedId, (annotation) => {
        this.annotations.setSelection({ ids: [annotation.id], primaryId: annotation.id }, 'sidebar')
        void this.showPage(annotation.pageIndex).catch((cause: unknown) => this.reportError(cause))
    })
  }

  /** Marks the current thumbnail for keyboard and visual navigation. */
  private updateActiveThumbnail(): void {
    this.view.updateActiveThumbnail(this.currentPageIndex)
  }

  /** Connects the manual single-page surface to Core's shared pinch/wheel recognizer. */
  private attachSinglePageGesture(): void {
    const container = requireElement<HTMLDivElement>(this.host, '.page-scroll')
    this.singlePageGesture = createPdfZoomGestureController({
      container,
      getScale: () => this.gestureScale,
      setScale: (scale) => {
        this.gestureScale = scale
        this.pendingGestureScale = scale
        this.queueSinglePageGestureScale()
      },
      minScale: 0.1,
      maxScale: 10
    })
  }

  /** Coalesces manual-page gesture frames while a prior PDF render is pending. */
  private queueSinglePageGestureScale(): void {
    if (this.gestureScaleCommit !== null) return
    this.gestureScaleCommit = (async () => {
      while (this.pendingGestureScale !== null) {
        const scale = this.pendingGestureScale
        this.pendingGestureScale = null
        await this.setViewerScale(scale)
      }
    })().catch((cause: unknown) => this.reportError(cause)).finally(() => {
      this.gestureScaleCommit = null
      if (this.pendingGestureScale !== null) this.queueSinglePageGestureScale()
    })
  }

  /** Reflects the selected tool or annotation's semantic V1 appearance. */
  private updateAppearanceControls(): void {
    const selectedId = this.annotations.repository.getSelection().primaryId
    const selected = selectedId === undefined ? undefined : this.annotations.repository.getById(selectedId)
    const type = selected?.type ?? persistedTool(this.annotations.getTool())
    if (type === null) {
      this.appearanceColor.disabled = true
      this.appearanceWidth.disabled = true
      this.appearanceFillColor.disabled = true
      this.appearanceOpacity.disabled = true
      this.appearanceDash.disabled = true
      this.appearanceFontSize.disabled = true
      requireElement<HTMLElement>(this.host, '.appearance-target').textContent = 'Choose a drawing tool'
      return
    }
    if (!this.annotations.annotationTypes.has(type)) {
      this.appearanceColor.disabled = true
      this.appearanceWidth.disabled = true
      this.appearanceFillColor.disabled = true
      this.appearanceOpacity.disabled = true
      this.appearanceDash.disabled = true
      this.appearanceFontSize.disabled = true
      requireElement<HTMLElement>(this.host, '.appearance-target').textContent = `Selected ${type} · plugin unavailable`
      return
    }
    const appearance = selected?.appearance ?? this.annotations.getToolAppearance(type)
    const capabilities = this.annotations.getAppearanceCapabilities(type)
    requireElement<HTMLElement>(this.host, '.appearance-target').textContent = selected === undefined
      ? `New ${type}` : `Selected ${type}`
    this.appearanceColor.disabled = appearance.stroke === null
      && appearance.fill === null && appearance.text === null
    this.appearanceColor.value = appearance.stroke?.color
      ?? appearance.fill?.color ?? appearance.text?.color ?? '#000000'
    this.appearanceWidth.disabled = !capabilities.stroke || appearance.stroke === null
    this.appearanceWidth.value = String(appearance.stroke?.width ?? 2)
    requireElement<HTMLOutputElement>(this.host, '.appearance-width-value').value = `${appearance.stroke?.width ?? 2} pt`
    this.appearanceFillColor.disabled = !capabilities.fill
    this.appearanceFillColor.value = appearance.fill?.color ?? '#ffffff'
    this.appearanceOpacity.disabled = false
    this.appearanceOpacity.value = String(appearance.opacity)
    requireElement<HTMLOutputElement>(this.host, '.appearance-opacity-value').value = `${Math.round(appearance.opacity * 100)}%`
    this.appearanceDash.disabled = !capabilities.dash || appearance.stroke === null
    const dash = appearance.stroke?.dash ?? []
    this.appearanceDash.value = dash.length === 0 ? 'solid' : dash[0] === 1 ? 'dotted' : 'dashed'
    this.appearanceFontSize.disabled = !capabilities.text || appearance.text === null
    this.appearanceFontSize.value = String(appearance.text?.fontSize ?? 14)
    requireElement<HTMLElement>(this.host, '.appearance-fill-field').hidden = !capabilities.fill
    requireElement<HTMLElement>(this.host, '.appearance-width-field').hidden = !capabilities.stroke
    requireElement<HTMLElement>(this.host, '.appearance-dash-field').hidden = !capabilities.dash
    requireElement<HTMLElement>(this.host, '.appearance-font-field').hidden = !capabilities.text
  }

  /** Applies demo controls through Core APIs to future creation or the primary selection. */
  private applyAppearanceControl(): void {
    const selectedId = this.annotations.repository.getSelection().primaryId
    const selected = selectedId === undefined ? undefined : this.annotations.repository.getById(selectedId)
    const type = selected?.type ?? persistedTool(this.annotations.getTool())
    if (type === null) return
    const current = selected?.appearance ?? this.annotations.getToolAppearance(type)
    const color = this.appearanceColor.value
    const width = Number.parseFloat(this.appearanceWidth.value)
    const opacity = Number.parseFloat(this.appearanceOpacity.value)
    const fontSize = Number.parseFloat(this.appearanceFontSize.value)
    const capabilities = this.annotations.getAppearanceCapabilities(type)
    const dash = this.appearanceDash.value === 'dashed' ? [6, 4]
      : this.appearanceDash.value === 'dotted' ? [1, 3] : []
    const override = {
      ...(Number.isFinite(opacity) ? { opacity } : {}),
      ...(current.stroke !== null ? { stroke: {
        color,
        ...(Number.isFinite(width) && width > 0 ? { width } : {}),
        ...(capabilities.dash ? { dash } : {})
      } } : {}),
      ...(capabilities.fill ? { fill: {
        color: this.appearanceFillColor.value,
        opacity: current.fill?.opacity ?? 0.2
      } } : {}),
      ...(current.text !== null ? { text: {
        color,
        ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {})
      } } : {})
    }
    if (selectedId === undefined) this.annotations.setToolAppearance(type, override)
    else this.annotations.updateAppearance(selectedId, override)
    this.updateAppearanceControls()
  }

  /** Switches from the single-page surface to Core-owned virtual page flow. */
  private async showContinuous(): Promise<void> {
    this.prefersContinuous = true
    if (this.pageFlow !== null) return
    this.viewer.detachTextLayer(this.currentPageIndex)
    this.annotations.detachPage(this.currentPageIndex)
    requireElement<HTMLElement>(this.host, '.page-scroll').hidden = true
    const flowHost = requireElement<HTMLDivElement>(this.host, '.flow-scroll')
    flowHost.hidden = false
    this.pageFlow = await createPdfPageFlow({
      viewer: this.viewer,
      ...(isAnnotationDemo(this.demoView) ? { annotations: this.annotations } : {}),
      container: flowHost,
      scale: this.scaleValue,
      onCurrentPageChanged: (pageIndex) => {
        this.currentPageIndex = pageIndex
        this.syncDocumentUi()
        this.setStatus(`Continuous · page ${pageIndex + 1}/${this.document?.numPages ?? 0}`)
      },
      onScaleChanged: (state) => {
        this.scaleValue = state.value
        this.scale = state.scale
        this.gestureScale = state.scale
        this.updateScaleControls()
      }
    })
    this.scale = this.pageFlow.getScale().scale
    this.gestureScale = this.scale
    this.updateScaleControls()
    this.pageFlow.scrollToPage(this.currentPageIndex)
    this.updateLayoutControls(true)
    this.syncDocumentUi()
    this.setStatus(
      `Ready · ${this.sourceName} · page ${this.currentPageIndex + 1}/${this.document?.numPages ?? 0} · ${this.annotations.repository.getAll().length} annotations`
    )
  }

  /** Returns to the compact single-page debugger without reloading the PDF. */
  private async showSingle(): Promise<void> {
    this.prefersContinuous = false
    if (this.pageFlow === null) return
    const scaleState = this.pageFlow.getScale()
    this.scaleValue = scaleState.value
    this.scale = scaleState.scale
    this.gestureScale = this.scale
    this.pageFlow.destroy()
    this.pageFlow = null
    requireElement<HTMLDivElement>(this.host, '.flow-scroll').hidden = true
    requireElement<HTMLElement>(this.host, '.page-scroll').hidden = false
    this.updateLayoutControls(false)
    await this.renderCurrentPage()
  }

  /** Builds a real raster print artifact through the ready Viewer and repository. */
  private async prepareRasterPrint(): Promise<Uint8Array> {
    if (this.demoView === 'redaction') {
      const bytes = await this.buildReviewedRedaction()
      this.setStatus(`Prepared secure redacted print · ${bytes.byteLength} bytes`)
      return bytes
    }
    this.setStatus('Preparing raster print…')
    const previewAnnotations = this.demoView === 'highlighter'
      ? await this.createHighlighterPrintAnnotations()
      : null
    try {
      const bytes = await buildSecureRasterPrintPdf({
        viewer: this.viewer,
        ...(isAnnotationDemo(this.demoView) ? { annotations: this.annotations } : {}),
        ...(previewAnnotations === null ? {} : { annotations: previewAnnotations }),
        pixelRatio: 1.5,
        onProgress: (complete, total) => this.setStatus(`Preparing print ${complete}/${total}`)
      })
      const included = this.highlighter.getSnapshot().includedCount
      this.setStatus(this.demoView === 'highlighter'
        ? `Prepared raster print · ${included} keyword highlights · ${bytes.byteLength} bytes`
        : `Prepared raster print · ${bytes.byteLength} bytes`)
      return bytes
    } finally {
      previewAnnotations?.destroy()
    }
  }

  /** Builds and downloads an image-only PDF from the currently included matches. */
  private async exportRedactedPdf(): Promise<void> {
    const button = requireElement<HTMLButtonElement>(this.host, '.export-redacted')
    const desktopLabel = requireElement<HTMLElement>(button, '.export-redacted-label')
    const mobileLabel = requireElement<HTMLElement>(button, '.export-redacted-label-mobile')
    button.disabled = true
    button.dataset['busy'] = 'true'
    desktopLabel.textContent = 'Exporting…'
    mobileLabel.textContent = 'Exporting…'
    const snapshot = this.highlighter.getSnapshot()
    const included = snapshot.matches.filter((match) => match.reviewState === 'included')
    try {
      const bytes = await this.buildReviewedRedaction()
      downloadBlob({
        content: bytes,
        filename: 'inklayer-redacted.pdf',
        mimeType: 'application/pdf'
      })
      this.setStatus(
        `Exported redacted copy · ${included.length} ranges · ${bytes.byteLength} bytes`
      )
    } finally {
      delete button.dataset['busy']
      desktopLabel.textContent = 'Export redacted copy'
      mobileLabel.textContent = 'Export redacted'
      this.updateRedactionOutputActions(this.highlighter.getSnapshot())
    }
  }

  /** Keeps top-level print and export actions aligned with current review state. */
  private updateRedactionOutputActions(snapshot: KeywordHighlighterSnapshot): void {
    if (this.demoView !== 'redaction') return
    const ready = snapshot.status === 'ready' && snapshot.includedCount > 0
    const exportButton = requireElement<HTMLButtonElement>(this.host, '.export-redacted')
    if (exportButton.dataset['busy'] !== 'true') exportButton.disabled = !ready
    requireElement<HTMLButtonElement>(this.host, '.print').disabled = !ready
  }

  /** Converts included Highlighter source ranges through Core's secure raster boundary. */
  private async buildReviewedRedaction(): Promise<Uint8Array> {
    const included = this.highlighter.getSnapshot().matches
      .filter((match) => match.reviewState === 'included')
    this.setStatus('Preparing secure redaction…')
    return await buildSecureRedactedPdf({
      viewer: this.viewer,
      ranges: included.map((match) => match.range),
      pixelRatio: 1.5,
      margin: 1,
      onProgress: (complete, total) => this.setStatus(`Redacting ${complete}/${total}`)
    })
  }

  /** Builds print-only annotations from the current included Highlighter preview. */
  private async createHighlighterPrintAnnotations(): Promise<AnnotationEngine | null> {
    const snapshot = this.highlighter.getSnapshot()
    const matches = snapshot.matches.filter((match) => match.reviewState === 'included')
    if (matches.length === 0) return null
    const resolved = await this.viewer.resolveTextRanges(matches.map((match) => match.range))
    const root = documentFor(this.host).createElement('div')
    const printAnnotations = createAnnotationEngine({ root })
    try {
      for (const rule of snapshot.rules) {
        const inputs = matches.flatMap((match, index) => {
          const range = resolved[index]
          return match.ruleId !== rule.id || range === undefined
            ? []
            : [{ id: `highlighter-print-${match.id}`, range }]
        })
        if (inputs.length > 0) {
          printAnnotations.createTextMarkupsFromRanges('highlight', inputs, {
            appearance: { fill: { color: rule.color, opacity: 0.42 } }
          })
        }
      }
      return printAnnotations
    } catch (cause) {
      printAnnotations.destroy()
      throw cause
    }
  }

  /** Builds the protected-document-safe artifact and opens the system print dialog. */
  private async printRaster(): Promise<void> {
    const bytes = await this.prepareRasterPrint()
    this.setStatus('Opening system print dialog…')
    await printPdfBlob({ content: bytes })
    this.setStatus(`Print dialog opened · ${bytes.byteLength} bytes`)
  }

  /** Loads the checked-in Mozilla encrypted fixture so password UI is directly testable. */
  private async loadPasswordSample(): Promise<void> {
    this.setStatus('Loading password-protected sample…')
    const response = await fetch(passwordPdfUrl)
    if (!response.ok) throw new Error('Password-protected sample could not be loaded.')
    await this.replaceSource(new Uint8Array(await response.arrayBuffer()), 'password sample')
  }

  /** Loads the delayed same-origin fixture through real automatic HTTP Range. */
  private async loadRangeSample(): Promise<void> {
    this.loadCancelled = false
    try {
      const source = new URL('range-sample.pdf?delay=120', window.location.href)
      await this.replaceUrlSource(source.href, 'URL Range sample')
    } catch (cause) {
      if (!this.loadCancelled) throw cause
      if (cause instanceof InkLayerError) this.showStructuredError(cause, true)
    }
  }

  /** Starts one deterministic fail-once URL or Range load and retains its retry. */
  private async runUrlRecovery(kind: 'url' | 'range'): Promise<void> {
    const requestId = `${kind}-${crypto.randomUUID()}`
    const name = kind === 'url' ? 'recovery URL sample' : 'recovery Range sample'
    const url = `/recovery-${kind}.pdf?request=${encodeURIComponent(requestId)}`
    this.recoveryRetry = async () => {
      await this.load(true)
      this.showRecoverySuccess(`${kind === 'url' ? 'URL' : 'Range'} retry loaded the PDF.`)
    }
    this.setStatus(`Triggering one ${kind === 'url' ? 'URL' : 'Range'} failure…`)
    await this.replaceUrlSource(url, name, kind === 'url' ? false : 'auto')
  }

  /** Forces one Core raster encode failure, leaving the identical request retryable. */
  private async runRenderRecovery(): Promise<void> {
    const pageIndex = this.currentPageIndex
    this.failNextRasterEncode = true
    this.recoveryRetry = async () => {
      await this.viewer.renderPageRaster({ pageIndex, scale: this.scale, pixelRatio: 1 })
      this.showRecoverySuccess(`Page ${pageIndex + 1} raster retry completed.`)
    }
    this.setStatus(`Triggering one page ${pageIndex + 1} raster failure…`)
    await this.viewer.renderPageRaster({ pageIndex, scale: this.scale, pixelRatio: 1 })
  }

  /** Repeats the exact failed operation retained by the product-owned demo shell. */
  private async retryRecovery(): Promise<void> {
    const retry = this.recoveryRetry
    if (retry === null) return
    requireElement<HTMLButtonElement>(this.host, '.retry-recovery').disabled = true
    this.setStatus('Retrying failed operation…')
    await retry()
  }

  /** Cancels only current Viewer work and leaves the selected source retryable. */
  private async cancelLoading(): Promise<void> {
    this.loadCancelled = true
    this.recoveryRetry = async () => {
      this.loadCancelled = false
      await this.load(true)
      this.showRecoverySuccess('Cancelled load completed after retry.')
    }
    this.pageFlow?.destroy()
    this.pageFlow = null
    this.document = null
    await this.viewer.cancelLoad()
    this.showStructuredError(new InkLayerError(
      'PDF_LOAD_CANCELLED',
      'PDF document loading was cancelled.',
      { operation: 'load' }
    ), true)
    this.setStatus('URL load cancelled · press Reload to retry')
  }

  /** Loads a user-selected PDF without retaining the File object. */
  private async loadSelectedFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file === undefined) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    input.value = ''
    await this.replaceSource(bytes, file.name)
  }

  /** Replaces the document source and clears annotations tied to the previous PDF. */
  private async replaceSource(bytes: Uint8Array, name: string): Promise<void> {
    this.pageFlow?.destroy()
    this.pageFlow = null
    this.annotations.repository.replaceAll([])
    this.annotations.setTool('select')
    this.nativeImports.clear()
    this.sourcePdf = new Uint8Array(bytes)
    this.source = { data: this.sourcePdf }
    this.sourceName = name
    this.setDocumentName(name)
    this.currentPageIndex = 0
    this.document = null
    await this.load(true)
  }

  /** Replaces the document with a same-origin URL source while retaining Range mode. */
  private async replaceUrlSource(
    url: string,
    name: string,
    range: 'auto' | false = 'auto'
  ): Promise<void> {
    this.pageFlow?.destroy()
    this.pageFlow = null
    this.annotations.repository.replaceAll([])
    this.annotations.setTool('select')
    this.nativeImports.clear()
    this.source = {
      url,
      range,
      rangeChunkSize: 32_768,
      headers: { 'X-InkLayer-Demo': 'url-range' },
      credentials: 'same-origin'
    }
    this.sourceName = name
    this.setDocumentName(name)
    this.currentPageIndex = 0
    this.document = null
    await this.load(true)
  }

  /** Presents only credential-free request metadata in an instance-owned dialog. */
  private showPasswordRequest(request: PdfPasswordRequest): void {
    this.passwordRequestId = request.requestId
    const dialog = requireElement<HTMLDialogElement>(this.host, '.password-dialog')
    const message = requireElement<HTMLParagraphElement>(dialog, '.password-message')
    message.textContent = request.reason === 'incorrect'
      ? `Incorrect password. Try again (attempt ${request.attempt}).`
      : `This PDF requires a password (attempt ${request.attempt}).`
    if (request.reason === 'incorrect') {
      this.recoveryRetry = null
      this.showRecoveryOutcome({
        state: 'warning',
        summary: 'Password rejected; the active Core request accepts another credential.',
        code: 'passwordRequired',
        operation: 'submitPassword',
        context: `reason=incorrect · attempt=${request.attempt}`
      })
    }
    if (!dialog.open) dialog.showModal()
    const input = requireElement<HTMLInputElement>(dialog, '.password-input')
    input.value = ''
    input.focus()
  }

  /** Cancels only the active generation-scoped password request. */
  private async cancelPassword(): Promise<void> {
    const requestId = this.passwordRequestId
    if (requestId === null) return
    this.passwordRequestId = null
    requireElement<HTMLDialogElement>(this.host, '.password-dialog').close()
    await this.viewer.cancelPassword(requestId)
    this.setStatus('Password entry cancelled.')
  }

  /** Returns the demo's prepared image asset after constructor setup. */
  private requireImageAsset(type: 'signature' | 'stamp') {
    const asset = this.annotations.getImageAsset(type)
    if (asset === null) throw new Error(`${type} demo image is unavailable.`)
    return asset
  }

  /** Adds one comment to the current primary selection. */
  private addComment(): void {
    const selected = this.selectedAnnotation()
    if (selected === undefined) return this.setStatus('Select an annotation before adding a comment.')
    this.annotations.addComment(selected.id, {
      id: `comment-${Date.now()}`,
      title: 'Vanilla review',
      content: 'Reviewed in the framework-free demo.',
      author: { id: 'reviewer', name: 'Reviewer' },
      date: new Date().toISOString()
    })
    this.setStatus(`Comment added to ${selected.type}`)
  }

  /** Deletes the current primary selection. */
  private deleteSelected(): void {
    const selected = this.selectedAnnotation()
    if (selected === undefined) return this.setStatus('Select an annotation before deleting.')
    this.annotations.deleteAnnotation(selected.id)
    this.setStatus(`Deleted ${selected.type}`)
  }

  /** Exports and downloads annotated PDF bytes. */
  private async exportPdf(): Promise<void> {
    const { buildAnnotatedPdf } = await import('@inklayer-dev/core/export/pdf')
    const watermark = this.viewer.getWatermark()
    const highlighted = this.demoView === 'highlighter'
      ? await this.createHighlighterPrintAnnotations()
      : null
    try {
      if (this.demoView === 'highlighter' && highlighted === null) {
        this.setStatus('No included keyword matches to export.')
        return
      }
      const source = highlighted ?? this.annotations
      const bytes = await buildAnnotatedPdf(this.sourcePdf, source.repository.getAll(), {
        annotationTypes: source.annotationTypes,
        ...(watermark === null ? {} : { watermark })
      })
      const filename = this.demoView === 'stamp-sign'
        ? 'inklayer-stamped.pdf'
        : this.demoView === 'highlighter'
          ? 'inklayer-highlighted.pdf'
          : this.demoView === 'watermark'
            ? 'inklayer-watermarked.pdf'
            : 'inklayer-annotations.pdf'
      downloadBlob({ content: bytes, filename, mimeType: 'application/pdf' })
      const description = this.demoView === 'stamp-sign'
        ? 'stamped '
        : this.demoView === 'highlighter'
          ? 'highlighted '
          : this.demoView === 'watermark' ? 'watermarked ' : ''
      this.setStatus(`Exported ${description}PDF · ${bytes.byteLength} bytes`)
    } finally {
      highlighted?.destroy()
    }
  }

  /** Exports and downloads annotation workbook bytes. */
  private async exportExcel(): Promise<void> {
    const { buildAnnotationWorkbook } = await import('@inklayer-dev/core/export/excel')
    const bytes = await buildAnnotationWorkbook(this.annotations.repository.getAll())
    downloadBlob({
      content: bytes,
      filename: 'inklayer-annotations.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    this.setStatus(`Exported workbook · ${bytes.byteLength} bytes`)
  }

  /** Returns the primary selected annotation when present. */
  private selectedAnnotation(): Annotation | undefined {
    const id = this.annotations.repository.getSelection().primaryId
    return id === undefined ? undefined : this.annotations.repository.getById(id)
  }

  /** Resolves and applies one numeric or adaptive scale across both demo layouts. */
  private async setViewerScale(value: PdfViewerScale): Promise<void> {
    this.scaleValue = value
    if (this.pageFlow !== null) {
      await this.pageFlow.setScale(value)
      this.scale = this.pageFlow.getScale().scale
    } else {
      const document = this.document
      if (document === null) return
      const page = await document.getPage(this.currentPageIndex + 1)
      const viewport = page.getViewport({ scale: 1 })
      const container = requireElement<HTMLDivElement>(this.host, '.page-scroll')
      const bounds = container.getBoundingClientRect()
      this.scale = resolvePdfViewerScale(value, {
        containerWidth: container.clientWidth || bounds.width,
        containerHeight: container.clientHeight || bounds.height,
        pageWidth: viewport.width,
        pageHeight: viewport.height
      })
      await this.renderCurrentPage()
    }
    this.updateScaleControls()
    this.gestureScale = this.scale
  }

  /** Steps from the resolved scale and leaves adaptive mode predictably. */
  private async stepViewerScale(direction: 'in' | 'out'): Promise<void> {
    const scale = stepPdfViewerScale(this.scale, direction, 0.1, 0.1, 10)
    await this.setViewerScale(scale)
  }

  /** Synchronizes the demo's product-owned preset and percentage controls. */
  private updateScaleControls(): void {
    const select = requireElement<HTMLSelectElement>(this.host, '.scale-select')
    const requested = String(this.scaleValue)
    select.value = [...select.options].some((option) => option.value === requested)
      ? requested
      : 'custom'
    requireElement<HTMLOutputElement>(this.host, '.scale-value').value = `${Math.round(this.scale * 100)}%`
    requireElement<HTMLElement>(this.host, '.status-scale').textContent = `${Math.round(this.scale * 100)}%`
  }

  /** Synchronizes layout buttons and the persistent status rail. */
  private updateLayoutControls(continuous: boolean): void {
    this.view.updateLayoutControls(continuous)
  }

  /** Updates product-owned file labels without changing the loaded source. */
  private setDocumentName(name: string): void {
    this.view.setDocumentName(name)
  }

  /** Updates the accessible status region. */
  private setStatus(message: string): void {
    this.status.dataset['state'] = 'ok'
    this.status.textContent = isAnnotationDemo(this.demoView)
      ? message
      : message.replace(/ · \d+ annotations$/u, '')
    const count = this.annotations.repository.getAll().length
    requireElement<HTMLElement>(this.host, '.status-annotations').textContent = `${count} annotations`
  }

  /** Projects one Core error without losing its stable machine-readable context. */
  private showStructuredError(error: InkLayerError, preserveStatus = false): void {
    this.showRecoveryOutcome({
      state: 'error',
      summary: error.message,
      code: error.code,
      operation: error.operation ?? '—',
      context: error.pageIndex === undefined ? '—' : `page=${error.pageIndex + 1}`
    })
    if (!preserveStatus) {
      this.status.dataset['state'] = 'error'
      this.status.textContent = `${error.code} · ${error.message}`
    }
  }

  /** Marks a retained retry successful and disables it until the next failure. */
  private showRecoverySuccess(summary: string): void {
    this.recoveryRetry = null
    this.setStatus(`Recovered · ${summary}`)
    this.showRecoveryOutcome({
      state: 'success',
      summary,
      code: 'RECOVERED',
      operation: 'retry',
      context: 'ready'
    })
  }

  /** Updates the instance-owned recovery panel for errors and typed events. */
  private showRecoveryOutcome(outcome: RecoveryOutcome): void {
    const panel = requireElement<HTMLDivElement>(this.host, '.recovery-outcome')
    panel.hidden = false
    panel.dataset['state'] = outcome.state
    requireElement<HTMLElement>(panel, '.recovery-summary').textContent = outcome.summary
    requireElement<HTMLElement>(panel, '.recovery-code').textContent = outcome.code
    requireElement<HTMLElement>(panel, '.recovery-operation').textContent = outcome.operation
    requireElement<HTMLElement>(panel, '.recovery-context').textContent = outcome.context
    requireElement<HTMLButtonElement>(this.host, '.retry-recovery').disabled =
      this.recoveryRetry === null
  }

  /** Presents an asynchronous failure without producing an unhandled rejection. */
  private reportError(cause: unknown): void {
    if (cause instanceof InkLayerError) {
      this.showStructuredError(cause)
      return
    }
    this.status.dataset['state'] = 'error'
    this.status.textContent = cause instanceof Error ? cause.message : 'Unexpected demo failure.'
  }

  /** Returns keyboard focus from the contextual TextLayer toolbar to its owner. */
  private restoreTextSelectionFocus(): void {
    const target = this.textSelectionFocusReturn
    this.textSelectionFocusReturn = null
    if (target?.isConnected === true) target.focus({ preventScroll: true })
  }
}

/** Requires one descendant with a narrowed DOM element type. */
function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector)
  if (element === null) throw new Error(`Required demo element is missing: ${selector}`)
  return element
}

/** Parses one product-owned scale control into the closed Core scale union. */
function parseScaleValue(value: string): PdfViewerScale {
  if (value === 'auto' || value === 'page-actual' || value === 'page-fit'
    || value === 'page-width' || value === 'page-height') return value
  const numeric = Number.parseFloat(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1
}

/** Returns whether container resizing must re-resolve one scale preset. */
function isAdaptiveScale(value: PdfViewerScale): boolean {
  return value === 'auto' || value === 'page-fit'
    || value === 'page-width' || value === 'page-height'
}

/** Narrows transient tools away from persisted annotation types. */
function persistedTool(tool: AnnotationTool): Annotation['type'] | null {
  return tool === 'select' || tool === 'text-select' ? null : tool
}

/** Returns the owner document for DOM creation in one demo instance. */
function documentFor(element: HTMLElement): Document {
  return element.ownerDocument
}

/** Copies code with the modern API and a selection fallback for restricted browsers. */
async function copyText(value: string, ownerDocument: Document): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = ownerDocument.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    ownerDocument.body.append(textarea)
    textarea.select()
    const copied = ownerDocument.execCommand('copy')
    textarea.remove()
    if (!copied) throw new Error('The code example could not be copied in this browser.')
  }
}

/** Flattens a document outline while preserving visible document order. */
function flattenOutline(items: readonly PdfOutlineItem[]): readonly PdfOutlineItem[] {
  return items.flatMap((item) => [item, ...flattenOutline(item.items)])
}

/** Returns the supported equivalent clockwise quarter-turn. */
function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const rotation = ((value % 360) + 360) % 360
  if (rotation === 0 || rotation === 90 || rotation === 180 || rotation === 270) return rotation
  throw new Error('PDF page rotation must be a quarter turn.')
}

/** Validates the four-number PDF.js page view tuple. */
function normalizePageView(view: readonly number[]): [number, number, number, number] {
  if (view.length !== 4 || view.some((value) => !Number.isFinite(value))) {
    throw new Error('PDF.js returned an invalid page view.')
  }
  const [xMin, yMin, xMax, yMax] = view
  if (xMin === undefined || yMin === undefined || xMax === undefined || yMax === undefined) {
    throw new Error('PDF.js returned an incomplete page view.')
  }
  return [xMin, yMin, xMax, yMax]
}

/** Draws a visible transparent signature image as application-owned input UI would. */
function createDemoSignature(label: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 120
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Demo signature canvas is unavailable.')
  context.strokeStyle = color
  context.lineWidth = 7
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(24, 82)
  context.bezierCurveTo(80, 12, 105, 114, 150, 55)
  context.bezierCurveTo(185, 12, 205, 110, 270, 54)
  context.stroke()
  context.font = 'italic 26px cursive'
  context.fillStyle = color
  context.fillText(label, 238, 96)
  return { image: canvas.toDataURL('image/png'), width: 180, height: 60, text: `${label} signature` }
}

/** Draws a visible raster stamp as application-owned selection UI would. */
function createDemoStamp() {
  const canvas = document.createElement('canvas')
  canvas.width = 280
  canvas.height = 120
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('Demo stamp canvas is unavailable.')
  context.strokeStyle = '#16803a'
  context.fillStyle = 'rgb(22 128 58 / 10%)'
  context.lineWidth = 8
  context.strokeRect(7, 7, 266, 106)
  context.fillRect(7, 7, 266, 106)
  context.font = 'bold 38px system-ui'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#16803a'
  context.fillText('APPROVED', 140, 60)
  return { image: canvas.toDataURL('image/png'), width: 140, height: 60, text: 'Approved stamp' }
}

/** Mounts the public single-workspace demo and loads its PDF. */
async function mountInstances(): Promise<void> {
  instances = []
  await activateDemoInstance(activeDemoView)
}

/** Lazily creates and restores one isolated capability workspace. */
async function activateDemoInstance(view: DemoView): Promise<void> {
  const generation = ++demoActivationGeneration
  for (const instance of instances) instance.setActive(false)
  let instance = instances.find((candidate) => candidate.demoView === view)
  if (instance === undefined) {
    instance = new DemoInstance(grid, 'Demo', '#175cd3', view)
    instances.push(instance)
    instance.setActive(true)
    await instance.load()
    if (new URL(window.location.href).searchParams.get('clean') !== '1') {
      if (view === 'annotations') instance.seedShowcase()
      if (view === 'custom-annotations') instance.seedCustomShowcase()
    }
  }
  if (generation !== demoActivationGeneration) {
    if (activeDemoView !== instance.demoView) instance.setActive(false)
    return
  }
  for (const candidate of instances) candidate.setActive(candidate === instance)
}

/** Reads one supported deep-link hash, defaulting invalid or empty routes to Viewer. */
function readDemoView(): DemoView {
  const candidate = window.location.hash.slice(1)
  return DEMO_VIEWS.includes(candidate as DemoView) ? candidate as DemoView : 'viewer'
}

/** Synchronizes top-level navigation, shared workspace visibility, and browser history state. */
function applyDemoView(view: DemoView): void {
  activeDemoView = view
  for (const link of demoRouteLinks) {
    const active = link.dataset['demoRoute'] === view
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  if (instances.length > 0) void activateDemoInstance(view)
}

for (const link of demoRouteLinks) {
  link.addEventListener('click', (event) => {
    const view = link.dataset['demoRoute']
    if (!DEMO_VIEWS.includes(view as DemoView)) return
    event.preventDefault()
    if (activeDemoView === view) return
    if (window.location.hash !== `#${view}`) history.pushState(null, '', `#${view}`)
    applyDemoView(view as DemoView)
  })
}
window.addEventListener('hashchange', () => applyDemoView(readDemoView()))
window.addEventListener('popstate', () => applyDemoView(readDemoView()))
if (window.location.hash !== `#${activeDemoView}`) {
  history.replaceState(null, '', `#${activeDemoView}`)
}
applyDemoView(activeDemoView)

destroyAll.addEventListener('click', () => {
  void Promise.all(instances.map(async (instance) => instance.destroy()))
    .then(mountInstances)
})

void mountInstances()
