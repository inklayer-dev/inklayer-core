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
  /** Explicit Signature payload; applications may collect it through any UI. */
  signature?: AnnotationSignatureContent
  /** Structured targets corresponding to visible reference labels in text. */
  references?: AnnotationReference[]
}

/** Canonical V1 Signature payload supporting asset and direct-ink signatures. */
export type AnnotationSignatureContent =
  | {
      /** Rasterized signature produced by draw/type/upload application UI. */
      kind: 'image'
      /** Image data URL or application-resolvable URL. */
      image: string
    }
  | {
      /** One or more page-space ink strokes captured directly by Core. */
      kind: 'ink'
      /** Independent x/y point arrays, each containing at least two points. */
      strokes: readonly (readonly number[])[]
    }

/** Stroke paint shared by line and outlined annotation geometries. */
export interface AnnotationStrokeAppearance {
  /** Core-supported CSS RGB color. */
  color: string
  /** Width in unscaled page/Stage units. */
  width: number
  /** Stroke-only opacity from zero through one. */
  opacity: number
  /** Alternating painted and unpainted lengths; empty means solid. */
  dash: readonly number[]
  /** Offset into the dash pattern in page units. */
  dashOffset: number
  /** Stroke endpoint geometry. */
  lineCap: 'butt' | 'round' | 'square'
  /** Stroke corner geometry. */
  lineJoin: 'miter' | 'round' | 'bevel'
}

/** Closed-area or background paint. */
export interface AnnotationFillAppearance {
  /** Core-supported CSS RGB color. */
  color: string
  /** Fill-only opacity from zero through one. */
  opacity: number
}

/** Rendered text paint. */
export interface AnnotationTextAppearance {
  /** Core-supported CSS RGB foreground color. */
  color: string
  /** Text-only opacity from zero through one. */
  opacity: number
  /** Font size in unscaled page/Stage units. */
  fontSize: number
}

/** Fully resolved renderer-independent appearance stored by every annotation. */
export interface AnnotationAppearance {
  /** Whole-annotation opacity multiplied with component opacity. */
  opacity: number
  /** Border, outline, or path paint; null explicitly disables it. */
  stroke: AnnotationStrokeAppearance | null
  /** Closed-area or background paint; null explicitly disables it. */
  fill: AnnotationFillAppearance | null
  /** Text paint; null when the annotation has no rendered text. */
  text: AnnotationTextAppearance | null
}

/** Partial stroke override accepted by creation and editing commands. */
export type AnnotationStrokeAppearanceInput = Partial<AnnotationStrokeAppearance>

/** Partial fill override accepted by creation and editing commands. */
export type AnnotationFillAppearanceInput = Partial<AnnotationFillAppearance>

/** Partial text override accepted by creation and editing commands. */
export type AnnotationTextAppearanceInput = Partial<AnnotationTextAppearance>

/** Deep partial appearance override; null explicitly disables a component. */
export interface AnnotationAppearanceInput {
  /** Optional whole-annotation opacity override. */
  opacity?: number
  /** Optional stroke override or explicit disable. */
  stroke?: AnnotationStrokeAppearanceInput | null
  /** Optional fill override or explicit disable. */
  fill?: AnnotationFillAppearanceInput | null
  /** Optional text override or explicit disable. */
  text?: AnnotationTextAppearanceInput | null
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
  /** Fully resolved editable appearance. */
  appearance: AnnotationAppearance
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
