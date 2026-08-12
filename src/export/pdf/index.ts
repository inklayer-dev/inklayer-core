/**
 * @file Native PDF annotation dictionary export.
 * @description Writes canonical annotations into existing PDF bytes while
 * preserving unsupported native annotation dictionaries and document content.
 */

import {
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import type { Annotation, AnnotationBounds, AnnotationType } from '../../domain/annotation'
import { parseAnnotationColor } from '../../domain/color'
import { InkLayerError } from '../../domain/errors'
import { parseAnnotation } from '../../domain/validation'
import {
  stageBoundsToPdfRect,
  stagePointToPdf,
  type CoordinatePoint,
  type PdfPageBox,
  type PdfPageRotation
} from '../../geometry/coordinates'
import { transformSnapshotPoint } from '../../geometry/transforms'
import {
  parseAndValidateKonvaSnapshot,
  type ValidatedKonvaNode,
  type ValidatedKonvaSnapshot
} from '../../renderer/konva/snapshot'
import { normalizeWatermarkSpec, type PdfWatermarkSpec } from '../../domain/watermark'

/** Export behavior used when one annotation cannot be represented safely. */
export type PdfExportStrategy = 'strict' | 'lenient'

/** Non-fatal export issue emitted only by lenient mode. */
export interface PdfExportWarning {
  /** Stable warning category. */
  code: 'ANNOTATION_SKIPPED'
  /** Annotation identifier when it passed domain validation. */
  annotationId?: string
  /** Zero-based target page when known. */
  pageIndex?: number
  /** Safe developer-facing reason without document text. */
  reason: string
}

/** PDF byte export options. */
export interface PdfExportOptions {
  /** Strict mode rejects before mutation; lenient mode skips invalid entries. */
  strategy?: PdfExportStrategy
  /** Receives structured warnings in lenient mode. */
  onWarning?: (warning: PdfExportWarning) => void
  /** Optional presentation watermark composed after annotation dictionaries. */
  watermark?: PdfWatermarkSpec
  /** Custom TrueType/OpenType bytes required for non-WinAnsi watermark text. */
  watermarkFontBytes?: Uint8Array
  /** Selects which watermark target flag applies; defaults to export. */
  watermarkTarget?: 'print' | 'export'
}

/** Internal annotation plus its validated renderer representation. */
interface PreparedAnnotation {
  /** Detached canonical annotation. */
  annotation: Annotation
  /** Single validated renderer snapshot. */
  snapshot: ValidatedKonvaSnapshot
}

const REPLACEABLE_SUBTYPES = new Set([
  'Text', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon', 'PolyLine',
  'Highlight', 'Underline', 'StrikeOut', 'Ink', 'Stamp'
])

/** Builds new PDF bytes containing the supplied canonical annotations. */
export async function buildAnnotatedPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  annotationsInput: readonly Annotation[],
  options: PdfExportOptions = {}
): Promise<Uint8Array> {
  const strategy = options.strategy ?? 'strict'
  let document: PDFDocument
  try {
    document = await PDFDocument.load(pdfBytes)
  } catch (cause) {
    throw exportError('PDF bytes could not be loaded.', undefined, cause)
  }
  const prepared = prepareAnnotations(annotationsInput, document.getPageCount(), strategy, options.onWarning)
  const byPage = new Map<number, PreparedAnnotation[]>()
  for (const item of prepared) {
    const pageItems = byPage.get(item.annotation.pageIndex) ?? []
    pageItems.push(item)
    byPage.set(item.annotation.pageIndex, pageItems)
  }

  for (const [pageIndex, items] of byPage) {
    const page = document.getPage(pageIndex)
    const annots = retainedAnnotationArray(document, page)
    page.node.set(PDFName.of('Annots'), annots)
    for (const item of items) writeAnnotation(document, page, item, annots)
  }

  await writeDocumentWatermark(document, options)

  try {
    return await document.save()
  } catch (cause) {
    throw exportError('PDF bytes could not be serialized.', undefined, cause)
  }
}

/** Builds printable bytes while applying the Watermark print target. */
export async function buildPrintablePdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  annotationsInput: readonly Annotation[],
  options: Omit<PdfExportOptions, 'watermarkTarget'> = {}
): Promise<Uint8Array> {
  return await buildAnnotatedPdf(pdfBytes, annotationsInput, {
    ...options,
    watermarkTarget: 'print'
  })
}

/** Draws one semantic watermark through the PDF backend on every page. */
async function writeDocumentWatermark(
  document: PDFDocument,
  options: PdfExportOptions
): Promise<void> {
  const spec = normalizeWatermarkSpec(options.watermark ?? null)
  if (spec === null) return
  const target = options.watermarkTarget ?? 'export'
  if (!(spec.targets?.[target] ?? (target === 'print'))) return
  let font: PDFFont
  try {
    if (options.watermarkFontBytes === undefined) {
      font = await document.embedFont(StandardFonts.Helvetica)
    } else {
      document.registerFontkit(fontkit)
      font = await document.embedFont(options.watermarkFontBytes, { subset: true })
    }
    const color = parsePdfWatermarkColor(spec.color ?? '#334155')
    for (const page of document.getPages()) drawPdfPageWatermark(page, font, spec, color)
  } catch (cause) {
    throw exportError(
      'PDF watermark could not be embedded; provide compatible font bytes for non-Latin text.',
      undefined,
      cause
    )
  }
}

/** Draws repeated or centered text in PDF user space. */
function drawPdfPageWatermark(
  page: PDFPage,
  font: PDFFont,
  spec: PdfWatermarkSpec,
  color: ReturnType<typeof rgb>
): void {
  const { width, height } = page.getSize()
  const size = spec.fontSize ?? 18
  const angle = spec.rotation ?? -30
  const opacity = spec.opacity ?? 0.12
  const textWidth = font.widthOfTextAtSize(spec.text, size)
  const draw = (centerX: number, centerY: number): void => {
    page.drawText(spec.text, {
      x: centerX - textWidth / 2,
      y: centerY - size / 2,
      size,
      font,
      color,
      opacity,
      rotate: degrees(angle)
    })
  }
  if ((spec.layout ?? 'repeated') === 'center') {
    draw(width / 2, height / 2)
    return
  }
  const stepX = Math.max(textWidth + (spec.horizontalGap ?? 120), 40)
  const stepY = Math.max(size + (spec.verticalGap ?? 90), 40)
  for (let y = -height; y <= height * 2; y += stepY) {
    for (let x = -width; x <= width * 2; x += stepX) draw(x, y)
  }
}

/** Parses a six-digit CSS hex color into pdf-lib RGB values. */
function parsePdfWatermarkColor(value: string): ReturnType<typeof rgb> {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (match === null) throw new Error('PDF watermark color must be six-digit hexadecimal.')
  return rgb(
    Number.parseInt(match[1] ?? '0', 16) / 255,
    Number.parseInt(match[2] ?? '0', 16) / 255,
    Number.parseInt(match[3] ?? '0', 16) / 255
  )
}

/** Validates every export candidate before any PDF dictionary is mutated. */
function prepareAnnotations(
  input: readonly Annotation[],
  pageCount: number,
  strategy: PdfExportStrategy,
  onWarning: PdfExportOptions['onWarning']
): PreparedAnnotation[] {
  const prepared: PreparedAnnotation[] = []
  const ids = new Set<string>()
  for (const candidate of input) {
    try {
      const annotation = parseAnnotation(candidate)
      if (ids.has(annotation.id)) throw new Error('Duplicate annotation identifier.')
      if (annotation.pageIndex >= pageCount) throw new Error('Target page does not exist.')
      const snapshot = parseAndValidateKonvaSnapshot(annotation.rendererState.serialized, {
        annotationId: annotation.id,
        pageIndex: annotation.pageIndex,
        operation: 'buildAnnotatedPdf'
      })
      parseAnnotationColor(primaryAppearanceColor(annotation))
      ids.add(annotation.id)
      prepared.push({ annotation, snapshot })
    } catch (cause) {
      if (strategy === 'strict') throw exportError('PDF annotation preflight failed.', candidate, cause)
      onWarning?.({
        code: 'ANNOTATION_SKIPPED',
        ...(typeof candidate.id === 'string' ? { annotationId: candidate.id } : {}),
        ...(Number.isInteger(candidate.pageIndex) ? { pageIndex: candidate.pageIndex } : {}),
        reason: cause instanceof Error ? cause.message : 'Unknown validation failure.'
      })
    }
  }
  return prepared
}

/** Copies existing unsupported annotations into a new page annotation array. */
function retainedAnnotationArray(document: PDFDocument, page: PDFPage): PDFArray {
  const retained = PDFArray.withContext(document.context)
  const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (existing === undefined) return retained
  for (let index = 0; index < existing.size(); index += 1) {
    const entry = existing.get(index)
    const dictionary = document.context.lookup(entry)
    if (!(dictionary instanceof PDFDict) || !isReplaceableDictionary(dictionary)) retained.push(entry)
  }
  return retained
}

/** Returns whether an existing native dictionary belongs to Core's replaceable set. */
function isReplaceableDictionary(dictionary: PDFDict): boolean {
  const subtype = dictionary.lookupMaybe(PDFName.of('Subtype'), PDFName)
  return subtype !== undefined && REPLACEABLE_SUBTYPES.has(subtype.asString().replace(/^\//, ''))
}

/** Writes one annotation and all of its reply dictionaries. */
function writeAnnotation(
  document: PDFDocument,
  page: PDFPage,
  prepared: PreparedAnnotation,
  annots: PDFArray
): void {
  const { annotation, snapshot } = prepared
  const pageBox = pdfPageBox(page)
  const dictionary = baseDictionary(document, page, annotation, pageBox)
  writeTypeGeometry(document, dictionary, annotation, snapshot, pageBox)
  writeAppearanceGeometry(document, dictionary, annotation)
  const reference = document.context.register(dictionary)
  annots.push(reference)
  for (const comment of annotation.comments) {
    const reply = document.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: pdfNumberArray(document, boundsToPdfRect(annotation.bounds, annotation.coordinateSpace, pageBox)),
      NM: PDFHexString.fromText(comment.id),
      T: PDFHexString.fromText(comment.author?.name ?? comment.title),
      Contents: PDFHexString.fromText(comment.content),
      M: PDFHexString.fromText(toPdfDate(comment.date)),
      IRT: reference,
      RT: 'R',
      P: page.ref,
      F: 4
    })
    annots.push(document.context.register(reply))
  }
}

/** Writes PDF border/fill entries that have direct semantic equivalents. */
function writeAppearanceGeometry(
  document: PDFDocument,
  dictionary: PDFDict,
  annotation: Annotation
): void {
  const stroke = annotation.appearance.stroke
  if (stroke !== null) {
    const borderStyle = document.context.obj({
      W: stroke.width,
      S: stroke.dash.length === 0 ? 'S' : 'D',
      ...(stroke.dash.length === 0 ? {} : { D: [...stroke.dash] })
    })
    dictionary.set(PDFName.of('BS'), borderStyle)
  }
  const fill = annotation.appearance.fill
  if (fill !== null && (annotation.type === 'rectangle' || annotation.type === 'circle'
    || annotation.type === 'polygon' || annotation.type === 'cloud')) {
    dictionary.set(PDFName.of('IC'), pdfNumberArray(document, parseAnnotationColor(fill.color)))
  }
}

/** Creates common PDF annotation dictionary entries. */
function baseDictionary(
  document: PDFDocument,
  page: PDFPage,
  annotation: Annotation,
  pageBox: PdfPageBox
): PDFDict {
  const color = parseAnnotationColor(primaryAppearanceColor(annotation))
  return document.context.obj({
    Type: 'Annot',
    Subtype: subtypeFor(annotation.type),
    Rect: pdfNumberArray(document, boundsToPdfRect(annotation.bounds, annotation.coordinateSpace, pageBox)),
    NM: PDFHexString.fromText(annotation.id),
    T: PDFHexString.fromText(annotation.author.name),
    Contents: PDFHexString.fromText(annotation.content?.text ?? ''),
    M: PDFHexString.fromText(toPdfDate(annotation.updatedAt ?? annotation.createdAt)),
    C: pdfNumberArray(document, color),
    CA: annotation.appearance.opacity * primaryComponentOpacity(annotation),
    F: 4,
    P: page.ref
  })
}

/** Writes subtype-specific geometry and custom round-trip markers. */
function writeTypeGeometry(
  document: PDFDocument,
  dictionary: PDFDict,
  annotation: Annotation,
  snapshot: ValidatedKonvaSnapshot,
  pageBox: PdfPageBox
): void {
  if (annotation.type === 'highlight' || annotation.type === 'underline' || annotation.type === 'strikeout') {
    dictionary.set(PDFName.of('QuadPoints'), pdfNumberArray(document, markupQuadPoints(annotation, snapshot, pageBox)))
  } else if (annotation.type === 'freehand' || annotation.type === 'free-highlight'
    || annotation.type === 'signature' || annotation.type === 'arrow' || annotation.type === 'cloud') {
    dictionary.set(PDFName.of('InkList'), inkList(document, snapshot, annotation, pageBox))
    if (annotation.type === 'arrow' || annotation.type === 'cloud') {
      dictionary.set(PDFName.of('InkLayerType'), PDFName.of(annotation.type === 'arrow' ? 'Arrow' : 'Cloud'))
    }
  } else if (annotation.type === 'line') {
    dictionary.set(PDFName.of('L'), pdfNumberArray(document, firstSnapshotPoints(snapshot, annotation, pageBox).slice(0, 4)))
  } else if (annotation.type === 'polygon' || annotation.type === 'polyline') {
    dictionary.set(PDFName.of('Vertices'), pdfNumberArray(document, firstSnapshotPoints(snapshot, annotation, pageBox)))
  } else if (annotation.type === 'free-text') {
    const color = parseAnnotationColor(annotation.appearance.text?.color ?? '#000000')
    const size = annotation.appearance.text?.fontSize ?? 12
    dictionary.set(PDFName.of('DA'), PDFHexString.fromText(
      `/Helv ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg`
    ))
    dictionary.set(PDFName.of('InkLayerType'), PDFName.of('FreeText'))
    dictionary.set(PDFName.of('InkLayerFontSize'), PDFNumber.of(size))
    dictionary.set(PDFName.of('InkLayerTextWidth'), PDFNumber.of(annotation.bounds.width))
  }
}

/** Selects the semantic paint represented by PDF's common C entry. */
function primaryAppearanceColor(annotation: Annotation): string {
  if (annotation.type === 'highlight' || annotation.type === 'note') {
    return annotation.appearance.fill?.color ?? '#000000'
  }
  if (annotation.type === 'free-text') return annotation.appearance.text?.color ?? '#000000'
  return annotation.appearance.stroke?.color
    ?? annotation.appearance.fill?.color
    ?? annotation.appearance.text?.color
    ?? '#000000'
}

/** Projects component opacity into PDF's single common opacity entry. */
function primaryComponentOpacity(annotation: Annotation): number {
  if (annotation.type === 'highlight' || annotation.type === 'note') {
    return annotation.appearance.fill?.opacity ?? 1
  }
  if (annotation.type === 'free-text') return annotation.appearance.text?.opacity ?? 1
  return annotation.appearance.stroke?.opacity
    ?? annotation.appearance.fill?.opacity
    ?? annotation.appearance.text?.opacity
    ?? 1
}

/** Maps canonical kinds to interoperable PDF annotation subtypes. */
function subtypeFor(type: AnnotationType): string {
  switch (type) {
    case 'highlight': return 'Highlight'
    case 'underline': return 'Underline'
    case 'strikeout': return 'StrikeOut'
    case 'free-text': return 'Text'
    case 'rectangle': return 'Square'
    case 'circle': return 'Circle'
    case 'note': return 'Text'
    case 'line': return 'Line'
    case 'polygon': return 'Polygon'
    case 'polyline': return 'PolyLine'
    case 'stamp': return 'Stamp'
    case 'freehand':
    case 'free-highlight':
    case 'signature':
    case 'arrow':
    case 'cloud': return 'Ink'
  }
}

/** Extracts markup rectangles into PDF QuadPoints order. */
function markupQuadPoints(
  annotation: Annotation,
  snapshot: ValidatedKonvaSnapshot,
  pageBox: PdfPageBox
): number[] {
  const rectangles = snapshot.root.children?.filter((node) => node.className === 'Rect') ?? []
  const nodes = rectangles.length === 0 ? [undefined] : rectangles
  return nodes.flatMap((node) => {
    const bounds = node === undefined ? annotation.bounds : nodeBounds(node, snapshot.root.attrs, annotation.bounds)
    const rect = boundsToPdfRect(bounds, annotation.coordinateSpace, pageBox)
    return [rect[0], rect[3], rect[2], rect[3], rect[0], rect[1], rect[2], rect[1]]
  })
}

/** Creates nested PDF InkList arrays from snapshot line geometry or bounds. */
function inkList(
  document: PDFDocument,
  snapshot: ValidatedKonvaSnapshot,
  annotation: Annotation,
  pageBox: PdfPageBox
): PDFArray {
  const outer = PDFArray.withContext(document.context)
  if (annotation.type === 'freehand') {
    const strokes = snapshot.root.children
      ?.filter((child) => child.className === 'Line')
      .map((child) => snapshotNodePoints(child, snapshot, annotation, pageBox))
      .filter((points) => points.length >= 4) ?? []
    for (const stroke of strokes) outer.push(pdfNumberArray(document, stroke))
    if (strokes.length > 0) return outer
  }
  const points = annotation.type === 'cloud'
    ? cloudSnapshotPoints(snapshot, annotation, pageBox)
    : firstSnapshotPoints(snapshot, annotation, pageBox)
  outer.push(pdfNumberArray(document, points.length >= 4 ? points : boundsPerimeter(annotation, pageBox)))
  return outer
}

/** Samples one verified M/Q/L Cloud path into PDF InkList coordinates. */
function cloudSnapshotPoints(
  snapshot: ValidatedKonvaSnapshot,
  annotation: Annotation,
  pageBox: PdfPageBox
): number[] {
  const node = snapshot.root.children?.find((child) => child.className === 'Path')
  const data = node?.attrs['data']
  if (node === undefined || typeof data !== 'string') return boundsPerimeter(annotation, pageBox)
  const stagePoints = sampleSvgPath(data)
  const output: number[] = []
  for (const point of stagePoints) {
    const transformed = transformSnapshotPoint(point, node.attrs, snapshot.root.attrs)
    const pdfPoint = annotation.coordinateSpace === 'pdf-user-space'
      ? transformed
      : stagePointToPdf(transformed, pageBox)
    output.push(pdfPoint.x, pdfPoint.y)
  }
  return output.length >= 4 ? output : boundsPerimeter(annotation, pageBox)
}

/** Samples the absolute M, L, and Q commands emitted by the Cloud builder. */
function sampleSvgPath(data: string): CoordinatePoint[] {
  const tokens = data.match(/[MLQZ]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const points: CoordinatePoint[] = []
  let index = 0
  let current: CoordinatePoint | undefined
  while (index < tokens.length) {
    const command = tokens[index]
    index += 1
    if (command === 'Z') break
    if (command !== 'M' && command !== 'L' && command !== 'Q') return []
    if (command === 'M' || command === 'L') {
      const point = readPathPoint(tokens, index)
      if (point === undefined) return []
      index += 2
      current = point
      points.push(point)
      continue
    }
    const control = readPathPoint(tokens, index)
    const end = readPathPoint(tokens, index + 2)
    if (current === undefined || control === undefined || end === undefined) return []
    index += 4
    const start = current
    for (const ratio of [0.25, 0.5, 0.75, 1]) {
      const inverse = 1 - ratio
      points.push({
        x: inverse * inverse * start.x + 2 * inverse * ratio * control.x + ratio * ratio * end.x,
        y: inverse * inverse * start.y + 2 * inverse * ratio * control.y + ratio * ratio * end.y
      })
    }
    current = end
  }
  return points
}

/** Reads one finite x/y pair from an SVG token collection. */
function readPathPoint(tokens: readonly string[], index: number): CoordinatePoint | undefined {
  const x = Number(tokens[index])
  const y = Number(tokens[index + 1])
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined
}

/** Extracts the first point-based child and converts it to PDF user space. */
function firstSnapshotPoints(
  snapshot: ValidatedKonvaSnapshot,
  annotation: Annotation,
  pageBox: PdfPageBox
): number[] {
  const node = snapshot.root.children?.find((child) => child.className === 'Line' || child.className === 'Arrow')
  return node === undefined
    ? boundsPerimeter(annotation, pageBox)
    : snapshotNodePoints(node, snapshot, annotation, pageBox)
}

/** Converts one point-based renderer child to PDF coordinates. */
function snapshotNodePoints(
  node: ValidatedKonvaNode,
  snapshot: ValidatedKonvaSnapshot,
  annotation: Annotation,
  pageBox: PdfPageBox
): number[] {
  const values = node.attrs['points']
  if (!Array.isArray(values)) return []
  const output: number[] = []
  for (let index = 0; index + 1 < values.length; index += 2) {
    const x = values[index]
    const y = values[index + 1]
    if (typeof x !== 'number' || typeof y !== 'number') continue
    const transformed = transformSnapshotPoint({ x, y }, node.attrs, snapshot.root.attrs)
    const point = annotation.coordinateSpace === 'pdf-user-space'
      ? transformed
      : stagePointToPdf(transformed, pageBox)
    output.push(point.x, point.y)
  }
  return output
}

/** Converts one renderer rectangle node into transformed Stage bounds. */
function nodeBounds(
  node: ValidatedKonvaNode,
  groupAttrs: ValidatedKonvaSnapshot['root']['attrs'],
  fallback: AnnotationBounds
): AnnotationBounds {
  const width = numericNodeAttr(node, 'width', fallback.width)
  const height = numericNodeAttr(node, 'height', fallback.height)
  const corners = [
    transformSnapshotPoint({ x: 0, y: 0 }, node.attrs, groupAttrs),
    transformSnapshotPoint({ x: width, y: height }, node.attrs, groupAttrs)
  ]
  return {
    x: Math.min(corners[0]?.x ?? fallback.x, corners[1]?.x ?? fallback.x),
    y: Math.min(corners[0]?.y ?? fallback.y, corners[1]?.y ?? fallback.y),
    width: Math.abs((corners[1]?.x ?? fallback.x) - (corners[0]?.x ?? fallback.x)),
    height: Math.abs((corners[1]?.y ?? fallback.y) - (corners[0]?.y ?? fallback.y))
  }
}

/** Reads one finite renderer numeric attribute. */
function numericNodeAttr(node: ValidatedKonvaNode, key: string, fallback: number): number {
  const value = node.attrs[key]
  return typeof value === 'number' ? value : fallback
}

/** Produces a PDF-space rectangle perimeter for fallback Ink geometry. */
function boundsPerimeter(annotation: Annotation, pageBox: PdfPageBox): number[] {
  const rect = boundsToPdfRect(annotation.bounds, annotation.coordinateSpace, pageBox)
  return [rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3], rect[0], rect[1]]
}

/** Converts bounds to a normalized PDF rectangle according to their coordinate space. */
function boundsToPdfRect(
  bounds: AnnotationBounds,
  coordinateSpace: Annotation['coordinateSpace'],
  pageBox: PdfPageBox
): [number, number, number, number] {
  if (coordinateSpace === 'konva-stage') return stageBoundsToPdfRect(bounds, pageBox)
  return [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height]
}

/** Derives a coordinate conversion box from one loaded PDF page. */
function pdfPageBox(page: PDFPage): PdfPageBox {
  const mediaBox = page.getMediaBox()
  const rotation = normalizeRotation(page.getRotation().angle)
  return {
    xMin: mediaBox.x,
    yMin: mediaBox.y,
    xMax: mediaBox.x + mediaBox.width,
    yMax: mediaBox.y + mediaBox.height,
    rotation
  }
}

/** Normalizes any equivalent quarter-turn angle into the supported union. */
function normalizeRotation(angle: number): PdfPageRotation {
  const normalized = ((angle % 360) + 360) % 360
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) return normalized
  throw new RangeError('PDF page rotation must be a quarter turn.')
}

/** Creates a PDF number array without coercing arbitrary objects. */
function pdfNumberArray(document: PDFDocument, values: readonly number[]): PDFArray {
  const array = PDFArray.withContext(document.context)
  for (const value of values) array.push(PDFNumber.of(value))
  return array
}

/** Converts ISO dates to PDF date strings while preserving existing PDF dates. */
function toPdfDate(value: string | null | undefined): string {
  if (value === undefined || value === null || value === '') return ''
  if (value.startsWith('D:')) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const digits = date.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return `D:${digits}Z`
}

/** Creates the single structured PDF export error type. */
function exportError(message: string, annotation: Partial<Annotation> | undefined, cause: unknown): InkLayerError {
  const pageIndex = annotation?.pageIndex
  return new InkLayerError('EXPORT_FAILED', message, {
    operation: 'buildAnnotatedPdf',
    ...(typeof annotation?.id === 'string' ? { annotationId: annotation.id } : {}),
    ...(typeof pageIndex === 'number' && Number.isInteger(pageIndex) ? { pageIndex } : {}),
    cause
  })
}
