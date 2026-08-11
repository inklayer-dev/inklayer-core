/**
 * @file Annotation Engine clock port.
 * @description Makes creation and update timestamps deterministic in tests while
 * providing an ISO-based default implementation.
 */

/** Clock consumed when annotations are created or updated. */
export interface Clock {
  /** Returns the current time as an ISO 8601 string. */
  now(): string
}

/** Creates the default system clock. */
export function createSystemClock(): Clock {
  return { now: () => new Date().toISOString() }
}
