/**
 * @file Public PDF Viewer Engine contracts.
 * @description Defines source, lifecycle, snapshot, document, and construction
 * types without loading PDF.js or accessing browser globals.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { EventBus, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { InkLayerError } from '../domain/errors'
import type { PdfWatermarkSpec } from '../domain/watermark'
export type { PdfWatermarkSpec } from '../domain/watermark'

/** Zero-based document location resolved from a PDF destination. */
export interface PdfNavigationTarget {
  /** Zero-based destination page index. */
  pageIndex: number
  /** Optional PDF viewport x coordinate supplied by an XYZ destination. */
  left?: number
  /** Optional PDF viewport y coordinate supplied by an XYZ destination. */
  top?: number
  /** Optional destination zoom factor. */
  zoom?: number
}

/** Framework-neutral PDF outline node. */
export interface PdfOutlineItem {
  /** Human-readable bookmark title. */
  title: string
  /** Whether the document requests bold presentation. */
  bold: boolean
  /** Whether the document requests italic presentation. */
  italic: boolean
  /** Six-digit CSS RGB color derived from the PDF outline entry. */
  color: string
  /** Resolved internal document target when available. */
  target: PdfNavigationTarget | null
  /** External URL when the item links outside the document. */
  url: string | null
  /** Nested outline items in document order. */
  items: readonly PdfOutlineItem[]
}

/** One deterministic document-search occurrence. */
export interface PdfSearchMatch {
  /** Zero-based page index containing the occurrence. */
  pageIndex: number
  /** Zero-based occurrence index within the page. */
  matchIndex: number
  /** Character offset in Core's normalized page text. */
  start: number
  /** Matched character length in Core's normalized page text. */
  length: number
  /** Compact surrounding text intended for a framework result list. */
  preview: string
}

/** Search behavior independent from a product search field. */
export interface PdfSearchOptions {
  /** Whether Unicode case must match exactly; defaults to false. */
  matchCase?: boolean
  /** Whether adjacent word characters invalidate a match; defaults to false. */
  wholeWord?: boolean
  /** Maximum returned occurrences; defaults to 1,000. */
  maxResults?: number
}

/** Complete immutable result of one document search. */
export interface PdfSearchResult {
  /** Original trimmed query. */
  query: string
  /** Matches ordered by page and character position. */
  matches: readonly PdfSearchMatch[]
  /** Whether the configured result limit truncated further matches. */
  truncated: boolean
}

/** Thumbnail rendering request. */
export interface PdfThumbnailOptions {
  /** Zero-based PDF page index. */
  pageIndex: number
  /** Maximum layout width in CSS pixels; defaults to 160. */
  maxWidth?: number
  /** Raster pixel ratio; defaults to the browser ratio capped at two. */
  pixelRatio?: number
}

/** Encoded page thumbnail returned without framework DOM ownership. */
export interface PdfThumbnail {
  /** Zero-based rendered page index. */
  pageIndex: number
  /** Intended layout width in CSS pixels. */
  width: number
  /** Intended layout height in CSS pixels. */
  height: number
  /** PNG image bytes exposed as an immutable browser Blob. */
  blob: Blob
}

/** Full-page raster render request used by virtual pages and secure printing. */
export interface PdfPageRasterOptions {
  /** Zero-based page index. */
  pageIndex: number
  /** Layout scale relative to the PDF.js scale-one viewport. */
  scale?: number
  /** Physical raster pixels per layout pixel. */
  pixelRatio?: number
  /** Watermark target whose policy flag must be applied. */
  target?: 'viewer' | 'print'
}

/** Encoded full-page raster with layout and physical dimensions. */
export interface PdfPageRaster {
  /** Zero-based rendered page index. */
  pageIndex: number
  /** Layout width before pixel ratio. */
  width: number
  /** Layout height before pixel ratio. */
  height: number
  /** Physical raster pixel ratio. */
  pixelRatio: number
  /** Complete PNG page bytes. */
  blob: Blob
}

/** Canvas resources supplied to Core for one thumbnail render. */
export interface PdfThumbnailSurface {
  /** Canvas passed to PDF.js; Core never appends it to product DOM. */
  canvas: HTMLCanvasElement
  /** Matching two-dimensional rendering context. */
  context: CanvasRenderingContext2D
  /** Encodes the rendered surface before it is released. */
  encode(): Promise<Blob>
  /** Releases surface resources after success, cancellation, or failure. */
  release(): void
}

/** Browser/platform port used to allocate thumbnail render surfaces. */
export interface PdfThumbnailSurfaceProvider {
  /** Creates a raster surface with physical pixel dimensions. */
  create(width: number, height: number): PdfThumbnailSurface
}

/** Unscaled top-left page rectangle derived from browser text selection. */
export interface PdfTextSelectionRect {
  /** Horizontal offset from the page TextLayer origin in unscaled CSS pixels. */
  x: number
  /** Vertical offset from the page TextLayer origin in unscaled CSS pixels. */
  y: number
  /** Selected fragment width in unscaled CSS pixels. */
  width: number
  /** Selected fragment height in unscaled CSS pixels. */
  height: number
}

/** Real browser selection normalized to one PDF page. */
export interface PdfTextSelection {
  /** Zero-based page index containing the selection. */
  pageIndex: number
  /** Selected browser text with surrounding whitespace removed. */
  text: string
  /** Line/client rectangles in unscaled top-left page coordinates. */
  rects: readonly PdfTextSelectionRect[]
}

/** Cross-page browser selection split into canonical page-local fragments. */
export interface PdfDocumentTextSelection {
  /** Browser-selected text across every participating attached page. */
  text: string
  /** Page-ordered fragments suitable for one annotation per page. */
  fragments: readonly PdfTextSelection[]
}

/** Current normalized browser selection retained independently of native DOM focus. */
export type PdfActiveTextSelection =
  | {
    /** One attached page contains the complete selection. */
    kind: 'page'
    /** Stable page-local text and geometry. */
    selection: PdfTextSelection
  }
  | {
    /** Two or more attached pages participate in the selection. */
    kind: 'document'
    /** Stable document text and ordered page-local fragments. */
    selection: PdfDocumentTextSelection
  }

/** TextLayer attachment matching one rendered PDF page. */
export interface PdfTextLayerAttachment {
  /** Zero-based PDF page index. */
  pageIndex: number
  /** Empty page overlay container owned by the framework layout. */
  container: HTMLDivElement
  /** PDF viewport scale shared with the canvas and Annotation Engine. */
  scale: number
  /** Clockwise page rotation in quarter turns; defaults to the PDF page value. */
  rotation?: 0 | 90 | 180 | 270
}

/** Normalized document capabilities derived from the PDF permission flags. */
export interface PdfDocumentPermissions {
  /** Maximum printing fidelity allowed by the document security handler. */
  print: 'none' | 'low-resolution' | 'high-resolution'
  /** Whether ordinary document content may be copied. */
  copy: boolean
  /** Whether accessibility extraction is allowed. */
  copyForAccessibility: boolean
  /** Whether page contents may be modified. */
  modify: boolean
  /** Whether annotations may be added or changed. */
  annotate: boolean
  /** Whether interactive forms may be completed. */
  fillForms: boolean
  /** Whether pages may be assembled or reordered. */
  assemble: boolean
}

/** Reason PDF.js paused loading to request a password. */
export type PdfPasswordReason = 'required' | 'incorrect'

/** Password request identity safe to expose to framework UI. */
export interface PdfPasswordRequest {
  /** Generation-scoped opaque identifier used for submit/cancel. */
  requestId: string
  /** Whether no password or an incorrect password triggered the request. */
  reason: PdfPasswordReason
  /** One-based number of password prompts for this load generation. */
  attempt: number
}

/** One post-PDF.js Canvas watermark operation. */
export interface PdfCanvasWatermarkRequest {
  /** Already-rendered PDF page Canvas. */
  canvas: HTMLCanvasElement
  /** Zero-based page identity used for structured failures. */
  pageIndex: number
  /** Physical pixels per layout pixel; defaults to one. */
  pixelRatio?: number
}

/** Page-flow modes supported by the owned PDF.js web Viewer. */
export type PdfViewerLayoutMode =
  | 'single'
  | 'continuous'
  | 'facing'
  | 'continuous-facing'

/** Predefined or numeric PDF.js-compatible Viewer scale. */
export type PdfViewerScale =
  | number
  | 'auto'
  | 'page-actual'
  | 'page-fit'
  | 'page-width'
  | 'page-height'

/** Viewport-space anchor preserved while applying pointer-driven zoom. */
export interface PdfZoomAnchor {
  /** Horizontal client coordinate inside the browser viewport. */
  clientX: number
  /** Vertical client coordinate inside the browser viewport. */
  clientY: number
}

/** Detached current zoom state suitable for toolbar projection. */
export interface PdfZoomState {
  /** Requested numeric or adaptive scale value. */
  value: PdfViewerScale
  /** Numeric scale currently resolved by the rendering surface. */
  scale: number
  /** Rounded human-readable percentage. */
  percentage: number
  /** Minimum permitted scale. */
  minScale: number
  /** Maximum permitted scale. */
  maxScale: number
}

/** URL loading configuration for one PDF document. */
export interface PdfUrlSource {
  /** PDF URL resolved by PDF.js or the configured fetch implementation. */
  url: string | URL
  /** Additional request headers used by probes, ranges, and PDF.js. */
  headers?: Readonly<Record<string, string>>
  /** Fetch credential policy. */
  credentials?: RequestCredentials
  /** Range policy, defaulting to automatic capability detection. */
  range?: boolean | 'auto'
  /** Requested range chunk size in bytes. */
  rangeChunkSize?: number
}

/** In-memory loading configuration for one PDF document. */
export interface PdfDataSource {
  /** PDF bytes copied before PDF.js can transfer their backing buffer. */
  data: ArrayBuffer | Uint8Array
}

/** Supported PDF loading sources. */
export type PdfSource = PdfUrlSource | PdfDataSource

/** Stable handle returned for one successfully loaded document. */
export interface PdfDocumentHandle {
  /** PDF.js document proxy used for page and metadata operations. */
  document: PDFDocumentProxy
  /** Number of pages reported by the loaded document. */
  numPages: number
  /** PDF.js document fingerprints, detached from the proxy array. */
  fingerprints: readonly (string | null)[]
  /** Permissions normalized from the active PDF security handler. */
  permissions: PdfDocumentPermissions
  /** Whether PDF.js requested a password while opening this document. */
  passwordProtected: boolean
}

/** Viewer lifecycle states. */
export type PdfViewerStatus =
  | 'idle'
  | 'loading'
  | 'awaiting-password'
  | 'ready'
  | 'error'
  | 'destroyed'

/** Network and parsing phase reported while a PDF document is opening. */
export type PdfLoadProgressPhase = 'probing' | 'downloading' | 'parsing'

/** Detached loading progress for one current Viewer generation. */
export interface PdfLoadProgress {
  /** Viewer generation that owns this progress update. */
  generation: number
  /** Current capability, transfer, or parsing phase. */
  phase: PdfLoadProgressPhase
  /** Unique PDF bytes received so far, when applicable. */
  loaded: number
  /** Complete PDF byte length, or null before it is known. */
  total: number | null
  /** Rounded transfer percentage, or null while the total is unknown. */
  percentage: number | null
  /** Whether bytes are being supplied through Core's Range transport. */
  range: boolean
}

/** Immutable lifecycle snapshot returned and emitted by the Viewer Engine. */
export interface PdfViewerSnapshot {
  /** Current lifecycle state. */
  status: PdfViewerStatus
  /** Monotonic generation guarding stale asynchronous work. */
  generation: number
  /** Current document handle when ready. */
  document: PdfDocumentHandle | null
  /** Last structured load error when status is error. */
  error: InkLayerError | null
  /** Current loading progress, or null outside an active load. */
  progress: PdfLoadProgress | null
}

/** Events emitted by one Viewer Engine instance. */
export type PdfViewerEvent =
  | {
    /** Event discriminator. */
    type: 'loadProgress'
    /** Current detached loading progress. */
    progress: PdfLoadProgress
  }
  | {
    /** Event discriminator. */
    type: 'scaleChanged'
    /** Current detached numeric and preset zoom state. */
    state: PdfZoomState
  }
  | {
    /** Event discriminator. */
    type: 'passwordRequired'
    /** Request metadata containing no password or document content. */
    request: PdfPasswordRequest
  }
  | {
    /** Event discriminator. */
    type: 'stateChanged'
    /** Current detached lifecycle snapshot. */
    snapshot: PdfViewerSnapshot
  }
  | {
    /** Event discriminator. */
    type: 'documentLoaded'
    /** Newly loaded document handle. */
    document: PdfDocumentHandle
  }
  | {
    /** Event discriminator. */
    type: 'error'
    /** Structured Viewer failure. */
    error: InkLayerError
  }
  | {
    /** Event discriminator. */
    type: 'textSelected'
    /** Same-page browser selection normalized by Core. */
    selection: PdfTextSelection
  }
  | {
    /** Event discriminator. */
    type: 'documentTextSelected'
    /** Cross-page selection normalized into page-local fragments. */
    selection: PdfDocumentTextSelection
  }
  | {
    /** Event discriminator. */
    type: 'textSelectionChanged'
    /** Retained normalized selection, or null after explicit/native clearing. */
    selection: PdfActiveTextSelection | null
  }
  | {
    /** Event discriminator. */
    type: 'destroyed'
  }

/** Listener invoked synchronously for Viewer Engine events. */
export type PdfViewerListener = (event: PdfViewerEvent) => void

/** Construction options for a PDF Viewer Engine instance. */
export interface PdfViewerEngineOptions {
  /** Overrides Core's bundled, version-matched PDF.js worker URL. */
  workerSrc?: string
  /** Optional PDF.js viewer scroll container; omit for loader-only use. */
  container?: HTMLDivElement
  /** Optional inner viewer element, defaulting to the container's first child. */
  viewerElement?: HTMLDivElement
  /** Fetch implementation used by Range probing and requests. */
  fetch?: typeof globalThis.fetch
  /** Receives listener failures without interrupting engine state changes. */
  onListenerError?: (cause: unknown) => void
  /** Optional thumbnail surface port, primarily for non-default browser hosts and tests. */
  thumbnailSurfaceProvider?: PdfThumbnailSurfaceProvider
  /** Minimum numeric zoom scale; defaults to 0.1. */
  minScale?: number
  /** Maximum numeric zoom scale; defaults to 10. */
  maxScale?: number
  /** Additive toolbar zoom step; defaults to 0.1. */
  zoomStep?: number
  /** Enables container-owned touch and Ctrl/Meta+wheel pinch zoom; defaults to true. */
  enablePinchZoom?: boolean
}

/** Imperative, framework-independent PDF Viewer Engine. */
export interface PdfViewerEngine {
  /** Loads a URL or copied byte source, replacing any prior work. */
  load(source: PdfSource): Promise<PdfDocumentHandle>
  /** Cancels current loading and returns the engine to idle. */
  cancelLoad(): Promise<void>
  /** Supplies a password only to the matching active PDF.js loading task. */
  submitPassword(requestId: string, password: string): void
  /** Cancels the matching password-gated load without retaining credentials. */
  cancelPassword(requestId: string): Promise<void>
  /** Returns the current detached lifecycle snapshot. */
  getSnapshot(): PdfViewerSnapshot
  /** Subscribes to typed Viewer events. */
  subscribe(listener: PdfViewerListener): () => void
  /** Returns the owned PDF.js web viewer when configured. */
  getViewer(): PDFViewer | null
  /** Returns the owned PDF.js EventBus when configured. */
  getEventBus(): EventBus | null
  /** Changes single/continuous and one/two-page layout on the owned web Viewer. */
  setLayoutMode(mode: PdfViewerLayoutMode): Promise<void>
  /** Changes the owned web Viewer's scale without framework rendering logic. */
  setScale(scale: PdfViewerScale): void
  /** Returns the owned web Viewer's current detached scale state. */
  getScale(): PdfZoomState
  /** Applies one bounded numeric zoom-in step. */
  zoomIn(): void
  /** Applies one bounded numeric zoom-out step. */
  zoomOut(): void
  /** Scrolls the owned web Viewer to one zero-based page. */
  goToPage(pageIndex: number): void
  /** Returns the resolved document outline without prescribing its UI. */
  getOutline(): Promise<readonly PdfOutlineItem[]>
  /** Resolves one named or explicit PDF destination. */
  resolveDestination(destination: string | readonly unknown[]): Promise<PdfNavigationTarget | null>
  /** Searches normalized document text in page order. */
  search(query: string, options?: PdfSearchOptions): Promise<PdfSearchResult>
  /** Projects search offsets into attached TextLayers and marks one active match. */
  setSearchHighlights(matches: readonly PdfSearchMatch[], activeIndex?: number | null): void
  /** Removes transient search markup from every attached TextLayer. */
  clearSearchHighlights(): void
  /** Returns a detached copy of the retained normalized browser selection. */
  getTextSelection(): PdfActiveTextSelection | null
  /** Clears retained selection state and the matching native browser Range. */
  clearTextSelection(): void
  /** Renders and caches one encoded PNG thumbnail. */
  renderThumbnail(options: PdfThumbnailOptions): Promise<PdfThumbnail>
  /** Renders one complete page raster for virtual display or secure print. */
  renderPageRaster(options: PdfPageRasterOptions): Promise<PdfPageRaster>
  /** Renders and owns the selectable PDF.js TextLayer for one page. */
  attachTextLayer(attachment: PdfTextLayerAttachment): Promise<void>
  /** Detaches one page TextLayer and its selection listeners. */
  detachTextLayer(pageIndex: number): void
  /** Replaces the transient document watermark policy. */
  setWatermark(spec: PdfWatermarkSpec | null): void
  /** Returns a detached copy of the active watermark policy. */
  getWatermark(): PdfWatermarkSpec | null
  /** Composites the active Viewer watermark after PDF.js page rendering. */
  drawWatermark(request: PdfCanvasWatermarkRequest): void
  /** Releases loading, document, Viewer, Range, and listener resources. */
  destroy(): Promise<void>
}
