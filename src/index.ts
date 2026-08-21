/**
 * @file InkLayer Core public root entry.
 * @description Exposes implemented environment-neutral contracts and safe
 * factories while heavy format and CSS assets remain in secondary entries.
 * @remarks This module must remain safe to import during Node and SSR builds.
 */

export {
  InkLayerError,
  type InkLayerErrorCode,
  type InkLayerErrorContext
} from './domain/errors'
export { ANNOTATION_SCHEMA_VERSION, CORE_VERSION } from './domain/schema'
export {
  cloneAnnotation,
  type Annotation,
  type AnnotationAppearance,
  type AnnotationAppearanceInput,
  type AnnotationFillAppearance,
  type AnnotationFillAppearanceInput,
  type AnnotationStrokeAppearance,
  type AnnotationStrokeAppearanceInput,
  type AnnotationTextAppearance,
  type AnnotationTextAppearanceInput,
  type AnnotationBounds,
  type AnnotationContent,
  type AnnotationCoordinateSpace,
  type AnnotationSource,
  type AnnotationSignatureContent,
  type AnnotationType,
  type AnnotationTypeData,
  type AnnotationTypeId,
  type CustomAnnotationType,
  BUILT_IN_ANNOTATION_TYPES,
  isAnnotationTypeId,
  isBuiltInAnnotationType,
  isCustomAnnotationType,
  type KonvaRendererState
} from './domain/annotation'
export type { JsonObject, JsonPrimitive, JsonValue, JsonValueLimits } from './domain/json-value'
export { parseJsonObject, parseJsonValue } from './domain/json-value'
export {
  getAnnotationAppearanceCapabilities,
  getDefaultAnnotationAppearance,
  mergeAnnotationAppearance,
  resolveAnnotationAppearance,
  validateResolvedAppearance,
  type AnnotationAppearanceCapabilities
} from './domain/appearance'
export type {
  AnnotationAccessibilityOptions,
  AnnotationAuthorLabelVisibility,
  AnnotationImageAsset,
  AnnotationImageTool,
  AnnotationInteractionTheme,
  AnnotationKeyboardOptions,
  AnnotationPageAttachment
} from './annotation/contracts'
export type { AnnotationHoverSource, AnnotationSelectionSource } from './annotation/events'
export {
  createAnnotationComment,
  removeAnnotationComment,
  updateAnnotationComment,
  type AnnotationComment,
  type CommentStatus,
  type CreateAnnotationCommentInput
} from './domain/comment'
export {
  canPerformAnnotationAction,
  type AnnotationPermissionAction,
  type AnnotationPermissionDecisionInput,
  type AnnotationPermissionMode,
  type AnnotationPermissionRequest,
  type AnnotationPermissions
} from './domain/permissions'
export {
  assignAnnotationReferenceNumber,
  compareAnnotationsForNumbering,
  getGreatestReferenceNumber,
  isValidReferenceNumber,
  normalizeAnnotationReferenceNumbers
} from './domain/numbering'
export {
  ANNOTATION_REFERENCE_LABEL_PATTERN,
  isValidAnnotationReference,
  normalizeAnnotationReferences,
  synchronizeAnnotationReferenceLabels,
  type AnnotationReference,
  type AnnotationReferenceContent
} from './domain/references'
export { parseAnnotation, parseAnnotations } from './domain/validation'
export type { User } from './domain/user'
export {
  createMemoryAnnotationRepository
} from './repository/memory-annotation-repository'
export type {
  AnnotationRepository,
  AnnotationRepositoryEvent,
  AnnotationRepositoryListener,
  AnnotationSelection,
  AnnotationUpdater
} from './repository/annotation-repository'
export {
  parseLegacyAnnotation,
  serializeLegacyAnnotation
} from './compat/legacy/legacy-annotation'
export type {
  LegacyAnnotation,
  LegacyAnnotationComment,
  LegacyAnnotationContent,
  LegacyCompatibilityOptions,
  LegacyCompatibilityWarning,
  LegacyRect
} from './compat/legacy/types'
export { createPdfViewerEngine } from './viewer/pdf-viewer-engine'
export type { PdfViewerEvent, PdfViewerListener } from './viewer/events'
export type {
  PdfActiveTextSelection,
  PdfCanvasWatermarkRequest,
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
  PdfSearchOptions,
  PdfSearchResult,
  PdfSource,
  PdfThumbnail,
  PdfThumbnailOptions,
  PdfThumbnailSurface,
  PdfThumbnailSurfaceProvider,
  PdfTextLayerAttachment,
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
} from './viewer/types'
export {
  createPdfZoomGestureController,
  resolvePdfViewerScale,
  stepPdfViewerScale,
  type PdfZoomGestureController,
  type PdfZoomGestureOptions,
  type PdfZoomMetrics
} from './viewer/zoom'
export { drawCanvasWatermark } from './viewer/watermark'
export { normalizeWatermarkSpec } from './domain/watermark'
export { createBrowserThumbnailSurfaceProvider } from './viewer/document-features'
export {
  buildSecureRasterPrintPdf,
  type SecureRasterPrintOptions
} from './raster-print'
export {
  createPdfPageFlow,
  type PdfPageFlowController,
  type PdfPageFlowOptions
} from './page-flow'
export {
  createAnnotationEngine,
  type AnnotationEngine,
  type AnnotationEngineOptions,
  type AnnotationSnapshotStrategy,
  type CreateAnnotationInput,
  type TransformAnnotationInput
} from './annotation/annotation-engine'
export type {
  AnnotationEngineEvent,
  AnnotationEngineListener,
  AnnotationEngineWarning,
  AnnotationTextSelection
} from './annotation/events'
export {
  ANNOTATION_TOOL_DEFINITIONS,
  type AnnotationTool,
  type AnnotationToolDefinition,
  type AnnotationCreationMode,
  type AnnotationTransformMode
} from './annotation/tools'
export {
  parseAndValidateKonvaSnapshot,
  type KonvaAttributeValue,
  type SnapshotValidationOptions,
  type ValidatedKonvaNode,
  type ValidatedKonvaSnapshot
} from './renderer/konva/snapshot'
export type { Clock } from './ports/clock'
export type { IdGenerator } from './ports/id-generator'
export type { Logger } from './ports/logger'
export type { TextInputProvider, TextInputRequest, TextInputResult } from './ports/text-input'
export type { DownloadContent, DownloadProvider, DownloadRequest } from './ports/download'
export type { PrintProvider, PrintRequest } from './ports/print'
export { createBrowserTextInputProvider } from './platform/browser/text-input'
export { createBrowserDownloadProvider, downloadBlob } from './platform/browser/download'
export {
  createBrowserPrintProvider,
  printPdfBlob,
  type BrowserPrintEnvironment
} from './platform/browser/print'
export { createInkLayer } from './capabilities/composition-root'
export {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  createAnnotationRepositoryCapability,
  createClockCapability,
  createDownloadCapability,
  createFetchCapability,
  createIdGeneratorCapability,
  createLoggerCapability,
  createPrintCapability,
  createTextInputCapability,
  createThumbnailSurfaceCapability
} from './capabilities/ports'
export type {
  AnnotationRepositoryCapabilityOptions,
  InkLayerCapabilityServiceKey,
  InkLayerCapabilityServiceMap,
  InkLayerPortCapabilityOptions
} from './capabilities/ports'
export type {
  InkLayerDisposer,
  InkLayerLifecycleScope
} from './lifecycle/lifecycle-scope'
export type {
  InkLayerAnnotationOptions,
  InkLayerCapability,
  InkLayerCapabilityContext,
  InkLayerCapabilityRegistry,
  InkLayerInstance,
  InkLayerOptions,
  InkLayerPageFlowOptions,
  InkLayerReadyContext,
  InkLayerReadyEffect
} from './capabilities/contracts'
export {
  ANNOTATION_TYPE_DEFINITION_API_VERSION,
  BUILT_IN_ANNOTATION_TYPE_DEFINITIONS,
  createAnnotationTypeRegistry
} from './annotation-types'
export type {
  AnnotationCreationController,
  AnnotationGeometryKind,
  AnnotationScene,
  AnnotationSceneNode,
  AnnotationTypeAvailability,
  AnnotationTypeCapabilities,
  AnnotationTypeCreationInput,
  AnnotationTypeCreationResult,
  CoreAnnotationTypeRendererDefinition,
  AnnotationTypeDataCodec,
  AnnotationTypeDefinition,
  AnnotationTypeRegistry,
  AnnotationTypeRegistryEvent,
  AnnotationTypeTransformInput
} from './annotation-types'
