/**
 * @file Minimal normalized PDF.js annotation input contracts.
 * @description Models only fields consumed by supported decoders instead of
 * copying PDF.js's large internal annotation declarations.
 */

import type { PdfPageBox } from '../../geometry/coordinates'
import type { AnnotationAppearance, AnnotationType } from '../../domain/annotation'
import type { User } from '../../domain/user'
import type { AnnotationReference } from '../../domain/references'

/** PDF.js string wrapper commonly used for title and contents. */
export interface PdfJsStringValue {
  /** Decoded string value. */
  str: string
}

/** PDF point used by Ink, polygon, and line annotations. */
export interface PdfJsPoint {
  /** PDF user-space x coordinate. */
  x: number
  /** PDF user-space y coordinate. */
  y: number
}

/** Minimal untrusted annotation shape accepted by native import. */
export interface PdfJsAnnotationInput {
  /** Stable PDF annotation identifier. */
  id: string
  /** PDF.js numeric annotation type. */
  annotationType: number
  /** PDF annotation subtype. */
  subtype?: string
  /** PDF user-space rectangle. */
  rect: readonly [number, number, number, number]
  /** RGB bytes or normalized RGB components. */
  color?: readonly number[]
  /** Annotation title/author wrapper. */
  titleObj?: PdfJsStringValue
  /** Annotation contents wrapper. */
  contentsObj?: PdfJsStringValue
  /** PDF or ISO modification date. */
  modificationDate?: string | null
  /** PDF or ISO creation date. */
  creationDate?: string | null
  /** Text markup quadrilateral coordinates. */
  quadPoints?: readonly number[]
  /** Ink stroke point lists. */
  inkLists?: readonly (readonly PdfJsPoint[])[]
  /** Polygon or polyline vertices. */
  vertices?: readonly PdfJsPoint[]
  /** Line endpoints as four numbers. */
  lineCoordinates?: readonly [number, number, number, number]
  /** PDF line ending names used to detect arrows. */
  lineEndings?: readonly string[]
  /** Parent annotation ID for a reply/pop-up comment. */
  inReplyTo?: string
  /** InkLayer custom persisted type marker from PDF metadata inspection. */
  inkLayerType?: 'Cloud' | 'FreeText' | 'Arrow' | 'FreeHighlight' | 'SignatureInk' | 'SignatureImage' | 'Stamp'
  /** Exact canonical type emitted by InkLayer's own exporter. */
  canonicalType?: AnnotationType
  /** Exact canonical appearance emitted by InkLayer's own exporter. */
  appearance?: AnnotationAppearance
  /** Original canonical author retained when `/T` uses a formatted title. */
  inkLayerAuthor?: User
  /** Stable document-scoped display number retained by InkLayer exports. */
  referenceNumber?: number
  /** Stable structured references retained beside readable `#N` text. */
  references?: AnnotationReference[]
  /** Image payload recovered from an InkLayer image annotation dictionary. */
  image?: string
  /** Whether PDF border metadata identifies a cloudy polygon. */
  cloudy?: boolean
  /** Optional opacity from PDF metadata. */
  opacity?: number
  /** Optional custom FreeText font size. */
  fontSize?: number
  /** Normalized PDF.js border style used to restore stroke width and dashes. */
  borderStyle?: { width?: number; dashArray?: readonly number[] }
}

/** One page of normalized PDF.js annotations and its coordinate box. */
export interface PdfJsAnnotationPageInput {
  /** Zero-based PDF page index. */
  pageIndex: number
  /** PDF page box and rotation. */
  pageBox: PdfPageBox
  /** Untrusted page annotation values. */
  annotations: readonly unknown[]
}

/** Recoverable native import warning. */
export interface PdfJsImportWarning {
  /** Stable warning category. */
  code: 'MALFORMED_ANNOTATION' | 'METADATA_INSPECTION_FAILED'
  /** Developer-facing message without PDF contents. */
  message: string
  /** Annotation associated with the warning when known. */
  annotationId?: string
  /** Zero-based page context. */
  pageIndex?: number
  /** Original failure retained for diagnostics. */
  cause?: unknown
}
