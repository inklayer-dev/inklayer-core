/**
 * @file Diagnostic logger port with a default implementation.
 * @description Reports listener and recoverable engine failures without binding
 * Core to framework notification systems.
 */

/** Structured diagnostic logger consumed by Annotation Engine events. */
export interface Logger {
  /** Reports a recoverable warning. */
  warn(message: string, context?: Readonly<Record<string, unknown>>): void
  /** Reports an isolated error. */
  error(message: string, cause?: unknown): void
}

/** Creates the default console-backed logger. */
export function createDefaultLogger(): Logger {
  return {
    warn: (message, context) => console.warn(message, context),
    error: (message, cause) => console.error(message, cause)
  }
}
