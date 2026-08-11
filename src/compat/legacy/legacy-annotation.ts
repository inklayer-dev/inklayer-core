/**
 * @file Legacy annotation parser and serializer.
 * @description Isolates the verified React and Vue IAnnotationStore wire shape
 * from the canonical Core model while preserving unknown legacy fields.
 */

import type { Annotation, AnnotationType } from '../../domain/annotation'
import type { AnnotationComment } from '../../domain/comment'
import { InkLayerError } from '../../domain/errors'
import { parseAnnotation } from '../../domain/validation'
import type {
  LegacyAnnotation,
  LegacyAnnotationComment,
  LegacyCompatibilityOptions,
  LegacyCompatibilityWarning
} from './types'

const LEGACY_TYPE_TO_CANONICAL = new Map<number, AnnotationType>([
  [1, 'highlight'], [2, 'strikeout'], [3, 'underline'], [4, 'free-text'],
  [5, 'rectangle'], [6, 'circle'], [7, 'freehand'], [8, 'free-highlight'],
  [9, 'signature'], [10, 'stamp'], [11, 'note'], [12, 'arrow'], [13, 'cloud']
])
const CANONICAL_TYPE_TO_LEGACY = new Map<AnnotationType, number>(
  [...LEGACY_TYPE_TO_CANONICAL].map(([legacy, canonical]) => [canonical, legacy])
)
const KNOWN_FIELDS = new Set([
  'id', 'referenceNumber', 'pageNumber', 'konvaString', 'konvaClientRect', 'title',
  'type', 'color', 'subtype', 'pdfjsType', 'date', 'contentsObj', 'comments', 'user', 'native'
])

/** Parses an untrusted historical annotation into the canonical Core model. */
export function parseLegacyAnnotation(
  input: unknown,
  options: LegacyCompatibilityOptions = {}
): Annotation {
  const value = requireRecord(input)
  const id = requireString(value['id'], 'id')
  const legacyType = requireNumber(value['type'], 'type')
  const type = LEGACY_TYPE_TO_CANONICAL.get(legacyType)
  if (type === undefined) {
    throw new InkLayerError('ANNOTATION_TYPE_UNSUPPORTED', 'Legacy annotation type is unsupported.', {
      operation: 'parseLegacyAnnotation',
      annotationId: id
    })
  }
  const pageNumber = requireNumber(value['pageNumber'], 'pageNumber')
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    throw invalidLegacy('Legacy pageNumber must be a positive safe integer.', id)
  }
  const unknownFields = Object.fromEntries(
    Object.entries(value).filter(([key]) => !KNOWN_FIELDS.has(key))
  )
  if (Object.keys(unknownFields).length > 0) {
    warn(options, {
      code: 'LEGACY_FIELD_PRESERVED',
      message: 'Unknown legacy fields were preserved in extensions.',
      annotationId: id,
      field: 'extensions.legacyUnknown'
    })
  }
  const comments = requireArray(value['comments'], 'comments').map(parseLegacyComment)
  const contentValue = value['contentsObj']
  const content = contentValue === undefined || contentValue === null
    ? undefined
    : parseLegacyContent(contentValue)
  const color = value['color']
  if (color !== undefined && color !== null && typeof color !== 'string') {
    throw invalidLegacy('Legacy color must be a string, null, or undefined.', id)
  }
  const referenceNumber = value['referenceNumber']
  const annotation = {
    id,
    schemaVersion: 1,
    type,
    pageIndex: pageNumber - 1,
    bounds: parseLegacyBounds(value['konvaClientRect'], id),
    coordinateSpace: 'konva-stage',
    comments,
    author: parseLegacyUser(value['user'], id),
    createdAt: requireNullableString(value['date'], 'date', id),
    native: requireBoolean(value['native'], 'native', id),
    rendererState: {
      engine: 'konva',
      schemaVersion: 1,
      serialized: requireString(value['konvaString'], 'konvaString')
    },
    source: {
      kind: 'legacy',
      subtype: requireString(value['subtype'], 'subtype'),
      pdfjsType: requireNumber(value['pdfjsType'], 'pdfjsType')
    },
    extensions: {
      legacyTitle: requireStringAllowEmpty(value['title'], 'title'),
      legacyUnknown: unknownFields
    },
    ...(content === undefined ? {} : { content }),
    ...(color === undefined ? {} : { appearance: { color } }),
    ...(referenceNumber === undefined ? {} : { referenceNumber })
  }
  return parseAnnotation(annotation)
}

/** Serializes a canonical annotation to the verified historical wire shape. */
export function serializeLegacyAnnotation(
  annotation: Annotation,
  options: LegacyCompatibilityOptions = {}
): LegacyAnnotation {
  const value = parseAnnotation(annotation)
  if (value.coordinateSpace !== 'konva-stage') {
    warn(options, {
      code: 'COORDINATE_SPACE_MISMATCH',
      message: 'Legacy bounds require konva-stage coordinates.',
      annotationId: value.id,
      field: 'coordinateSpace'
    })
    throw invalidLegacy('Cannot serialize PDF-space bounds as legacy Stage bounds.', value.id)
  }
  const legacyType = CANONICAL_TYPE_TO_LEGACY.get(value.type)
  if (legacyType === undefined) {
    throw new InkLayerError('ANNOTATION_TYPE_UNSUPPORTED', 'Canonical type has no legacy tool value.', {
      operation: 'serializeLegacyAnnotation',
      annotationId: value.id,
      pageIndex: value.pageIndex
    })
  }
  if (value.updatedAt !== undefined || hasNonColorAppearance(value)) {
    warn(options, {
      code: 'LEGACY_FIELD_OMITTED',
      message: 'Canonical fields without a verified legacy equivalent were omitted.',
      annotationId: value.id,
      field: 'updatedAt/appearance'
    })
  }
  const unknown = getLegacyUnknown(value)
  return {
    ...unknown,
    id: value.id,
    pageNumber: value.pageIndex + 1,
    konvaString: value.rendererState.serialized,
    konvaClientRect: { ...value.bounds },
    title: getLegacyTitle(value),
    type: legacyType,
    ...(value.appearance?.color === undefined ? {} : { color: value.appearance.color }),
    subtype: value.source?.subtype ?? defaultSubtype(value.type),
    pdfjsType: value.source?.pdfjsType ?? 0,
    date: value.createdAt,
    contentsObj: value.content === undefined ? null : structuredClone(value.content),
    comments: value.comments.map(serializeLegacyComment),
    user: { ...value.author },
    native: value.native,
    ...(value.referenceNumber === undefined ? {} : { referenceNumber: value.referenceNumber })
  }
}

/** Parses one historical comment. */
function parseLegacyComment(input: unknown): unknown {
  const value = requireRecord(input)
  const candidate = {
    id: requireString(value['id'], 'comment.id'),
    title: requireStringAllowEmpty(value['title'], 'comment.title'),
    content: requireStringAllowEmpty(value['content'], 'comment.content'),
    date: value['date'],
    ...(value['user'] === undefined ? {} : { author: value['user'] }),
    ...(value['status'] === undefined ? {} : { status: value['status'] }),
    ...(value['references'] === undefined ? {} : { references: value['references'] })
  }
  return candidate
}

/** Parses historical semantic content. */
function parseLegacyContent(input: unknown): unknown {
  const value = requireRecord(input)
  return {
    text: requireStringAllowEmpty(value['text'], 'contentsObj.text'),
    ...(value['selectedText'] === undefined
      ? {}
      : { selectedText: requireStringAllowEmpty(value['selectedText'], 'contentsObj.selectedText') }),
    ...(value['image'] === undefined ? {} : { image: requireString(value['image'], 'contentsObj.image') }),
    ...(value['references'] === undefined ? {} : { references: value['references'] })
  }
}

/** Parses historical Stage bounds. */
function parseLegacyBounds(input: unknown, annotationId: string): Annotation['bounds'] {
  const value = requireRecord(input)
  const bounds = {
    x: requireNumber(value['x'], 'konvaClientRect.x'),
    y: requireNumber(value['y'], 'konvaClientRect.y'),
    width: requireNumber(value['width'], 'konvaClientRect.width'),
    height: requireNumber(value['height'], 'konvaClientRect.height')
  }
  if (bounds.width < 0 || bounds.height < 0) throw invalidLegacy('Legacy bounds are invalid.', annotationId)
  return bounds
}

/** Parses a historical user identity. */
function parseLegacyUser(input: unknown, annotationId: string): Annotation['author'] {
  const value = requireRecord(input)
  const id = requireString(value['id'], 'user.id')
  const name = requireStringAllowEmpty(value['name'], 'user.name')
  const avatarUrl = value['avatarUrl']
  if (avatarUrl !== undefined && typeof avatarUrl !== 'string') throw invalidLegacy('Legacy avatar URL is invalid.', annotationId)
  return { id, name, ...(avatarUrl === undefined ? {} : { avatarUrl }) }
}

/** Serializes one canonical comment to its historical field names. */
function serializeLegacyComment(comment: AnnotationComment): LegacyAnnotationComment {
  return {
    id: comment.id,
    title: comment.title,
    date: comment.date,
    content: comment.content,
    ...(comment.status === undefined ? {} : { status: comment.status }),
    ...(comment.author === undefined ? {} : { user: { ...comment.author } }),
    ...(comment.references === undefined
      ? {}
      : { references: comment.references.map((reference) => ({ ...reference })) })
  }
}

/** Returns preserved unknown legacy fields from canonical extensions. */
function getLegacyUnknown(annotation: Annotation): Record<string, unknown> {
  const value = annotation.extensions?.['legacyUnknown']
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? structuredClone(value) as Record<string, unknown>
    : {}
}

/** Returns the preserved historical title when present. */
function getLegacyTitle(annotation: Annotation): string {
  const title = annotation.extensions?.['legacyTitle']
  return typeof title === 'string' ? title : annotation.author.name
}

/** Returns whether appearance contains properties absent from the old payload. */
function hasNonColorAppearance(annotation: Annotation): boolean {
  const appearance = annotation.appearance
  return appearance !== undefined
    && (appearance.fontSize !== undefined || appearance.opacity !== undefined || appearance.strokeWidth !== undefined)
}

/** Returns a safe default legacy subtype for new canonical annotations. */
function defaultSubtype(type: AnnotationType): string {
  const subtypeByType: Partial<Record<AnnotationType, string>> = {
    highlight: 'Highlight', strikeout: 'StrikeOut', underline: 'Underline',
    'free-text': 'FreeText', rectangle: 'Square', circle: 'Circle', freehand: 'Ink',
    'free-highlight': 'Ink', signature: 'Stamp', stamp: 'Stamp', note: 'Text',
    arrow: 'Line', cloud: 'Polygon'
  }
  return subtypeByType[type] ?? 'None'
}

/** Emits one optional structured compatibility warning. */
function warn(options: LegacyCompatibilityOptions, warning: LegacyCompatibilityWarning): void {
  options.onWarning?.(warning)
}

/** Requires a non-array object. */
function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidLegacy('Legacy annotation field must be an object.')
  }
  return value as Record<string, unknown>
}

/** Requires a non-empty string. */
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw invalidLegacy(`${field} must be a non-empty string.`)
  return value
}

/** Requires a string while permitting the empty value. */
function requireStringAllowEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalidLegacy(`${field} must be a string.`)
  return value
}

/** Requires a finite number. */
function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidLegacy(`${field} must be a finite number.`)
  return value
}

/** Requires a boolean. */
function requireBoolean(value: unknown, field: string, annotationId: string): boolean {
  if (typeof value !== 'boolean') throw invalidLegacy(`${field} must be a boolean.`, annotationId)
  return value
}

/** Requires a nullable string. */
function requireNullableString(value: unknown, field: string, annotationId: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length === 0) throw invalidLegacy(`${field} must be a string or null.`, annotationId)
  return value
}

/** Requires an array. */
function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalidLegacy(`${field} must be an array.`)
  return value
}

/** Creates a structured compatibility validation error. */
function invalidLegacy(message: string, annotationId?: string): InkLayerError {
  return new InkLayerError('ANNOTATION_INVALID', message, {
    operation: 'legacyCompatibility',
    ...(annotationId === undefined ? {} : { annotationId })
  })
}
