/**
 * @file Structured InkLayer Core error contract.
 * @description Defines stable machine-readable codes and optional operation
 * context without embedding PDF or comment contents in error messages.
 * @remarks Feature modules may add context, but they must not create competing
 * public error classes.
 */

/** Stable machine-readable error codes exposed by implemented Core modules. */
export type InkLayerErrorCode =
  | 'ENVIRONMENT_UNSUPPORTED'
  | 'ENGINE_DESTROYED'
  | 'PDF_LOAD_FAILED'
  | 'PDF_LOAD_CANCELLED'
  | 'PDF_PASSWORD_CANCELLED'
  | 'PDF_PERMISSION_DENIED'
  | 'PDF_RANGE_FAILED'
  | 'PDF_RANGE_UNSUPPORTED'
  | 'PDF_WORKER_CONFLICT'
  | 'PDF_FEATURE_FAILED'
  | 'PDF_FEATURE_CANCELLED'
  | 'LIFECYCLE_INACTIVE'
  | 'LIFECYCLE_SETUP_FAILED'
  | 'LIFECYCLE_DISPOSE_FAILED'
  | 'CAPABILITY_DUPLICATE'
  | 'CAPABILITY_SERVICE_CONFLICT'
  | 'CAPABILITY_SETUP_FAILED'
  | 'COMPOSITION_INITIALIZATION_FAILED'
  | 'ANNOTATION_INVALID'
  | 'ANNOTATION_DUPLICATE_ID'
  | 'ANNOTATION_TYPE_RESERVED'
  | 'ANNOTATION_TYPE_DUPLICATE'
  | 'ANNOTATION_TYPE_DEFINITION_INVALID'
  | 'ANNOTATION_TYPE_UNAVAILABLE'
  | 'KONVA_SNAPSHOT_INVALID'
  | 'ANNOTATION_TYPE_UNSUPPORTED'
  | 'IMPORT_FAILED'
  | 'EXPORT_FAILED'

/** Optional structured context attached to an InkLayer error. */
export interface InkLayerErrorContext {
  /** Operation that failed, expressed as a stable developer-facing name. */
  operation?: string
  /** Annotation associated with the failure, when safe to disclose. */
  annotationId?: string
  /** Zero-based PDF page index associated with the failure. */
  pageIndex?: number
  /** Original failure retained for diagnostics without stringifying its data. */
  cause?: unknown
}

/** Error type shared by all public InkLayer Core operations. */
export class InkLayerError extends Error {
  /** Stable code suitable for programmatic branching. */
  public readonly code: InkLayerErrorCode

  /** Operation that failed, when supplied by the throwing boundary. */
  public readonly operation: string | undefined

  /** Annotation associated with the failure, when applicable. */
  public readonly annotationId: string | undefined

  /** Zero-based PDF page index associated with the failure. */
  public readonly pageIndex: number | undefined

  /** Original failure retained without exposing it in the public message. */
  public override readonly cause: unknown

  /**
   * Creates a structured Core error.
   * @param code Stable machine-readable failure code.
   * @param message Human-readable message that must exclude document contents.
   * @param context Optional operation, annotation, page, and cause metadata.
   */
  public constructor(
    code: InkLayerErrorCode,
    message: string,
    context: InkLayerErrorContext = {}
  ) {
    super(message, context.cause === undefined ? undefined : { cause: context.cause })
    this.name = 'InkLayerError'
    this.code = code
    this.operation = context.operation
    this.annotationId = context.annotationId
    this.pageIndex = context.pageIndex
    this.cause = context.cause
  }
}
