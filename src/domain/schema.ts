/**
 * @file InkLayer Core version constants.
 * @description Publishes the package implementation version and the first
 * canonical annotation schema version without claiming unfinished engine APIs.
 * @remarks Schema migrations must branch on the annotation schema value rather
 * than the package version.
 */

/** Current local package implementation version. */
export const CORE_VERSION = '0.1.0' as const

/** Canonical annotation schema version defined by the Core v1 contract. */
export const ANNOTATION_SCHEMA_VERSION = 1 as const
