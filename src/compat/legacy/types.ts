/**
 * @file Verified legacy React and Vue annotation wire contracts.
 * @description Contains compatibility-only types for the shared historical
 * IAnnotationStore shape; engine modules must never depend on these types.
 */

import type { AnnotationReference } from '../../domain/references'
import type { CommentStatus } from '../../domain/comment'
import type { User } from '../../domain/user'

/** Historical rectangle stored in unscaled Konva Stage coordinates. */
export interface LegacyRect {
  /** Horizontal Stage origin. */
  x: number
  /** Vertical Stage origin. */
  y: number
  /** Stage-space width. */
  width: number
  /** Stage-space height. */
  height: number
}

/** Historical semantic content object. */
export interface LegacyAnnotationContent {
  /** User-visible annotation text. */
  text: string
  /** Selected source text for markup. */
  selectedText?: string
  /** Image payload for image-backed tools. */
  image?: string
  /** Structured targets found in text. */
  references?: AnnotationReference[]
}

/** Historical comment shape shared by both framework packages. */
export interface LegacyAnnotationComment {
  /** Stable comment identifier. */
  id: string
  /** Readable author title. */
  title: string
  /** Legacy date string or null. */
  date: string | null
  /** Comment body. */
  content: string
  /** Optional review state. */
  status?: CommentStatus
  /** Optional historical author identity. */
  user?: User
  /** Structured annotation targets in the body. */
  references?: AnnotationReference[]
}

/** Historical annotation store payload accepted at the compatibility boundary. */
export interface LegacyAnnotation {
  /** Stable annotation identifier. */
  id: string
  /** Positive document display number. */
  referenceNumber?: number
  /** Historical one-based page number. */
  pageNumber: number
  /** Serialized exact Konva group. */
  konvaString: string
  /** Unscaled top-left Konva Stage bounds. */
  konvaClientRect: LegacyRect
  /** Historical display title. */
  title: string
  /** Historical numeric custom annotation type. */
  type: number
  /** Historical editable color. */
  color?: string | null
  /** PDF annotation subtype. */
  subtype: string
  /** PDF.js numeric annotation type. */
  pdfjsType: number
  /** Historical creation or modification date. */
  date: string | null
  /** Optional historical semantic content. */
  contentsObj?: LegacyAnnotationContent | null
  /** Historical comments. */
  comments: LegacyAnnotationComment[]
  /** Annotation author. */
  user: User
  /** Whether the annotation originated in the PDF. */
  native: boolean
  /** Unknown historical fields preserved by the mapper. */
  [key: string]: unknown
}

/** Structured compatibility warning for a conversion that cannot be exact. */
export interface LegacyCompatibilityWarning {
  /** Stable warning code. */
  code: 'LEGACY_FIELD_PRESERVED' | 'LEGACY_FIELD_OMITTED' | 'COORDINATE_SPACE_MISMATCH'
  /** Developer-facing explanation without annotation content. */
  message: string
  /** Annotation associated with the warning. */
  annotationId: string
  /** Legacy or canonical field involved. */
  field: string
}

/** Optional warning observer for compatibility operations. */
export interface LegacyCompatibilityOptions {
  /** Receives each structured non-fatal compatibility warning. */
  onWarning?: (warning: LegacyCompatibilityWarning) => void
}
