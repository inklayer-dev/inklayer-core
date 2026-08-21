/**
 * @file Bounded lossless JSON value contract.
 * @description Defines and validates detached persisted extension payloads
 * without accepting runtime objects, executable values, or prototype keys.
 */

import { InkLayerError } from './errors'

/** JSON primitive accepted by canonical persisted payloads. */
export type JsonPrimitive = string | number | boolean | null

/** Recursively JSON-compatible value accepted by canonical persisted payloads. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

/** Plain JSON object without executable or prototype-bearing values. */
export interface JsonObject {
  [key: string]: JsonValue
}

/** Safety limits shared by `typeData` and application extensions. */
export interface JsonValueLimits {
  /** Maximum recursive containers below the root; defaults to 100. */
  maxDepth?: number
  /** Maximum total primitive and container values; defaults to 100,000. */
  maxValues?: number
  /** Maximum length of one string or object key; defaults to 1,000,000. */
  maxStringLength?: number
}

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Validates and returns a structurally detached lossless JSON value. */
export function parseJsonValue(
  input: unknown,
  operation = 'parseJsonValue',
  limits: JsonValueLimits = {}
): JsonValue {
  const normalized = normalizeLimits(limits)
  const state = { values: 0 }
  validateJsonValue(input, 0, state, normalized, operation)
  return structuredClone(input) as JsonValue
}

/** Validates and returns a detached plain JSON object. */
export function parseJsonObject(
  input: unknown,
  operation = 'parseJsonObject',
  limits: JsonValueLimits = {}
): JsonObject {
  if (!isPlainObject(input)) throw jsonError('JSON payload must be a plain object.', operation)
  return parseJsonValue(input, operation, limits) as JsonObject
}

interface NormalizedJsonValueLimits {
  maxDepth: number
  maxValues: number
  maxStringLength: number
}

/** Recursively enforces plain lossless JSON and bounded work. */
function validateJsonValue(
  value: unknown,
  depth: number,
  state: { values: number },
  limits: NormalizedJsonValueLimits,
  operation: string
): void {
  state.values += 1
  if (state.values > limits.maxValues) throw jsonError('JSON payload contains too many values.', operation)
  if (depth > limits.maxDepth) throw jsonError('JSON payload exceeds the maximum depth.', operation)
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw jsonError('JSON payload contains a non-finite number.', operation)
    return
  }
  if (typeof value === 'string') {
    if (value.length > limits.maxStringLength) throw jsonError('JSON payload contains an oversized string.', operation)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) validateJsonValue(entry, depth + 1, state, limits, operation)
    return
  }
  if (!isPlainObject(value)) {
    throw jsonError('JSON payload contains a non-JSON value.', operation)
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw jsonError('JSON payload contains a symbol key.', operation)
    if (DANGEROUS_KEYS.has(key)) throw jsonError('JSON payload contains a dangerous key.', operation)
    if (key.length > limits.maxStringLength) throw jsonError('JSON payload contains an oversized key.', operation)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable
      || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw jsonError('JSON payload contains a hidden or accessor property.', operation)
    }
    validateJsonValue(descriptor.value, depth + 1, state, limits, operation)
  }
}

/** Normalizes bounded positive safety limits. */
function normalizeLimits(limits: JsonValueLimits): NormalizedJsonValueLimits {
  return {
    maxDepth: positiveSafeLimit(limits.maxDepth, 100, 'maxDepth'),
    maxValues: positiveSafeLimit(limits.maxValues, 100_000, 'maxValues'),
    maxStringLength: positiveSafeLimit(limits.maxStringLength, 1_000_000, 'maxStringLength')
  }
}

/** Returns a configured positive safe integer or its default. */
function positiveSafeLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer.`)
  return value
}

/** Returns whether one value is a plain object with no custom prototype. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

/** Creates a structured annotation-envelope validation failure. */
function jsonError(message: string, operation: string): InkLayerError {
  return new InkLayerError('ANNOTATION_INVALID', message, { operation })
}
