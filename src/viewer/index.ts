/**
 * @file Public PDF Viewer Engine entry.
 * @description Exposes the SSR-safe Viewer factory and contracts; PDF.js runtime
 * modules remain dynamically loaded by `load`.
 */

export { createPdfViewerEngine } from './pdf-viewer-engine'
export type { PdfViewerEvent, PdfViewerListener } from './events'
export type {
  PdfCanvasWatermarkRequest,
  PdfActiveTextSelection,
  PdfDataSource,
  PdfDocumentHandle,
  PdfDocumentTextSelection,
  PdfDocumentPermissions,
  PdfLoadProgress,
  PdfLoadProgressPhase,
  PdfNavigationTarget,
  PdfOutlineItem,
  PdfPageRaster,
  PdfPageRasterOptions,
  PdfPasswordReason,
  PdfPasswordRequest,
  PdfSearchMatch,
  PdfRegexSearchManyQuery,
  PdfRegexSearchOptions,
  PdfSearchManyInputQuery,
  PdfSearchManyOptions,
  PdfSearchManyProgress,
  PdfSearchManyQuery,
  PdfSearchManyQueryResult,
  PdfSearchManyResult,
  PdfSearchOptions,
  PdfSearchResult,
  PdfResolvedTextRange,
  PdfResolveTextRangesOptions,
  PdfSource,
  PdfThumbnail,
  PdfThumbnailOptions,
  PdfThumbnailSurface,
  PdfThumbnailSurfaceProvider,
  PdfTextLayerAttachment,
  PdfTextHighlightLayer,
  PdfTextHighlightStyle,
  PdfTextRange,
  PdfTextSelection,
  PdfTextSelectionSource,
  PdfTextSelectionRect,
  PdfUrlSource,
  PdfViewerEngine,
  PdfViewerEngineOptions,
  PdfViewerLayoutMode,
  PdfViewerScale,
  PdfZoomAnchor,
  PdfZoomState,
  PdfViewerSnapshot,
  PdfViewerStatus,
  PdfWatermarkSpec
} from './types'
export {
  createPdfZoomGestureController,
  resolvePdfViewerScale,
  stepPdfViewerScale,
  type PdfZoomGestureController,
  type PdfZoomGestureOptions,
  type PdfZoomMetrics
} from './zoom'
export { drawCanvasWatermark } from './watermark'
export { normalizeWatermarkSpec } from '../domain/watermark'
export { createBrowserThumbnailSurfaceProvider } from './document-features'
