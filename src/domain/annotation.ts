/**
 * @file Canonical InkLayer annotation model.
 * @description Defines the single data source used by repositories, engines,
 * permissions, persistence, import, and export.
 */

import type { AnnotationComment } from './comment'
import type { AnnotationReference } from './references'
import type { User } from './user'

/** Persisted annotation kinds supported by Core and native PDF import. */
export type AnnotationType =
  | 'highlight'
  | 'strikeout'
  | 'underline'
  | 'free-text'
  | 'rectangle'
  | 'circle'
  | 'freehand'
  | 'free-highlight'
  | 'signature'
  | 'stamp'
  | 'note'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'polyline'
  | 'cloud'

/** Explicit coordinate system used by annotation bounds and renderer data. */
export type AnnotationCoordinateSpace = 'konva-stage' | 'pdf-user-space'

/** Axis-aligned annotation bounds in the declared coordinate space. */
export interface AnnotationBounds {
  /** Horizontal origin. */
  x: number
  /** Vertical origin. */
  y: number
  /** Non-negative width. */
  width: number
  /** Non-negative height. */
  height: number
}

/** Semantic annotation content independent from drawing implementation. */
export interface AnnotationContent {
  /** User-visible body text. */
  text: string
  /** Source text covered by text markup. */
  selectedText?: string
  /** Image data or URL used by image-backed annotations. */
  image?: string
  /** Structured targets corresponding to visible reference labels in text. */
  references?: AnnotationReference[]
}

/** Common editable appearance properties. */
export interface AnnotationAppearance {
  /** CSS-compatible color string. */
  color?: string | null
  /** Text size in renderer-space units. */
  fontSize?: number
  /** Opacity from zero through one. */
  opacity?: number
  /** Non-negative stroke width. */
  strokeWidth?: number
}

/** Versioned renderer payload required for exact redraw. */
export interface KonvaRendererState {
  /** Concrete renderer owning the serialized representation. */
  engine: 'konva'
  /** Renderer payload schema version. */
  schemaVersion: 1
  /** Serialized Konva group, validated before renderer construction. */
  serialized: string
}

/** Provenance retained when an annotation came from an external format. */
export interface AnnotationSource {
  /** Source family used to decode the annotation. */
  kind: 'legacy' | 'pdf-native' | 'core'
  /** Original source subtype when it affects round-trip behavior. */
  subtype?: string
  /** Original numeric PDF.js annotation type when available. */
  pdfjsType?: number
}

/** Canonical annotation used throughout InkLayer Core. */
export interface Annotation {
  /** Stable document-level annotation identifier. */
  id: string
  /** Canonical annotation schema version. */
  schemaVersion: 1
  /** Persisted annotation kind; selection is intentionally excluded. */
  type: AnnotationType
  /** Zero-based PDF page index. */
  pageIndex: number
  /** Axis-aligned bounds in `coordinateSpace`. */
  bounds: AnnotationBounds
  /** Coordinate system governing bounds and renderer geometry. */
  coordinateSpace: AnnotationCoordinateSpace
  /** Optional semantic text or image content. */
  content?: AnnotationContent
  /** Optional editable appearance properties. */
  appearance?: AnnotationAppearance
  /** Comments and replies in stable document order. */
  comments: AnnotationComment[]
  /** Annotation author used by collaboration permissions. */
  author: User
  /** Creation date or null when unavailable. */
  createdAt: string | null
  /** Last modification date when separately known. */
  updatedAt?: string | null
  /** Whether the annotation originated in the PDF document. */
  native: boolean
  /** Stable positive document-scoped display number. */
  referenceNumber?: number
  /** Exact versioned drawing representation. */
  rendererState: KonvaRendererState
  /** Optional external-format provenance. */
  source?: AnnotationSource
  /** Unknown application metadata preserved across Core operations. */
  extensions?: Record<string, unknown>
}

/** Returns a structurally detached canonical annotation. */
export function cloneAnnotation(annotation: Annotation): Annotation {
  return structuredClone(annotation)
}
