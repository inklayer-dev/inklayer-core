/**
 * @file Canonical annotation user identity.
 * @description Defines the stable identity fields used by authorship and
 * permission decisions without framework-specific profile state.
 */

/** A user identity attached to annotations and comments. */
export interface User {
  /** Stable application-level user identifier. */
  id: string
  /** Human-readable display name. */
  name: string
  /** Optional avatar URL retained for consumer presentation. */
  avatarUrl?: string
}
