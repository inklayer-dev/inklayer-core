/**
 * @file Single validated Konva snapshot parsing entry.
 * @description Parses untrusted renderer JSON once and enforces structure,
 * depth, node, class, numeric, point, data URL, and prototype-key limits.
 */

import { InkLayerError } from '../../domain/errors'
import {
  ALLOWED_KONVA_CLASS_NAMES,
  DEFAULT_MAX_DATA_URL_LENGTH,
  DEFAULT_MAX_POINTS,
  DEFAULT_MAX_SNAPSHOT_DEPTH,
  DEFAULT_MAX_SNAPSHOT_LENGTH,
  DEFAULT_MAX_SNAPSHOT_NODES
} from './constants'

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const NUMERIC_ATTR_KEYS = new Set([
  'x', 'y', 'width', 'height', 'radius', 'radiusX', 'radiusY', 'scaleX', 'scaleY',
  'rotation', 'opacity', 'strokeWidth', 'fontSize', 'lineHeight', 'padding',
  'pointerLength', 'pointerWidth', 'cornerRadius', 'tension', 'dashOffset',
  'fillOpacity', 'strokeHitEnabled', 'hitStrokeWidth'
])

/** JSON values allowed inside validated Konva attrs. */
export type KonvaAttributeValue =
  | string
  | number
  | boolean
  | null
  | readonly KonvaAttributeValue[]
  | { readonly [key: string]: KonvaAttributeValue }

/** A validated Konva node tree. */
export interface ValidatedKonvaNode {
  /** Allowed Konva class name. */
  readonly className: string
  /** Validated JSON-compatible node attributes. */
  readonly attrs: Readonly<Record<string, KonvaAttributeValue>>
  /** Validated child nodes, present only for containers. */
  readonly children?: readonly ValidatedKonvaNode[]
}

/** Result shared by renderer load and exporters. */
export interface ValidatedKonvaSnapshot {
  /** Original serialized form, safe to pass to Konva after validation. */
  readonly serialized: string
  /** Validated and deeply frozen root group. */
  readonly root: ValidatedKonvaNode
  /** Total number of nodes in the tree. */
  readonly nodeCount: number
}

/** Optional limits and annotation context for snapshot validation. */
export interface SnapshotValidationOptions {
  /** Maximum serialized input length. */
  maxSerializedLength?: number
  /** Maximum nested node depth including the root. */
  maxDepth?: number
  /** Maximum total node count. */
  maxNodes?: number
  /** Maximum values in a points array. */
  maxPoints?: number
  /** Maximum image or data URL string length. */
  maxDataUrlLength?: number
  /** Allowed Konva class names, defaulting to the verified Core vocabulary. */
  allowedClassNames?: ReadonlySet<string>
  /** Expected annotation and root group identifier. */
  annotationId?: string
  /** Zero-based page context included in structured errors. */
  pageIndex?: number
  /** Developer-facing operation name. */
  operation?: string
}

/** Parses and validates the only supported serialized Konva snapshot form. */
export function parseAndValidateKonvaSnapshot(
  serialized: string,
  options: SnapshotValidationOptions = {}
): ValidatedKonvaSnapshot {
  const limits = normalizeOptions(options)
  if (typeof serialized !== 'string' || serialized.length === 0
    || serialized.length > limits.maxSerializedLength) {
    throw snapshotError('Konva snapshot string is empty or oversized.', options)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch (cause) {
    throw snapshotError('Konva snapshot is not valid JSON.', options, cause)
  }
  const state = { nodeCount: 0 }
  const root = validateNode(parsed, 1, state, limits, options)
  if (root.className !== 'Group') {
    throw snapshotError('Konva snapshot root must be a Group.', options)
  }
  if (options.annotationId !== undefined && root.attrs['id'] !== options.annotationId) {
    throw snapshotError('Konva root group ID does not match the annotation ID.', options)
  }
  deepFreeze(root)
  return Object.freeze({ serialized, root, nodeCount: state.nodeCount })
}

/** Fully normalized snapshot limits. */
interface NormalizedSnapshotOptions {
  /** Maximum input length. */
  maxSerializedLength: number
  /** Maximum tree depth. */
  maxDepth: number
  /** Maximum total nodes. */
  maxNodes: number
  /** Maximum points values. */
  maxPoints: number
  /** Maximum data URL length. */
  maxDataUrlLength: number
  /** Allowed node classes. */
  allowedClassNames: ReadonlySet<string>
}

/** Normalizes and validates caller-provided safety limits. */
function normalizeOptions(options: SnapshotValidationOptions): NormalizedSnapshotOptions {
  return {
    maxSerializedLength: positiveLimit(options.maxSerializedLength, DEFAULT_MAX_SNAPSHOT_LENGTH, options),
    maxDepth: positiveLimit(options.maxDepth, DEFAULT_MAX_SNAPSHOT_DEPTH, options),
    maxNodes: positiveLimit(options.maxNodes, DEFAULT_MAX_SNAPSHOT_NODES, options),
    maxPoints: positiveLimit(options.maxPoints, DEFAULT_MAX_POINTS, options),
    maxDataUrlLength: positiveLimit(options.maxDataUrlLength, DEFAULT_MAX_DATA_URL_LENGTH, options),
    allowedClassNames: options.allowedClassNames ?? ALLOWED_KONVA_CLASS_NAMES
  }
}

/** Validates one node and recursively validates its children. */
function validateNode(
  input: unknown,
  depth: number,
  state: { nodeCount: number },
  limits: NormalizedSnapshotOptions,
  options: SnapshotValidationOptions
): ValidatedKonvaNode {
  if (depth > limits.maxDepth) throw snapshotError('Konva snapshot exceeds maximum depth.', options)
  if (!isPlainRecord(input)) throw snapshotError('Konva node must be a plain object.', options)
  rejectDangerousKeys(input, options)
  const className = input['className']
  if (typeof className !== 'string' || !limits.allowedClassNames.has(className)) {
    throw snapshotError('Konva snapshot contains an unsupported className.', options)
  }
  state.nodeCount += 1
  if (state.nodeCount > limits.maxNodes) throw snapshotError('Konva snapshot exceeds maximum nodes.', options)
  const attrsInput = input['attrs']
  if (!isPlainRecord(attrsInput)) throw snapshotError('Konva node attrs must be a plain object.', options)
  const attrs = validateAttrs(attrsInput, limits, options)
  const childrenInput = input['children']
  if (childrenInput === undefined) return { className, attrs }
  if (!Array.isArray(childrenInput)) throw snapshotError('Konva node children must be an array.', options)
  const children = childrenInput.map((child) =>
    validateNode(child, depth + 1, state, limits, options))
  return { className, attrs, children }
}

/** Validates one attrs object and its JSON-like values. */
function validateAttrs(
  input: Record<string, unknown>,
  limits: NormalizedSnapshotOptions,
  options: SnapshotValidationOptions
): Record<string, KonvaAttributeValue> {
  rejectDangerousKeys(input, options)
  const attrs: Record<string, KonvaAttributeValue> = {}
  for (const [key, value] of Object.entries(input)) {
    if (NUMERIC_ATTR_KEYS.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw snapshotError('Konva numeric attrs must contain finite numbers.', options)
    }
    if (key === 'points') {
      if (!Array.isArray(value) || value.length > limits.maxPoints
        || value.some((point) => typeof point !== 'number' || !Number.isFinite(point))) {
        throw snapshotError('Konva points must be a bounded finite number array.', options)
      }
    }
    if ((key === 'image' || key === 'src') && typeof value === 'string'
      && value.length > limits.maxDataUrlLength) {
      throw snapshotError('Konva image source exceeds the configured limit.', options)
    }
    attrs[key] = validateAttributeValue(value, 0, limits, options)
  }
  return attrs
}

/** Recursively validates an attribute JSON value. */
function validateAttributeValue(
  value: unknown,
  depth: number,
  limits: NormalizedSnapshotOptions,
  options: SnapshotValidationOptions
): KonvaAttributeValue {
  if (depth > limits.maxDepth) throw snapshotError('Konva attrs exceed maximum depth.', options)
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw snapshotError('Konva attrs contain a non-finite number.', options)
    return value
  }
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > limits.maxDataUrlLength) {
      throw snapshotError('Konva data URL exceeds the configured limit.', options)
    }
    if (value.length > limits.maxSerializedLength) {
      throw snapshotError('Konva attr string exceeds the configured limit.', options)
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry) => validateAttributeValue(entry, depth + 1, limits, options))
  }
  if (isPlainRecord(value)) {
    rejectDangerousKeys(value, options)
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      validateAttributeValue(entry, depth + 1, limits, options)
    ]))
  }
  throw snapshotError('Konva attrs contain a non-JSON value.', options)
}

/** Rejects prototype mutation keys at every object level. */
function rejectDangerousKeys(
  value: Record<string, unknown>,
  options: SnapshotValidationOptions
): void {
  if (Object.keys(value).some((key) => DANGEROUS_KEYS.has(key))) {
    throw snapshotError('Konva snapshot contains a dangerous object key.', options)
  }
}

/** Returns whether a value is a plain object with a safe prototype. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

/** Validates a positive safe integer safety limit. */
function positiveLimit(
  value: number | undefined,
  fallback: number,
  options: SnapshotValidationOptions
): number {
  const limit = value ?? fallback
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw snapshotError('Konva snapshot limits must be positive safe integers.', options)
  }
  return limit
}

/** Deeply freezes a validated node and all contained values. */
function deepFreeze(value: object): void {
  for (const entry of Object.values(value)) {
    if (typeof entry === 'object' && entry !== null && !Object.isFrozen(entry)) deepFreeze(entry)
  }
  Object.freeze(value)
}

/** Creates a structured snapshot error with safe annotation context. */
function snapshotError(
  message: string,
  options: SnapshotValidationOptions,
  cause?: unknown
): InkLayerError {
  return new InkLayerError('KONVA_SNAPSHOT_INVALID', message, {
    operation: options.operation ?? 'parseAndValidateKonvaSnapshot',
    ...(options.annotationId === undefined ? {} : { annotationId: options.annotationId }),
    ...(options.pageIndex === undefined ? {} : { pageIndex: options.pageIndex }),
    ...(cause === undefined ? {} : { cause })
  })
}
