/** @file Stable public Annotation Engine interaction contracts. */

import type { Annotation } from '../domain/annotation'

/** Configuration used to attach one PDF page overlay. */
export interface AnnotationPageAttachment {
  /** Zero-based page index. */
  pageIndex: number
  /** Container owning Canvas and semantic overlays. */
  container: HTMLDivElement
  /** Unscaled page width. */
  width: number
  /** Unscaled page height. */
  height: number
  /** Current page-to-DOM scale. */
  scale?: number
}

/** Core-owned author/reference Tag visibility policy. */
export type AnnotationAuthorLabelVisibility = 'auto' | 'always' | 'hidden'

/** Core-owned keyboard behavior for direct document annotation interaction. */
export interface AnnotationKeyboardOptions {
  /** Enables root-scoped Escape, deletion, and arrow-key movement; defaults to true. */
  enabled?: boolean
  /** Page-space distance moved by one arrow-key press; defaults to one. */
  nudgeStep?: number
  /** Page-space distance moved while Shift is held; defaults to ten. */
  acceleratedNudgeStep?: number
}

/** Localizable semantics for Core-owned annotation document controls. */
export interface AnnotationAccessibilityOptions {
  /** Accessible name added only when the engine root has none. */
  rootLabel?: string
  /** Returns the accessible name for one Core-owned page annotation group. */
  pageLabel?: (pageIndex: number) => string
  /** Returns the accessible label for one canvas annotation alternative. */
  annotationLabel?: (annotation: Readonly<Annotation>) => string
}

/** Image prepared by application UI for Core-owned Signature or Stamp placement. */
export interface AnnotationImageAsset {
  /** Self-contained PNG or JPEG data URL. */
  image: string
  /** Desired unscaled width on the PDF page. */
  width: number
  /** Desired unscaled height on the PDF page. */
  height: number
  /** Optional accessible/semantic label retained with the annotation. */
  text?: string
}

/** Annotation tools whose pointer interaction places an application-provided image. */
export type AnnotationImageTool = 'signature' | 'stamp'

/** Public colors used by Transformer and point controls. */
export interface AnnotationInteractionTheme {
  /** Transformer border and handle outline. */
  accentColor?: string
  /** Transformer handle fill. */
  handleFill?: string
  /** Reserved visual opacity for read-only affordances. */
  readOnlyOpacity?: number
}
