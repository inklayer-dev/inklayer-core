/**
 * @file Free-text input environment port.
 * @description Defines the real DOM-dependent operation needed by the free-text
 * editor while allowing a framework or test to supply another implementation.
 */

import type { AnnotationBounds } from '../domain/annotation'

/** Request for one temporary free-text editing session. */
export interface TextInputRequest {
  /** Attached page overlay that owns the input, or the instance root when detached. */
  root: HTMLElement
  /** Zero-based page receiving the eventual FreeText annotation. */
  pageIndex: number
  /** Input bounds in scaled DOM pixels relative to `root`. */
  bounds: AnnotationBounds
  /** Canonical unscaled annotation bounds retained for creation. */
  pageBounds: AnnotationBounds
  /** Page-to-DOM scale used to project `pageBounds` into `bounds`. */
  scale: number
  /** Initial text for edits. */
  initialValue?: string
  /** Direct-document focus owner restored after explicit submit or cancellation. */
  returnFocusTo?: HTMLElement
  /** Signal that cancels and removes the input. */
  signal: AbortSignal
}

/** Result of a temporary text input session. */
export interface TextInputResult {
  /** Submitted text, or null when cancelled. */
  value: string | null
}

/** Environment boundary used by the free-text editor. */
export interface TextInputProvider {
  /** Opens one input and resolves after submit, blur, or cancellation. */
  requestText(request: TextInputRequest): Promise<TextInputResult>
}
