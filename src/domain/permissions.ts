/**
 * @file Canonical annotation collaboration permissions.
 * @description Implements one fail-closed permission contract over canonical
 * annotations and comments with an optional synchronous override.
 */

import type { Annotation } from './annotation'
import type { AnnotationComment } from './comment'
import type { User } from './user'

/** Built-in collaboration permission modes. */
export type AnnotationPermissionMode = 'unrestricted' | 'owner-only'

/** Operations governed by the canonical permission contract. */
export type AnnotationPermissionAction =
  | 'annotation.create'
  | 'annotation.transform'
  | 'annotation.edit'
  | 'annotation.delete'
  | 'annotation.comment'
  | 'annotation.change-status'
  | 'comment.edit'
  | 'comment.delete'

/** Complete input delivered to a permission override. */
export interface AnnotationPermissionRequest {
  /** Operation being authorized. */
  action: AnnotationPermissionAction
  /** Current authenticated identity, or null for an anonymous consumer. */
  currentUser: User | null
  /** Canonical annotation involved in the operation. */
  annotation?: Readonly<Annotation>
  /** Canonical comment involved in a comment-level operation. */
  comment?: Readonly<AnnotationComment>
  /** Decision calculated by the configured built-in mode. */
  defaultAllowed: boolean
}

/** Permission configuration accepted by `canPerformAnnotationAction`. */
export interface AnnotationPermissions {
  /** Built-in mode, defaulting to unrestricted. */
  mode?: AnnotationPermissionMode
  /** Synchronous override; undefined retains the built-in decision. */
  can?: (request: AnnotationPermissionRequest) => boolean | undefined
  /** Optional diagnostics sink invoked when the override throws. */
  onResolverError?: (cause: unknown) => void
}

/** Input for one permission decision. */
export interface AnnotationPermissionDecisionInput {
  /** Operation being authorized. */
  action: AnnotationPermissionAction
  /** Current identity, or null when anonymous. */
  currentUser: User | null
  /** Annotation involved in the request when applicable. */
  annotation?: Readonly<Annotation>
  /** Comment involved in the request when applicable. */
  comment?: Readonly<AnnotationComment>
  /** Permission mode and optional override. */
  permissions?: AnnotationPermissions
}

/** Resolves one permission decision and denies when a custom resolver throws. */
export function canPerformAnnotationAction(input: AnnotationPermissionDecisionInput): boolean {
  const defaultAllowed = (input.permissions?.mode ?? 'unrestricted') === 'unrestricted'
    ? true
    : ownerOnlyDecision(input)
  const resolver = input.permissions?.can
  if (resolver === undefined) return defaultAllowed
  try {
    return resolver({
      action: input.action,
      currentUser: input.currentUser,
      defaultAllowed,
      ...(input.annotation === undefined ? {} : { annotation: input.annotation }),
      ...(input.comment === undefined ? {} : { comment: input.comment })
    }) ?? defaultAllowed
  } catch (cause) {
    input.permissions?.onResolverError?.(cause)
    return false
  }
}

/** Calculates the owner-only default decision. */
function ownerOnlyDecision(input: AnnotationPermissionDecisionInput): boolean {
  switch (input.action) {
    case 'annotation.create':
    case 'annotation.comment':
      return hasAuthenticatedUser(input.currentUser)
    case 'annotation.transform':
    case 'annotation.edit':
    case 'annotation.delete':
    case 'annotation.change-status':
      return hasSameAuthor(input.currentUser, input.annotation?.author)
    case 'comment.edit':
    case 'comment.delete':
      return hasSameAuthor(input.currentUser, input.comment?.author)
  }
}

/** Returns whether a user has a usable authenticated identifier. */
function hasAuthenticatedUser(user: User | null): user is User {
  return user !== null && user.id.length > 0 && user.id !== 'null'
}

/** Returns whether the current user owns the supplied resource. */
function hasSameAuthor(currentUser: User | null, author: User | undefined): boolean {
  return hasAuthenticatedUser(currentUser) && author !== undefined && currentUser.id === author.id
}
