/**
 * @file Typed Annotation Engine events.
 * @description Exposes canonical mutation, selection, text selection, tool,
 * warning, error, and lifecycle events without leaking Konva nodes.
 */

import type { Annotation, AnnotationBounds } from '../domain/annotation'
import type { InkLayerError } from '../domain/errors'
import type { AnnotationSelection } from '../repository/annotation-repository'
import type { AnnotationTool } from './tools'

/** Browser text selection normalized to one PDF page. */
export interface AnnotationTextSelection {
  /** Zero-based PDF page index. */
  pageIndex: number
  /** Selected source text. */
  text: string
  /** Selection line rectangles in unscaled Stage coordinates. */
  rects: readonly AnnotationBounds[]
}

/** Recoverable Annotation Engine warning. */
export interface AnnotationEngineWarning {
  /** Stable warning category. */
  code: 'ANNOTATION_SKIPPED' | 'LISTENER_FAILED'
  /** Developer-facing warning message without annotation contents. */
  message: string
  /** Annotation associated with the warning. */
  annotationId?: string
  /** Zero-based page context. */
  pageIndex?: number
  /** Original structured failure when safe to retain. */
  cause?: unknown
}

/** Complete Annotation Engine event union. */
export type AnnotationEngineEvent =
  | {
    /** Event discriminator. */
    type: 'annotationAdded'
    /** Added canonical annotation. */
    annotation: Annotation
  }
  | {
    /** Event discriminator. */
    type: 'annotationUpdated'
    /** Updated canonical annotation. */
    annotation: Annotation
    /** Annotation value before the update. */
    previous: Annotation
  }
  | {
    /** Event discriminator. */
    type: 'annotationDeleted'
    /** Deleted canonical annotation. */
    annotation: Annotation
  }
  | {
    /** Event discriminator. */
    type: 'selectionChanged'
    /** Current stable selection. */
    selection: AnnotationSelection
  }
  | {
    /** Event discriminator. */
    type: 'textSelected'
    /** Normalized text selection geometry. */
    selection: AnnotationTextSelection
  }
  | {
    /** Event discriminator. */
    type: 'toolChanged'
    /** Current transient or persisted tool. */
    tool: AnnotationTool
  }
  | {
    /** Event discriminator. */
    type: 'warning'
    /** Recoverable engine warning. */
    warning: AnnotationEngineWarning
  }
  | {
    /** Event discriminator. */
    type: 'error'
    /** Structured non-recoverable operation error. */
    error: InkLayerError
  }
  | {
    /** Event discriminator. */
    type: 'destroyed'
  }

/** Listener invoked synchronously for Annotation Engine events. */
export type AnnotationEngineListener = (event: AnnotationEngineEvent) => void
