/**
 * @file PDF.js native annotation normalization and decoding.
 * @description Decides support before mutation, isolates malformed entries,
 * converts geometry centrally, attaches replies, and builds canonical snapshots.
 */

import type { Annotation, AnnotationBounds, AnnotationType } from '../../domain/annotation'
import { resolveAnnotationAppearance } from '../../domain/appearance'
import type { AnnotationComment } from '../../domain/comment'
import { parseAnnotation } from '../../domain/validation'
import { pdfPointToStage, pdfRectToStageBounds } from '../../geometry/coordinates'
import { buildToolRendererState } from '../../renderer/konva/snapshot-builder'
import type {
  PdfJsAnnotationInput,
  PdfJsAnnotationPageInput,
  PdfJsImportWarning,
  PdfJsPoint
} from './types'

const TYPE_BY_PDFJS = new Map<number, AnnotationType>([
  [1, 'note'], [3, 'free-text'], [4, 'line'], [5, 'rectangle'], [6, 'circle'],
  [7, 'polygon'], [8, 'polyline'], [9, 'highlight'], [10, 'underline'],
  [12, 'strikeout'], [13, 'stamp'], [15, 'freehand'], [27, 'note']
])

/** Result of decoding supported PDF.js annotations. */
export interface ImportPdfJsAnnotationsResult {
  /** Successfully decoded canonical annotations. */
  annotations: Annotation[]
  /** Recoverable malformed-entry warnings. */
  warnings: PdfJsImportWarning[]
  /** PDF.js IDs safe to hide after successful canonical decoding. */
  supportedIds: string[]
}

/** Decodes supported PDF.js annotations across normalized pages. */
export function importPdfJsAnnotations(
  pages: readonly PdfJsAnnotationPageInput[]
): ImportPdfJsAnnotationsResult {
  const annotations: Annotation[] = []
  const warnings: PdfJsImportWarning[] = []
  const supportedIds: string[] = []
  const replies = collectReplies(pages)
  for (const page of pages) {
    for (const input of page.annotations) {
      try {
        const value = parseInput(input)
        if (value.inReplyTo !== undefined) continue
        const type = resolveType(value)
        if (type === undefined) continue
        const annotation = decodeAnnotation(value, type, page, replies.get(value.id) ?? [])
        annotations.push(annotation)
        // A Stamp/Signature appearance may live only in the PDF appearance stream.
        // Keep that native raster visible until Core has an equivalent image payload;
        // the canonical overlay still supplies selection and metadata interaction.
        if (canReplaceNativeAppearance(annotation)) {
          supportedIds.push(value.id, ...(replies.get(value.id) ?? []).map((reply) => reply.id))
        }
      } catch (cause) {
        const candidateId = getCandidateId(input)
        warnings.push({
          code: 'MALFORMED_ANNOTATION',
          message: 'Malformed supported PDF annotation was skipped.',
          pageIndex: page.pageIndex,
          ...(candidateId === undefined ? {} : { annotationId: candidateId }),
          cause
        })
      }
    }
  }
  return { annotations, warnings, supportedIds: [...new Set(supportedIds)] }
}

/** Returns whether Core can safely replace the PDF-rendered appearance. */
function canReplaceNativeAppearance(annotation: Annotation): boolean {
  if (annotation.type === 'stamp') return annotation.content?.image !== undefined
  if (annotation.type === 'signature') return annotation.content?.signature !== undefined
  return true
}

/** Decodes one supported annotation to canonical Stage-space state. */
function decodeAnnotation(
  input: PdfJsAnnotationInput,
  type: AnnotationType,
  page: PdfJsAnnotationPageInput,
  replies: readonly PdfJsAnnotationInput[]
): Annotation {
  const bounds = pdfRectToStageBounds(input.rect, page.pageBox)
  const strokes = type === 'freehand' || type === 'free-highlight' || type === 'signature'
    ? extractInkStrokes(input, page)
    : undefined
  const points = strokes?.[0] ?? extractPoints(input, page)
  const textRects = extractTextRects(input, page)
  const content = {
    text: input.contentsObj?.str ?? '',
    ...(type === 'highlight' || type === 'underline' || type === 'strikeout'
      ? { selectedText: input.contentsObj?.str ?? '' }
      : {}),
    ...(type === 'stamp' && input.image !== undefined ? { image: input.image } : {}),
    ...(type === 'signature'
      ? input.inkLayerType === 'SignatureImage' && input.image !== undefined
        ? { signature: { kind: 'image' as const, image: input.image } }
        : strokes === undefined ? {} : { signature: { kind: 'ink' as const, strokes } }
      : {})
  }
  const color = colorToHex(input.color)
  const appearance = input.appearance === undefined ? resolveAnnotationAppearance(type, {
    ...(input.opacity === undefined ? {} : { opacity: input.opacity }),
    ...(type === 'highlight' ? { fill: { color } }
      : type === 'free-text' ? { text: {
          color,
          ...(input.fontSize === undefined ? {} : { fontSize: input.fontSize })
        } }
        : type === 'note' ? { fill: { color } }
          : { stroke: {
              color,
              ...(input.borderStyle?.width === undefined ? {} : { width: input.borderStyle.width }),
              ...(input.borderStyle?.dashArray === undefined ? {} : { dash: input.borderStyle.dashArray })
            } })
  }) : resolveAnnotationAppearance(type, input.appearance)
  const rendererState = buildToolRendererState({
    id: input.id,
    type,
    bounds,
    content,
    appearance,
    ...(points === undefined ? {} : { points }),
    ...(strokes === undefined ? {} : { strokes }),
    ...(textRects === undefined ? {} : { textRects })
  })
  return parseAnnotation({
    id: input.id,
    schemaVersion: 1,
    type,
    pageIndex: page.pageIndex,
    bounds,
    coordinateSpace: 'konva-stage',
    content,
    appearance,
    comments: replies.map(parseReply),
    author: { id: `pdf:${input.titleObj?.str ?? 'unknown'}`, name: input.titleObj?.str ?? '' },
    createdAt: input.creationDate ?? input.modificationDate ?? null,
    ...(input.modificationDate === undefined ? {} : { updatedAt: input.modificationDate }),
    native: true,
    rendererState,
    source: { kind: 'pdf-native', subtype: input.subtype, pdfjsType: input.annotationType }
  })
}

/** Converts every PDF InkList stroke instead of collapsing Freehand to its first path. */
function extractInkStrokes(
  input: PdfJsAnnotationInput,
  page: PdfJsAnnotationPageInput
): number[][] | undefined {
  const strokes = input.inkLists?.map((stroke) => stroke.flatMap((point) => {
    const converted = pdfPointToStage(point, page.pageBox)
    return [converted.x, converted.y]
  })).filter((stroke) => stroke.length >= 4)
  return strokes === undefined || strokes.length === 0 ? undefined : strokes
}

/** Resolves canonical type only for explicitly supported input. */
function resolveType(input: PdfJsAnnotationInput): AnnotationType | undefined {
  if (input.canonicalType !== undefined) return input.canonicalType
  if (input.inkLayerType === 'Cloud' || input.cloudy === true) return 'cloud'
  if (input.inkLayerType === 'FreeText') return 'free-text'
  if (input.inkLayerType === 'Arrow') return 'arrow'
  if (input.inkLayerType === 'FreeHighlight') return 'free-highlight'
  if (input.inkLayerType === 'SignatureInk' || input.inkLayerType === 'SignatureImage') return 'signature'
  if (input.inkLayerType === 'Stamp') return 'stamp'
  if (input.annotationType === 4 && input.lineEndings?.some((ending) => ending.includes('Arrow')) === true) {
    return 'arrow'
  }
  return TYPE_BY_PDFJS.get(input.annotationType)
}

/** Extracts line, ink, or vertex points and converts them to Stage space. */
function extractPoints(
  input: PdfJsAnnotationInput,
  page: PdfJsAnnotationPageInput
): number[] | undefined {
  let points: readonly PdfJsPoint[] | undefined
  if (input.inkLists?.[0] !== undefined) points = input.inkLists[0]
  else if (input.vertices !== undefined) points = input.vertices
  else if (input.lineCoordinates !== undefined) {
    points = [
      { x: input.lineCoordinates[0], y: input.lineCoordinates[1] },
      { x: input.lineCoordinates[2], y: input.lineCoordinates[3] }
    ]
  }
  if (points === undefined) return undefined
  return points.flatMap((point) => {
    const converted = pdfPointToStage(point, page.pageBox)
    return [converted.x, converted.y]
  })
}

/** Extracts text quadrilaterals as Stage rectangles. */
function extractTextRects(
  input: PdfJsAnnotationInput,
  page: PdfJsAnnotationPageInput
): AnnotationBounds[] | undefined {
  const values = input.quadPoints
  if (values === undefined || values.length === 0 || values.length % 8 !== 0) return undefined
  const rects: AnnotationBounds[] = []
  for (let index = 0; index < values.length; index += 8) {
    const x1 = values[index]
    const y1 = values[index + 1]
    const x2 = values[index + 2]
    const y2 = values[index + 3]
    const x3 = values[index + 4]
    const y3 = values[index + 5]
    const x4 = values[index + 6]
    const y4 = values[index + 7]
    if ([x1, y1, x2, y2, x3, y3, x4, y4].some((value) => value === undefined)) continue
    const xs = [x1, x2, x3, x4] as number[]
    const ys = [y1, y2, y3, y4] as number[]
    const pdfRect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const
    rects.push(pdfRectToStageBounds(pdfRect, page.pageBox))
  }
  return rects.length === 0 ? undefined : rects
}

/** Parses one PDF reply into a canonical comment. */
function parseReply(input: PdfJsAnnotationInput): AnnotationComment {
  return {
    id: input.id,
    title: input.titleObj?.str ?? '',
    content: input.contentsObj?.str ?? '',
    date: input.modificationDate ?? input.creationDate ?? null,
    author: { id: `pdf:${input.titleObj?.str ?? 'unknown'}`, name: input.titleObj?.str ?? '' }
  }
}

/** Collects reply annotations by stable parent ID. */
function collectReplies(
  pages: readonly PdfJsAnnotationPageInput[]
): Map<string, PdfJsAnnotationInput[]> {
  const replies = new Map<string, PdfJsAnnotationInput[]>()
  for (const page of pages) {
    for (const input of page.annotations) {
      try {
        const value = parseInput(input)
        if (value.inReplyTo === undefined) continue
        const values = replies.get(value.inReplyTo) ?? []
        values.push(value)
        replies.set(value.inReplyTo, values)
      } catch {
        // The main decoding pass reports malformed entries with page context.
      }
    }
  }
  return replies
}

/** Performs minimal runtime validation without casting the whole input. */
function parseInput(input: unknown): PdfJsAnnotationInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError('Annotation must be an object.')
  const value = input as Record<string, unknown>
  if (typeof value['id'] !== 'string' || value['id'].length === 0
    || typeof value['annotationType'] !== 'number' || !Number.isSafeInteger(value['annotationType'])
    || !isRect(value['rect'])) {
    throw new TypeError('Annotation identity, type, or rectangle is invalid.')
  }
  validateOptionalInput(value)
  const normalized = structuredClone(value)
  for (const key of ['color', 'quadPoints', 'lineCoordinates'] as const) {
    if (ArrayBuffer.isView(normalized[key])) {
      normalized[key] = Array.from(normalized[key] as unknown as ArrayLike<number>)
    }
  }
  const borderStyle = normalized['borderStyle']
  if (typeof borderStyle === 'object' && borderStyle !== null && !Array.isArray(borderStyle)) {
    const border = borderStyle as Record<string, unknown>
    if (ArrayBuffer.isView(border['dashArray'])) {
      border['dashArray'] = Array.from(border['dashArray'] as unknown as ArrayLike<number>)
    }
  }
  return normalized as unknown as PdfJsAnnotationInput
}

/** Validates optional normalized fields consumed by decoders. */
function validateOptionalInput(value: Record<string, unknown>): void {
  for (const key of ['subtype', 'modificationDate', 'creationDate', 'inReplyTo']) {
    const field = value[key]
    if (field !== undefined && field !== null && typeof field !== 'string') throw new TypeError(`${key} is invalid.`)
  }
  if (value['image'] !== undefined && typeof value['image'] !== 'string') throw new TypeError('image is invalid.')
  if (value['canonicalType'] !== undefined
    && !TYPE_BY_PDFJS_VALUES.has(value['canonicalType'] as AnnotationType)) {
    throw new TypeError('canonicalType is invalid.')
  }
  if (value['appearance'] !== undefined && (typeof value['appearance'] !== 'object'
    || value['appearance'] === null || Array.isArray(value['appearance']))) {
    throw new TypeError('appearance is invalid.')
  }
  if (value['borderStyle'] !== undefined) {
    if (typeof value['borderStyle'] !== 'object' || value['borderStyle'] === null
      || Array.isArray(value['borderStyle'])) throw new TypeError('borderStyle is invalid.')
    const border = value['borderStyle'] as Record<string, unknown>
    if (border['width'] !== undefined && (typeof border['width'] !== 'number'
      || !Number.isFinite(border['width']))) throw new TypeError('borderStyle.width is invalid.')
    if (border['dashArray'] !== undefined && !isFiniteNumberArray(border['dashArray'])) {
      throw new TypeError('borderStyle.dashArray is invalid.')
    }
  }
  for (const key of ['opacity', 'fontSize']) {
    const field = value[key]
    if (field !== undefined && (typeof field !== 'number' || !Number.isFinite(field))) throw new TypeError(`${key} is invalid.`)
  }
  if (value['color'] !== undefined && !isFiniteNumberArray(value['color'], 3)) throw new TypeError('color is invalid.')
  if (value['quadPoints'] !== undefined && !isFiniteNumberArray(value['quadPoints'])) throw new TypeError('quadPoints are invalid.')
  if (value['lineCoordinates'] !== undefined && !isFiniteNumberArray(value['lineCoordinates'], 4)) {
    throw new TypeError('lineCoordinates are invalid.')
  }
  if (value['lineEndings'] !== undefined && (!Array.isArray(value['lineEndings'])
    || value['lineEndings'].some((entry) => typeof entry !== 'string'))) {
    throw new TypeError('lineEndings are invalid.')
  }
  if (value['vertices'] !== undefined && !isPointArray(value['vertices'])) throw new TypeError('vertices are invalid.')
  if (value['inkLists'] !== undefined && (!Array.isArray(value['inkLists'])
    || value['inkLists'].some((entry) => !isPointArray(entry)))) throw new TypeError('inkLists are invalid.')
  if (value['cloudy'] !== undefined && typeof value['cloudy'] !== 'boolean') throw new TypeError('cloudy is invalid.')
  if (value['inkLayerType'] !== undefined
    && ![
      'Cloud', 'FreeText', 'Arrow', 'FreeHighlight',
      'SignatureInk', 'SignatureImage', 'Stamp'
    ].includes(String(value['inkLayerType']))) {
    throw new TypeError('inkLayerType is invalid.')
  }
  if (value['contentsObj'] !== undefined && !isStringWrapper(value['contentsObj'])) throw new TypeError('contentsObj is invalid.')
  if (value['titleObj'] !== undefined && !isStringWrapper(value['titleObj'])) throw new TypeError('titleObj is invalid.')
}

const TYPE_BY_PDFJS_VALUES = new Set<AnnotationType>([
  'highlight', 'strikeout', 'underline', 'free-text', 'rectangle', 'circle',
  'freehand', 'free-highlight', 'signature', 'stamp', 'note', 'line', 'arrow',
  'polygon', 'polyline', 'cloud'
])

/** Returns whether a value is a bounded finite number array. */
function isFiniteNumberArray(value: unknown, exactLength?: number): value is number[] {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return false
  const values = Array.from(value as ArrayLike<unknown>)
  return values.length <= 100_000
    && (exactLength === undefined || values.length === exactLength)
    && values.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

/** Returns whether a value is a bounded array of finite PDF points. */
function isPointArray(value: unknown): value is PdfJsPoint[] {
  return Array.isArray(value) && value.length <= 50_000 && value.every((entry) =>
    typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    && typeof (entry as Record<string, unknown>)['x'] === 'number'
    && Number.isFinite((entry as Record<string, unknown>)['x'])
    && typeof (entry as Record<string, unknown>)['y'] === 'number'
    && Number.isFinite((entry as Record<string, unknown>)['y']))
}

/** Returns whether an unknown value is a finite four-number rectangle. */
function isRect(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

/** Returns whether a value is a PDF.js string wrapper. */
function isStringWrapper(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Record<string, unknown>)['str'] === 'string'
}

/** Extracts a safe candidate ID for warning context. */
function getCandidateId(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined
  const id = (input as Record<string, unknown>)['id']
  return typeof id === 'string' ? id : undefined
}

/** Converts PDF RGB values to a stable CSS hex color. */
function colorToHex(color: readonly number[] | undefined): string {
  if (color === undefined || color.length < 3) return '#ff0000'
  const components = color.slice(0, 3).map((value) => {
    const byte = value <= 1 ? Math.round(value * 255) : Math.round(value)
    return Math.max(0, Math.min(255, byte)).toString(16).padStart(2, '0')
  })
  return `#${components.join('')}`
}
