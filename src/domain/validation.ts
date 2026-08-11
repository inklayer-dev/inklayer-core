/**
 * @file Runtime validation for canonical annotation input.
 * @description Converts untrusted JSON-like values into detached canonical
 * annotations with bounded strings, finite geometry, and structured failures.
 */

import type {
  Annotation,
  AnnotationAppearance,
  AnnotationBounds,
  AnnotationContent,
  AnnotationSource,
  AnnotationType,
  KonvaRendererState
} from './annotation'
import type { AnnotationComment, CommentStatus } from './comment'
import { InkLayerError } from './errors'
import { isValidReferenceNumber } from './numbering'
import { isValidAnnotationReference } from './references'
import type { User } from './user'

const MAX_ID_LENGTH = 512
const MAX_TEXT_LENGTH = 1_000_000
const MAX_RENDERER_STATE_LENGTH = 10_000_000
const MAX_COMMENTS = 10_000
const MAX_REFERENCES = 10_000
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const ANNOTATION_TYPES = new Set<AnnotationType>([
  'highlight', 'strikeout', 'underline', 'free-text', 'rectangle', 'circle',
  'freehand', 'free-highlight', 'signature', 'stamp', 'note', 'line', 'arrow',
  'polygon', 'polyline', 'cloud'
])
const COMMENT_STATUSES = new Set<CommentStatus>([
  'Accepted', 'Rejected', 'Cancelled', 'Completed', 'None', 'Closed'
])

/** Parses and validates one untrusted canonical annotation. */
export function parseAnnotation(input: unknown): Annotation {
  try {
    const value = requireRecord(input, 'annotation')
    const id = requireString(value['id'], 'id', MAX_ID_LENGTH)
    const schemaVersion = requireLiteral(value['schemaVersion'], 1, 'schemaVersion')
    const type = requireEnum(value['type'], ANNOTATION_TYPES, 'type')
    const pageIndex = requireNonNegativeInteger(value['pageIndex'], 'pageIndex')
    const bounds = parseBounds(value['bounds'])
    const coordinateSpace = requireEnum(
      value['coordinateSpace'],
      new Set(['konva-stage', 'pdf-user-space'] as const),
      'coordinateSpace'
    )
    const comments = parseComments(value['comments'])
    const author = parseUser(value['author'], 'author')
    const createdAt = requireNullableString(value['createdAt'], 'createdAt', 256)
    const native = requireBoolean(value['native'], 'native')
    const rendererState = parseRendererState(value['rendererState'])
    const content = value['content'] === undefined ? undefined : parseContent(value['content'])
    const appearance = value['appearance'] === undefined
      ? undefined
      : parseAppearance(value['appearance'])
    const updatedAt = value['updatedAt'] === undefined
      ? undefined
      : requireNullableString(value['updatedAt'], 'updatedAt', 256)
    const referenceNumber = value['referenceNumber'] === undefined
      ? undefined
      : requireReferenceNumber(value['referenceNumber'])
    const source = value['source'] === undefined ? undefined : parseSource(value['source'])
    const extensions = value['extensions'] === undefined
      ? undefined
      : parseExtensions(value['extensions'])

    return {
      id,
      schemaVersion,
      type,
      pageIndex,
      bounds,
      coordinateSpace,
      comments,
      author,
      createdAt,
      native,
      rendererState,
      ...(content === undefined ? {} : { content }),
      ...(appearance === undefined ? {} : { appearance }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
      ...(referenceNumber === undefined ? {} : { referenceNumber }),
      ...(source === undefined ? {} : { source }),
      ...(extensions === undefined ? {} : { extensions })
    }
  } catch (cause) {
    if (cause instanceof InkLayerError) throw cause
    throw invalid('Annotation validation failed.', 'parseAnnotation', cause)
  }
}

/** Parses an array of untrusted canonical annotations and rejects duplicate IDs. */
export function parseAnnotations(input: unknown): Annotation[] {
  if (!Array.isArray(input)) throw invalid('Annotations must be an array.', 'parseAnnotations')
  const annotations = input.map(parseAnnotation)
  const ids = new Set<string>()
  for (const annotation of annotations) {
    if (ids.has(annotation.id)) {
      throw new InkLayerError('ANNOTATION_DUPLICATE_ID', 'Annotation IDs must be unique.', {
        operation: 'parseAnnotations',
        annotationId: annotation.id,
        pageIndex: annotation.pageIndex
      })
    }
    ids.add(annotation.id)
  }
  return annotations
}

/** Parses finite, non-negative canonical bounds. */
function parseBounds(input: unknown): AnnotationBounds {
  const value = requireRecord(input, 'bounds')
  const x = requireFiniteNumber(value['x'], 'bounds.x')
  const y = requireFiniteNumber(value['y'], 'bounds.y')
  const width = requireFiniteNumber(value['width'], 'bounds.width')
  const height = requireFiniteNumber(value['height'], 'bounds.height')
  if (width < 0 || height < 0) throw invalid('Bounds dimensions cannot be negative.', 'parseBounds')
  return { x, y, width, height }
}

/** Parses bounded semantic content. */
function parseContent(input: unknown): AnnotationContent {
  const value = requireRecord(input, 'content')
  const referencesValue = value['references']
  if (referencesValue !== undefined && (!Array.isArray(referencesValue)
    || referencesValue.length > MAX_REFERENCES
    || !referencesValue.every(isValidAnnotationReference))) {
    throw invalid('Content references are invalid.', 'parseContent')
  }
  return {
    text: requireBoundedString(value['text'], 'content.text', MAX_TEXT_LENGTH),
    ...(value['selectedText'] === undefined
      ? {}
      : { selectedText: requireBoundedString(value['selectedText'], 'content.selectedText', MAX_TEXT_LENGTH) }),
    ...(value['image'] === undefined
      ? {}
      : { image: requireString(value['image'], 'content.image', MAX_RENDERER_STATE_LENGTH) }),
    ...(referencesValue === undefined
      ? {}
      : { references: referencesValue.map((reference) => ({ ...reference })) })
  }
}

/** Parses optional appearance properties and their numeric ranges. */
function parseAppearance(input: unknown): AnnotationAppearance {
  const value = requireRecord(input, 'appearance')
  const opacity = optionalFiniteNumber(value['opacity'], 'appearance.opacity')
  if (opacity !== undefined && (opacity < 0 || opacity > 1)) {
    throw invalid('Appearance opacity must be between 0 and 1.', 'parseAppearance')
  }
  const fontSize = optionalFiniteNumber(value['fontSize'], 'appearance.fontSize')
  const strokeWidth = optionalFiniteNumber(value['strokeWidth'], 'appearance.strokeWidth')
  if (fontSize !== undefined && fontSize < 0) throw invalid('Font size cannot be negative.', 'parseAppearance')
  if (strokeWidth !== undefined && strokeWidth < 0) throw invalid('Stroke width cannot be negative.', 'parseAppearance')
  const color = value['color'] === null
    ? null
    : value['color'] === undefined
      ? undefined
      : requireString(value['color'], 'appearance.color', 1024)
  return {
    ...(color === undefined ? {} : { color }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(opacity === undefined ? {} : { opacity }),
    ...(strokeWidth === undefined ? {} : { strokeWidth })
  }
}

/** Parses a bounded canonical comment array. */
function parseComments(input: unknown): AnnotationComment[] {
  if (!Array.isArray(input) || input.length > MAX_COMMENTS) {
    throw invalid('Comments must be a bounded array.', 'parseComments')
  }
  return input.map((entry, index) => {
    const value = requireRecord(entry, `comments[${index}]`)
    const referencesValue = value['references']
    let references: AnnotationComment['references']
    if (referencesValue !== undefined) {
      if (!Array.isArray(referencesValue) || referencesValue.length > MAX_REFERENCES
        || !referencesValue.every(isValidAnnotationReference)) {
        throw invalid('Comment references are invalid.', 'parseComments')
      }
      references = referencesValue.map((reference) => ({ ...reference }))
    }
    const status = value['status'] === undefined
      ? undefined
      : requireEnum(value['status'], COMMENT_STATUSES, `comments[${index}].status`)
    const author = value['author'] === undefined
      ? undefined
      : parseUser(value['author'], `comments[${index}].author`)
    return {
      id: requireString(value['id'], `comments[${index}].id`, MAX_ID_LENGTH),
      title: requireBoundedString(value['title'], `comments[${index}].title`, MAX_TEXT_LENGTH),
      content: requireBoundedString(value['content'], `comments[${index}].content`, MAX_TEXT_LENGTH),
      date: requireNullableString(value['date'], `comments[${index}].date`, 256),
      ...(author === undefined ? {} : { author }),
      ...(status === undefined ? {} : { status }),
      ...(references === undefined ? {} : { references })
    }
  })
}

/** Parses one user identity. */
function parseUser(input: unknown, path: string): User {
  const value = requireRecord(input, path)
  return {
    id: requireString(value['id'], `${path}.id`, MAX_ID_LENGTH),
    name: requireBoundedString(value['name'], `${path}.name`, MAX_TEXT_LENGTH),
    ...(value['avatarUrl'] === undefined
      ? {}
      : { avatarUrl: requireString(value['avatarUrl'], `${path}.avatarUrl`, MAX_TEXT_LENGTH) })
  }
}

/** Parses the versioned renderer state envelope without parsing its JSON body. */
function parseRendererState(input: unknown): KonvaRendererState {
  const value = requireRecord(input, 'rendererState')
  return {
    engine: requireLiteral(value['engine'], 'konva', 'rendererState.engine'),
    schemaVersion: requireLiteral(value['schemaVersion'], 1, 'rendererState.schemaVersion'),
    serialized: requireString(
      value['serialized'],
      'rendererState.serialized',
      MAX_RENDERER_STATE_LENGTH
    )
  }
}

/** Parses optional source provenance. */
function parseSource(input: unknown): AnnotationSource {
  const value = requireRecord(input, 'source')
  return {
    kind: requireEnum(value['kind'], new Set(['legacy', 'pdf-native', 'core'] as const), 'source.kind'),
    ...(value['subtype'] === undefined
      ? {}
      : { subtype: requireString(value['subtype'], 'source.subtype', 256) }),
    ...(value['pdfjsType'] === undefined
      ? {}
      : { pdfjsType: requireFiniteNumber(value['pdfjsType'], 'source.pdfjsType') })
  }
}

/** Validates and detaches an extension object while rejecting prototype keys. */
function parseExtensions(input: unknown): Record<string, unknown> {
  const value = requireRecord(input, 'extensions')
  validateExtensionValue(value, 0)
  return structuredClone(value)
}

/** Recursively validates extension JSON-like values to a bounded depth. */
function validateExtensionValue(value: unknown, depth: number): void {
  if (depth > 100) throw invalid('Extensions exceed the maximum depth.', 'parseExtensions')
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw invalid('Extensions cannot contain non-finite numbers.', 'parseExtensions')
  }
  if (typeof value === 'string' && value.length > MAX_TEXT_LENGTH) {
    throw invalid('Extensions contain an oversized string.', 'parseExtensions')
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number') return
  if (Array.isArray(value)) {
    value.forEach((entry) => validateExtensionValue(entry, depth + 1))
    return
  }
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value) as unknown
    if (prototype !== Object.prototype && prototype !== null) {
      throw invalid('Extensions must contain only plain objects.', 'parseExtensions')
    }
    for (const [key, entry] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) throw invalid('Extensions contain a dangerous key.', 'parseExtensions')
      validateExtensionValue(entry, depth + 1)
    }
    return
  }
  throw invalid('Extensions must contain only JSON-compatible values.', 'parseExtensions')
}

/** Requires a non-array object record. */
function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalid(`${path} must be an object.`, 'validation')
  return value
}

/** Returns whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Requires a bounded string. */
function requireString(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw invalid(`${path} must be a non-empty bounded string.`, 'validation')
  }
  return value
}

/** Requires a bounded string that may be empty. */
function requireBoundedString(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw invalid(`${path} must be a bounded string.`, 'validation')
  }
  return value
}

/** Requires a string or null. */
function requireNullableString(value: unknown, path: string, maximumLength: number): string | null {
  return value === null ? null : requireString(value, path, maximumLength)
}

/** Requires a finite number. */
function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(`${path} must be a finite number.`, 'validation')
  }
  return value
}

/** Parses an optional finite number. */
function optionalFiniteNumber(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : requireFiniteNumber(value, path)
}

/** Requires a non-negative safe integer. */
function requireNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalid(`${path} must be a non-negative safe integer.`, 'validation')
  }
  return value
}

/** Requires a boolean. */
function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw invalid(`${path} must be a boolean.`, 'validation')
  return value
}

/** Requires an exact literal. */
function requireLiteral<const T extends string | number>(value: unknown, literal: T, path: string): T {
  if (value !== literal) throw invalid(`${path} has an unsupported value.`, 'validation')
  return literal
}

/** Requires a member of a typed enum set. */
function requireEnum<const T extends string>(value: unknown, values: ReadonlySet<T>, path: string): T {
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw invalid(`${path} has an unsupported value.`, 'validation')
  }
  return value as T
}

/** Requires a valid positive safe reference number. */
function requireReferenceNumber(value: unknown): number {
  if (!isValidReferenceNumber(value)) {
    throw invalid('referenceNumber must be a positive safe integer.', 'validation')
  }
  return value
}

/** Creates the shared structured invalid-annotation error. */
function invalid(message: string, operation: string, cause?: unknown): InkLayerError {
  return new InkLayerError('ANNOTATION_INVALID', message, {
    operation,
    ...(cause === undefined ? {} : { cause })
  })
}
