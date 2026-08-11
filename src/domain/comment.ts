/**
 * @file Canonical annotation comment contracts and immutable mutations.
 * @description Keeps collaboration content independent from renderer state and
 * framework stores.
 */

import type { AnnotationReference } from './references'
import type { User } from './user'

/** Supported review states carried by a comment. */
export type CommentStatus =
  | 'Accepted'
  | 'Rejected'
  | 'Cancelled'
  | 'Completed'
  | 'None'
  | 'Closed'

/** A stable comment or reply attached to an annotation. */
export interface AnnotationComment {
  /** Stable comment identifier within its annotation. */
  id: string
  /** Readable author title retained for legacy display compatibility. */
  title: string
  /** Comment body containing optional visible reference labels. */
  content: string
  /** Author identity when known. */
  author?: User
  /** ISO or PDF date string, or null when unavailable. */
  date: string | null
  /** Optional review workflow state. */
  status?: CommentStatus
  /** Structured targets corresponding to visible reference labels. */
  references?: AnnotationReference[]
}

/** Input used to create a canonical comment. */
export interface CreateAnnotationCommentInput {
  /** Stable comment identifier. */
  id: string
  /** Readable author title. */
  title: string
  /** Comment body. */
  content: string
  /** Author identity when known. */
  author?: User
  /** Creation date or null. */
  date: string | null
  /** Optional workflow state. */
  status?: CommentStatus
  /** Optional structured annotation references. */
  references?: readonly AnnotationReference[]
}

/** Creates a detached canonical comment from trusted domain input. */
export function createAnnotationComment(input: CreateAnnotationCommentInput): AnnotationComment {
  return {
    id: input.id,
    title: input.title,
    content: input.content,
    date: input.date,
    ...(input.author === undefined ? {} : { author: { ...input.author } }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.references === undefined
      ? {}
      : { references: input.references.map((reference) => ({ ...reference })) })
  }
}

/** Replaces one comment without mutating the input collection. */
export function updateAnnotationComment(
  comments: readonly AnnotationComment[],
  commentId: string,
  updater: (comment: Readonly<AnnotationComment>) => AnnotationComment
): AnnotationComment[] {
  return comments.map((comment) => comment.id === commentId ? updater(comment) : comment)
}

/** Removes one comment without mutating the input collection. */
export function removeAnnotationComment(
  comments: readonly AnnotationComment[],
  commentId: string
): AnnotationComment[] {
  return comments.filter((comment) => comment.id !== commentId)
}
