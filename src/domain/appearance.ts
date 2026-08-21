/**
 * @file Canonical annotation appearance policy.
 * @description Defines renderer-independent defaults, supported components, and
 * deep override semantics for every persisted annotation type.
 */

import type {
  AnnotationAppearance,
  AnnotationAppearanceInput,
  AnnotationFillAppearance,
  AnnotationStrokeAppearance,
  AnnotationTextAppearance,
  AnnotationType
} from './annotation'
import { parseAnnotationColor } from './color'

/** Appearance controls supported by one annotation type. */
export interface AnnotationAppearanceCapabilities {
  /** Whether the type supports a visible stroke. */
  stroke: boolean
  /** Whether the type supports a closed-area or background fill. */
  fill: boolean
  /** Whether the type supports rendered text styling. */
  text: boolean
  /** Whether a stroke may use a dash pattern. */
  dash: boolean
  /** Whether stroke endpoint geometry is meaningful. */
  lineCap: boolean
  /** Whether stroke join geometry is meaningful. */
  lineJoin: boolean
}

const RED = '#ff6b6b'
const DEFAULT_STROKE: AnnotationStrokeAppearance = {
  color: RED,
  width: 2,
  opacity: 1,
  dash: [],
  dashOffset: 0,
  lineCap: 'butt',
  lineJoin: 'miter'
}

const CAPABILITIES: Readonly<Record<AnnotationType, AnnotationAppearanceCapabilities>> = {
  highlight: capability(false, true, false),
  strikeout: capability(true, false, false, false, false, false),
  underline: capability(true, false, false, false, false, false),
  'free-text': capability(true, true, true),
  rectangle: capability(true, true, false, true, false, true),
  circle: capability(true, true, false, true, false, false),
  freehand: capability(true, false, false, true, true, true),
  'free-highlight': capability(true, false, false, true, true, true),
  signature: capability(true, false, false, true, true, true),
  stamp: capability(true, false, false, true, false, true),
  note: capability(true, true, true),
  line: capability(true, false, false, true, true, false),
  arrow: capability(true, false, false, true, true, false),
  polygon: capability(true, true, false, true, true, true),
  polyline: capability(true, false, false, true, true, true),
  cloud: capability(true, true, false, true, true, true)
}

/** Returns a detached capability description for product appearance controls. */
export function getAnnotationAppearanceCapabilities(
  type: AnnotationType
): AnnotationAppearanceCapabilities {
  return { ...CAPABILITIES[type] }
}

/** Returns the complete Core default appearance for one annotation type. */
export function getDefaultAnnotationAppearance(type: AnnotationType): AnnotationAppearance {
  switch (type) {
    case 'highlight':
      return appearance(null, { color: '#b4fa56', opacity: 0.5 }, null)
    case 'strikeout':
      return appearance({ ...DEFAULT_STROKE, color: RED, width: 2 }, null, null)
    case 'underline':
      return appearance({ ...DEFAULT_STROKE, color: '#1272e8', width: 2 }, null, null)
    case 'free-text':
      return appearance(null, null, { color: '#000000', opacity: 1, fontSize: 14 })
    case 'free-highlight':
      return appearance({
        ...DEFAULT_STROKE, width: 10, opacity: 0.5, lineCap: 'round', lineJoin: 'round'
      }, null, null)
    case 'freehand':
    case 'signature':
      return appearance({ ...DEFAULT_STROKE, lineCap: 'round', lineJoin: 'round' }, null, null)
    case 'line':
    case 'arrow':
      return appearance({ ...DEFAULT_STROKE, lineCap: 'round' }, null, null)
    case 'polyline':
      return appearance({ ...DEFAULT_STROKE, lineCap: 'round', lineJoin: 'round' }, null, null)
    case 'polygon':
    case 'cloud':
      return appearance({ ...DEFAULT_STROKE, lineCap: 'round', lineJoin: 'round' }, null, null)
    case 'rectangle':
    case 'circle':
      return appearance({ ...DEFAULT_STROKE }, null, null)
    case 'note':
      return appearance(null, { color: '#ffdc5e', opacity: 1 }, {
        color: '#222222', opacity: 1, fontSize: 12
      })
    case 'stamp':
      return appearance(null, null, null)
  }
}

/** Deeply applies a validated partial override to one resolved appearance. */
export function mergeAnnotationAppearance(
  type: AnnotationType,
  base: AnnotationAppearance,
  override: AnnotationAppearanceInput | undefined
): AnnotationAppearance {
  if (override === undefined) return structuredClone(base)
  const capabilities = CAPABILITIES[type]
  assertSupportedComponent('stroke', override.stroke, capabilities.stroke, type)
  assertSupportedComponent('fill', override.fill, capabilities.fill, type)
  assertSupportedComponent('text', override.text, capabilities.text, type)
  if (override.stroke !== undefined && override.stroke !== null) {
    if (!capabilities.dash && (override.stroke.dash !== undefined
      || override.stroke.dashOffset !== undefined)) unsupported(type, 'dash')
    if (!capabilities.lineCap && override.stroke.lineCap !== undefined) unsupported(type, 'lineCap')
    if (!capabilities.lineJoin && override.stroke.lineJoin !== undefined) unsupported(type, 'lineJoin')
  }
  const merged: AnnotationAppearance = {
    opacity: override.opacity ?? base.opacity,
    stroke: mergeComponent(base.stroke, override.stroke, DEFAULT_STROKE),
    fill: mergeComponent(base.fill, override.fill, { color: '#ffffff', opacity: 0 }),
    text: mergeComponent(base.text, override.text, { color: '#000000', opacity: 1, fontSize: 14 })
  }
  validateResolvedAppearance(type, merged)
  return merged
}

/** Resolves Core defaults, an engine default, a tool value, and one creation override. */
export function resolveAnnotationAppearance(
  type: AnnotationType,
  ...overrides: readonly (AnnotationAppearanceInput | undefined)[]
): AnnotationAppearance {
  return overrides.reduce<AnnotationAppearance>(
    (current, override) => mergeAnnotationAppearance(type, current, override),
    getDefaultAnnotationAppearance(type)
  )
}

/** Validates one fully resolved canonical appearance against type capabilities. */
export function validateResolvedAppearance(type: AnnotationType, value: AnnotationAppearance): void {
  const capabilities = CAPABILITIES[type]
  validateAnnotationAppearance(value)
  if (!capabilities.stroke && value.stroke !== null) unsupported(type, 'stroke')
  if (!capabilities.fill && value.fill !== null) unsupported(type, 'fill')
  if (!capabilities.text && value.text !== null) unsupported(type, 'text')
  if (value.stroke !== null) validateStroke(type, value.stroke, capabilities)
}

/** Validates type-independent numeric, color, and line appearance invariants. */
export function validateAnnotationAppearance(value: AnnotationAppearance): void {
  if (!unit(value.opacity)) throw new RangeError('Annotation opacity must be between zero and one.')
  if (value.stroke !== null) validateGenericStroke(value.stroke)
  if (value.fill !== null) {
    validateColor(value.fill.color)
    if (!unit(value.fill.opacity)) throw new RangeError('Fill opacity must be between zero and one.')
  }
  if (value.text !== null) {
    validateColor(value.text.color)
    if (!unit(value.text.opacity) || !positive(value.text.fontSize)) {
      throw new RangeError('Text appearance is invalid.')
    }
  }
}

/** Creates a capability record with explicit defaults for optional controls. */
function capability(
  stroke: boolean,
  fill: boolean,
  text: boolean,
  dash = stroke,
  lineCap = stroke,
  lineJoin = stroke
): AnnotationAppearanceCapabilities {
  return { stroke, fill, text, dash, lineCap, lineJoin }
}

/** Creates one fully resolved detached appearance. */
function appearance(
  stroke: AnnotationStrokeAppearance | null,
  fill: AnnotationFillAppearance | null,
  text: AnnotationTextAppearance | null
): AnnotationAppearance {
  return { opacity: 1, stroke, fill, text }
}

/** Deeply merges or explicitly disables one appearance component. */
function mergeComponent<T extends object>(
  base: T | null,
  override: Partial<T> | null | undefined,
  enabledDefault: T
): T | null {
  if (override === undefined) return base === null ? null : { ...base }
  if (override === null) return null
  return { ...(base ?? enabledDefault), ...override }
}

/** Rejects a non-null unsupported component. */
function assertSupportedComponent(
  component: string,
  value: object | null | undefined,
  supported: boolean,
  type: AnnotationType
): void {
  if (!supported && value !== undefined && value !== null) unsupported(type, component)
}

/** Validates resolved stroke paint and geometry. */
function validateStroke(
  type: AnnotationType,
  stroke: AnnotationStrokeAppearance,
  capabilities: AnnotationAppearanceCapabilities
): void {
  validateGenericStroke(stroke)
  if (!capabilities.dash && (stroke.dash.length > 0 || stroke.dashOffset !== 0)) unsupported(type, 'dash')
  if (!new Set(['butt', 'round', 'square']).has(stroke.lineCap)
    || !new Set(['miter', 'round', 'bevel']).has(stroke.lineJoin)) {
    throw new RangeError('Stroke line geometry is invalid.')
  }
}

/** Validates stroke values without applying one type's component policy. */
function validateGenericStroke(stroke: AnnotationStrokeAppearance): void {
  validateColor(stroke.color)
  if (!positive(stroke.width) || !unit(stroke.opacity)
    || !Number.isFinite(stroke.dashOffset) || stroke.dash.length > 32
    || stroke.dash.some((part) => !positive(part))) throw new RangeError('Stroke appearance is invalid.')
  if (!new Set(['butt', 'round', 'square']).has(stroke.lineCap)
    || !new Set(['miter', 'round', 'bevel']).has(stroke.lineJoin)) {
    throw new RangeError('Stroke line geometry is invalid.')
  }
}

/** Validates one Core-supported CSS RGB color. */
function validateColor(color: string): void {
  parseAnnotationColor(color)
}

/** Returns whether a number is finite within the unit interval. */
function unit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

/** Returns whether a number is finite and positive. */
function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/** Throws a stable capability error without importing engine-layer errors. */
function unsupported(type: AnnotationType, component: string): never {
  throw new RangeError(`${type} annotations do not support appearance.${component}.`)
}
