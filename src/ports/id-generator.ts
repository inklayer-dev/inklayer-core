/**
 * @file Instance-scoped identifier generator port.
 * @description Uses browser cryptography when available and keeps fallback state
 * inside one engine rather than in a module singleton.
 */

/** Identifier generator consumed by engines and comments. */
export interface IdGenerator {
  /** Returns a new stable identifier. */
  next(): string
}

/** Creates a cryptographic generator with an instance-local fallback counter. */
export function createDefaultIdGenerator(prefix = 'inklayer'): IdGenerator {
  let counter = 0
  return {
    next: () => {
      if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
      counter += 1
      return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
    }
  }
}
