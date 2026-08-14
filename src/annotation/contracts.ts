/** @file Stable public Annotation Engine interaction contracts. */

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
