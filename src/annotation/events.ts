/**
 * @file Typed Annotation Engine events.
 * @description Exposes canonical mutation, selection, text selection, tool,
 * warning, error, and lifecycle events without leaking Konva nodes.
 */

import type { Annotation, AnnotationBounds } from '../domain/annotation'
import type { InkLayerError } from '../domain/errors'
import type { AnnotationSelection } from '../repository/annotation-repository'
import type { AnnotationTool } from './tools'
import type { AnnotationImageTool } from './contracts'

/** Origin of a selection command, used by framework adapters to prevent loops. */
export type AnnotationSelectionSource =
  | 'canvas' | 'accessibility' | 'sidebar' | 'navigation' | 'programmatic' | 'repository'

/** Independent hover channel coordinated by Core. */
export type AnnotationHoverSource =
  | 'canvas' | 'sidebar-pointer' | 'sidebar-focus' | 'programmatic' | 'passive'

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
    /** Command origin. */
    source: AnnotationSelectionSource
    /** Whether selection originated from a direct pointer click/tap. */
    isClick: boolean
  }
  | {
    /** Event discriminator. */
    type: 'hoverChanged'
    /** Effective annotation after coordinating all hover channels. */
    annotationId: string | null
    /** Source owning the effective hover, or null after the last channel clears. */
    source: AnnotationHoverSource | null
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
    type: 'imageAssetRequired'
    /** Image-backed tool that needs application UI to provide an asset. */
    tool: AnnotationImageTool
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
