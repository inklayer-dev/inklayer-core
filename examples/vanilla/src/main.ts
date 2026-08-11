/**
 * @file Complete framework-free InkLayer Core browser demonstration.
 * @description Exercises real PDF.js rendering, two Annotation Engines, every
 * tool, comments, reload, zoom, byte exporters, downloads, and teardown.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist'
import passwordPdfUrl from '../../../tests/fixtures/pdf/pr6531_1.pdf?url'

import {
  ANNOTATION_TOOL_DEFINITIONS,
  buildSecureRasterPrintPdf,
  CORE_VERSION,
  createAnnotationEngine,
  createPdfPageFlow,
  createPdfViewerEngine,
  downloadBlob,
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
  type PdfTextSelection,
  type PdfViewerScale,
  type PdfViewerEngine
} from 'inklayer-core'
import { importPdfJsAnnotations } from 'inklayer-core/import/pdfjs'
import 'inklayer-core/style'
import './demo.css'
import { createSamplePdf } from './sample-pdf'

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('Vanilla example root was not found.')

root.innerHTML = `
  <main class="demo-shell">
    <header class="demo-header">
      <div>
        <h1>InkLayer Core <small>v${CORE_VERSION}</small></h1>
        <p>Two independent, framework-free PDF and annotation instances. Choose a tool, drag on a page, add comments, zoom, reload, or export bytes.</p>
      </div>
      <button id="destroy-all" type="button">Destroy / remount</button>
    </header>
    <section id="instance-grid" class="instance-grid" aria-label="InkLayer demo instances"></section>
  </main>
`

const grid = requireElement<HTMLElement>(root, '#instance-grid')
const destroyAll = requireElement<HTMLButtonElement>(root, '#destroy-all')
const samplePdf = createSamplePdf()
let instances: DemoInstance[] = []

/** Owns one complete demo Viewer and Annotation Engine lifecycle. */
class DemoInstance {
  private readonly host: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly textLayerHost: HTMLDivElement
  private readonly annotationHost: HTMLDivElement
  private readonly status: HTMLElement
  private readonly toolSelect: HTMLSelectElement
  private readonly textSelectionMenu: HTMLDivElement
  private viewer: PdfViewerEngine
  private annotations: AnnotationEngine
  private document: PDFDocumentProxy | null = null
  private currentPageIndex = 0
  private scaleValue: PdfViewerScale = 1
  private scale = 1
  private renderTask: { cancel(): void; promise: Promise<unknown> } | null = null
  private thumbnailUrls: string[] = []
  private unsubscribeViewer: () => void
  private pageFlow: PdfPageFlowController | null = null
  private sourcePdf = samplePdf
  private sourceName = 'generated sample'
  private passwordRequestId: string | null = null
  private resizeObserver: ResizeObserver | null = null

  /** Creates DOM and Core instances for one isolated card. */
  public constructor(parent: HTMLElement, label: string, accent: string) {
    this.host = document.createElement('article')
    this.host.className = 'instance-card'
    this.host.style.setProperty('--inklayer-author-label-background', accent)
    this.host.innerHTML = instanceMarkup(label)
    parent.append(this.host)
    this.canvas = requireElement(this.host, '.pdf-canvas')
    this.textLayerHost = requireElement(this.host, '.text-layer-host')
    this.annotationHost = requireElement(this.host, '.annotation-host')
    this.status = requireElement(this.host, '.instance-status')
    this.toolSelect = requireElement(this.host, '.tool-select')
    this.textSelectionMenu = requireElement(this.host, '.text-selection-menu')
    this.viewer = createPdfViewerEngine()
    this.viewer.setWatermark({
      text: `${label} · InkLayer Core`,
      layout: 'repeated',
      opacity: 0.1,
      rotation: -28,
      targets: { viewer: true, print: true, export: false, thumbnails: false }
    })
    this.annotations = createAnnotationEngine({
      root: this.host,
      currentUser: { id: label.toLowerCase(), name: label }
    })
    this.annotations.setTool('text-select')
    this.unsubscribeViewer = this.viewer.subscribe((event) => {
      if (event.type === 'passwordRequired') this.showPasswordRequest(event.request)
      if (event.type === 'textSelectionChanged') this.handleTextSelectionChange(event.selection)
      if (event.type === 'loadProgress') {
        const label = event.progress.phase === 'probing'
          ? 'Checking Range support'
          : event.progress.phase === 'downloading' ? 'Downloading PDF' : 'Parsing PDF'
        const percentage = event.progress.percentage === null
          ? ''
          : ` · ${event.progress.percentage}%`
        this.setStatus(`${label}${percentage}`)
      }
    })
    this.bindControls()
    if (typeof ResizeObserver === 'function') {
      const pageScroll = requireElement<HTMLDivElement>(this.host, '.page-scroll')
      this.resizeObserver = new ResizeObserver(() => {
        if (this.pageFlow !== null || !isAdaptiveScale(this.scaleValue)) return
        void this.setViewerScale(this.scaleValue).catch((cause: unknown) => this.reportError(cause))
      })
      this.resizeObserver.observe(pageScroll)
    }
  }

  /** Loads or replaces the sample document, then renders its current page. */
  public async load(reload = false): Promise<void> {
    this.setStatus('Loading PDF…')
    if (reload || this.document === null) {
      const wasContinuous = this.pageFlow !== null
      this.pageFlow?.destroy()
      this.pageFlow = null
      const handle = await this.viewer.load({ data: this.sourcePdf })
      this.document = handle.document
      this.currentPageIndex = Math.min(this.currentPageIndex, handle.numPages - 1)
      await this.loadDocumentControls()
      if (wasContinuous) return await this.showContinuous()
    }
    await this.renderCurrentPage()
  }

  /** Renders canvas, TextLayer, native annotations, and Core annotation overlay. */
  private async renderCurrentPage(): Promise<void> {
    const document = this.document
    if (document === null) throw new Error('Demo PDF document is not loaded.')
    const page = await document.getPage(this.currentPageIndex + 1)
    const viewport = page.getViewport({ scale: this.scale })
    const context = this.canvas.getContext('2d')
    if (context === null) throw new Error('Canvas 2D context is unavailable.')
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
    const view = page.view
    const [xMin, yMin, xMax, yMax] = normalizePageView(view)
    const imported = importPdfJsAnnotations([{
      pageIndex: this.currentPageIndex,
      pageBox: {
        xMin, yMin, xMax, yMax,
        rotation: normalizeRotation(page.rotate)
      },
      annotations: await page.getAnnotations()
    }])
    for (const annotation of imported.annotations) {
      if (this.annotations.repository.getById(annotation.id) === undefined) {
        this.annotations.repository.add(annotation)
      }
    }
    await this.viewer.attachTextLayer({
      pageIndex: this.currentPageIndex,
      container: this.textLayerHost,
      scale: this.scale,
      rotation: normalizeRotation(page.rotate)
    })
    await this.annotations.attachPage({
      pageIndex: this.currentPageIndex,
      container: this.annotationHost,
      width: viewport.width / this.scale,
      height: viewport.height / this.scale,
      scale: this.scale
    })
    this.updateScaleControls()
    this.setStatus(`Ready · ${this.sourceName} · page ${this.currentPageIndex + 1}/${document.numPages} · ${this.annotations.repository.getAll().length} annotations`)
  }

  /** Releases all resources and removes this instance card. */
  public async destroy(): Promise<void> {
    this.pageFlow?.destroy()
    this.pageFlow = null
    this.renderTask?.cancel()
    this.renderTask = null
    this.unsubscribeViewer()
    this.releaseThumbnailUrls()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.annotations.destroy()
    await this.viewer.destroy()
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
    if (selection === null) {
      this.textSelectionMenu.hidden = true
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
    this.annotations.setSelection(primaryId === undefined ? { ids: [] } : { ids, primaryId })
    this.viewer.clearTextSelection()
    this.annotations.setTool('text-select')
    this.toolSelect.value = 'text-select'
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
      if ((tool === 'highlight' || tool === 'strikeout' || tool === 'underline')
        && this.viewer.getTextSelection() !== null) {
        this.applyTextMarkup(tool)
      } else {
        if (tool !== 'text-select') this.textSelectionMenu.hidden = true
        this.setStatus(`Tool: ${tool}`)
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
    requireElement<HTMLButtonElement>(this.host, '.add-sample').addEventListener('click', () => {
      void this.addSampleAnnotation()
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
    requireElement<HTMLButtonElement>(this.host, '.print').addEventListener('click', () => {
      void this.printRaster().catch((cause: unknown) => this.reportError(cause))
    })
    requireElement<HTMLButtonElement>(this.host, '.password-sample').addEventListener('click', () => {
      void this.loadPasswordSample().catch((cause: unknown) => this.reportError(cause))
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

  /** Switches from the single-page surface to Core-owned virtual page flow. */
  private async showContinuous(): Promise<void> {
    if (this.pageFlow !== null) return
    this.viewer.detachTextLayer(this.currentPageIndex)
    this.annotations.detachPage(this.currentPageIndex)
    requireElement<HTMLElement>(this.host, '.page-scroll').hidden = true
    const flowHost = requireElement<HTMLDivElement>(this.host, '.flow-scroll')
    flowHost.hidden = false
    this.pageFlow = await createPdfPageFlow({
      viewer: this.viewer,
      annotations: this.annotations,
      container: flowHost,
      scale: this.scaleValue,
      onCurrentPageChanged: (pageIndex) => {
        this.currentPageIndex = pageIndex
        this.setStatus(`Continuous · page ${pageIndex + 1}/${this.document?.numPages ?? 0}`)
      }
    })
    this.scale = this.pageFlow.getScale().scale
    this.updateScaleControls()
    this.pageFlow.scrollToPage(this.currentPageIndex)
    this.setStatus(`Continuous · page ${this.currentPageIndex + 1}/${this.document?.numPages ?? 0}`)
  }

  /** Returns to the compact single-page debugger without reloading the PDF. */
  private async showSingle(): Promise<void> {
    if (this.pageFlow === null) return
    const scaleState = this.pageFlow.getScale()
    this.scaleValue = scaleState.value
    this.scale = scaleState.scale
    this.pageFlow.destroy()
    this.pageFlow = null
    requireElement<HTMLDivElement>(this.host, '.flow-scroll').hidden = true
    requireElement<HTMLElement>(this.host, '.page-scroll').hidden = false
    await this.renderCurrentPage()
  }

  /** Builds a real raster print artifact through the ready Viewer and repository. */
  private async prepareRasterPrint(): Promise<Uint8Array> {
    this.setStatus('Preparing raster print…')
    const bytes = await buildSecureRasterPrintPdf({
      viewer: this.viewer,
      annotations: this.annotations,
      pixelRatio: 1.5,
      onProgress: (complete, total) => this.setStatus(`Preparing print ${complete}/${total}`)
    })
    this.setStatus(`Prepared raster print · ${bytes.byteLength} bytes`)
    return bytes
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
    this.sourcePdf = new Uint8Array(bytes)
    this.sourceName = name
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

  /** Adds a deterministic fixture for the selected tool, including special inputs. */
  private async addSampleAnnotation(): Promise<void> {
    const tool = this.toolSelect.value as AnnotationTool
    if (tool === 'select' || tool === 'text-select') {
      this.setStatus('Choose an annotation tool first.')
      return
    }
    const offset = this.annotations.repository.getAll().length * 7
    const bounds = { x: 56 + offset, y: 96 + offset, width: 118, height: 54 }
    let annotation: Annotation | null
    if (tool === 'highlight' || tool === 'underline' || tool === 'strikeout') {
      annotation = this.annotations.createTextMarkup(tool, {
        pageIndex: 0, text: 'InkLayer Core Vanilla', rects: [bounds]
      })
    } else if (tool === 'free-text') {
      annotation = await this.annotations.requestFreeText(0, bounds)
    } else {
      annotation = this.annotations.createAnnotation({
        type: tool,
        pageIndex: 0,
        bounds,
        content: tool === 'stamp'
          ? { text: 'Stamp', image: stampDataUrl() }
          : { text: `${tool} annotation` },
        points: [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height]
      })
    }
    if (annotation !== null) {
      this.annotations.setSelection({ ids: [annotation.id], primaryId: annotation.id })
      this.setStatus(`Created ${annotation.type} · ${this.annotations.repository.getAll().length} total`)
    }
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
    const { buildAnnotatedPdf } = await import('inklayer-core/export/pdf')
    const bytes = await buildAnnotatedPdf(this.sourcePdf, this.annotations.repository.getAll())
    downloadBlob({ content: bytes, filename: 'inklayer-annotations.pdf', mimeType: 'application/pdf' })
    this.setStatus(`Exported PDF · ${bytes.byteLength} bytes`)
  }

  /** Exports and downloads annotation workbook bytes. */
  private async exportExcel(): Promise<void> {
    const { buildAnnotationWorkbook } = await import('inklayer-core/export/excel')
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
  }

  /** Updates the accessible status region. */
  private setStatus(message: string): void {
    this.status.dataset['state'] = 'ok'
    this.status.textContent = message
  }

  /** Presents an asynchronous failure without producing an unhandled rejection. */
  private reportError(cause: unknown): void {
    this.status.dataset['state'] = 'error'
    this.status.textContent = cause instanceof Error ? cause.message : 'Unexpected demo failure.'
  }
}

/** Builds one accessible demo card shell. */
function instanceMarkup(label: string): string {
  const tools = ['text-select', 'select', ...Object.keys(ANNOTATION_TOOL_DEFINITIONS)]
    .map((tool) => `<option value="${tool}">${tool}</option>`).join('')
  return `
    <h2>${label}</h2>
    <div class="toolbar" aria-label="${label} annotation controls">
      <label>Tool <select class="tool-select">${tools}</select></label>
      <button class="add-sample" type="button">Add sample</button>
      <button class="comment" type="button">Add comment</button>
      <button class="delete" type="button">Delete</button>
      <button class="zoom-out" type="button" aria-label="Zoom out">Zoom −</button>
      <button class="zoom-in" type="button">Zoom +</button>
      <label>Scale
        <select class="scale-select">
          <option value="auto">Auto</option>
          <option value="page-actual">Actual</option>
          <option value="page-fit">Page fit</option>
          <option value="page-width">Page width</option>
          <option value="page-height">Page height</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1" selected>100%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
          <option value="custom" disabled>Custom</option>
        </select>
      </label>
      <output class="scale-value">100%</output>
      <button class="continuous" type="button">Continuous</button>
      <button class="single" type="button">Single</button>
      <button class="prepare-print" type="button">Prepare print</button>
      <button class="print" type="button">Print</button>
      <button class="password-sample" type="button">Password PDF</button>
      <label class="file-control">Open PDF<input class="pdf-file" type="file" accept="application/pdf,.pdf"></label>
      <button class="reload" type="button">Reload</button>
      <button class="export-pdf" type="button">Export PDF</button>
      <button class="export-excel" type="button">Export Excel</button>
    </div>
    <div class="document-tools" aria-label="${label} document controls">
      <section>
        <strong>Outline</strong>
        <div class="outline-items"></div>
      </section>
      <section>
        <form class="search-form">
          <label>Search <input class="search-input" type="search" value="Core"></label>
          <button type="submit">Find</button>
        </form>
        <div class="search-results" aria-live="polite"></div>
      </section>
    </div>
    <div class="thumbnail-items" aria-label="Page thumbnails"></div>
    <div class="text-selection-menu" role="toolbar" aria-label="Text annotation actions" hidden>
      <button type="button" data-text-markup="highlight">Highlight</button>
      <button type="button" data-text-markup="underline">Underline</button>
      <button type="button" data-text-markup="strikeout">Strikeout</button>
    </div>
    <div class="page-scroll">
      <div class="page-surface">
        <canvas class="pdf-canvas" aria-label="Rendered PDF page"></canvas>
        <div class="text-layer-host" aria-label="Selectable PDF text"></div>
        <div class="annotation-host" aria-label="Annotation canvas"></div>
      </div>
    </div>
    <div class="flow-scroll" aria-label="Continuous PDF pages" hidden></div>
    <p class="instance-status" role="status" aria-live="polite">Idle</p>
    <dialog class="password-dialog" aria-labelledby="${label}-password-title">
      <form class="password-form">
        <h3 id="${label}-password-title">Open protected PDF</h3>
        <p class="password-message"></p>
        <label>Password<input class="password-input" type="password" autocomplete="current-password" required></label>
        <div class="dialog-actions">
          <button class="cancel-password" type="button">Cancel</button>
          <button type="submit">Unlock</button>
        </div>
      </form>
    </dialog>
  `
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

/** Returns the owner document for DOM creation in one demo instance. */
function documentFor(element: HTMLElement): Document {
  return element.ownerDocument
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

/** Builds a tiny self-contained SVG stamp image URL. */
function stampDataUrl(): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="54"><rect width="118" height="52" x="1" y="1" rx="6" fill="#ecfdf3" stroke="#067647" stroke-width="2"/><text x="60" y="33" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#067647">APPROVED</text></svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Mounts both isolated demo instances and loads their PDF pages. */
async function mountInstances(): Promise<void> {
  instances = [
    new DemoInstance(grid, 'Alice', '#175cd3'),
    new DemoInstance(grid, 'Bob', '#b54708')
  ]
  await Promise.all(instances.map(async (instance) => instance.load()))
}

destroyAll.addEventListener('click', () => {
  void Promise.all(instances.map(async (instance) => instance.destroy()))
    .then(mountInstances)
})

void mountInstances()
