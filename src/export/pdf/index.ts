/**
 * @file Native PDF annotation dictionary export.
 * @description Writes canonical annotations into existing PDF bytes while
 * preserving unsupported native annotation dictionaries and document content.
 */

import {
  beginText,
  degrees,
  endText,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  rgb,
  StandardFonts,
  appendBezierCurve,
  closePath,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
  type PDFOperator,
  type PDFRef,
  type PDFFont,
  type PDFPage
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import {
  isBuiltInAnnotationType,
  type Annotation,
  type AnnotationBounds,
  type AnnotationType
} from '../../domain/annotation'
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
import type {
  AnnotationTypeDefinition,
  AnnotationTypeRegistry
} from '../../annotation-types/contracts'
import { buildAnnotationSceneRendererState } from '../../renderer/konva/annotation-scene'

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
  /** Instance Registry required to render and export custom annotation types. */
  annotationTypes?: AnnotationTypeRegistry
  /** Formats the title shown by external PDF annotation applications. */
  annotationTitle?: (annotation: Readonly<Annotation>) => string
  /**
   * Native PDF annotation identifiers owned by the caller, including entries
   * deleted since import. Matching replaceable dictionaries are removed before
   * current annotations are written; current annotation and reply IDs are
   * included automatically.
   */
  managedNativeAnnotationIds?: readonly string[]
}

/** Internal annotation plus its validated renderer representation. */
interface PreparedBuiltInAnnotation {
  /** Prepared representation discriminator. */
  kind: 'built-in'
  /** Detached canonical annotation. */
  annotation: Annotation & { type: AnnotationType }
  /** Single validated renderer snapshot. */
  snapshot: ValidatedKonvaSnapshot
}

/** Compatible controlled custom annotation ready for a PDF appearance stream. */
interface PreparedCustomAnnotation {
  /** Prepared representation discriminator. */
  kind: 'custom'
  /** Detached canonical custom annotation. */
  annotation: Annotation
  /** Compatible Definition resolved by the supplied instance Registry. */
  definition: AnnotationTypeDefinition
  /** Core-validated controlled scene snapshot; no Konva object is created. */
  snapshot: ValidatedKonvaSnapshot
}

type PreparedAnnotation = PreparedBuiltInAnnotation | PreparedCustomAnnotation

/** Mutable PDF resources assembled only from validated controlled primitives. */
interface CustomPdfResources {
  /** Per-primitive opacity graphics states. */
  ExtGState: Record<string, PDFDict>
  /** Optional fonts referenced by appearance text nodes. */
  Font?: Record<string, PDFRef>
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
  const prepared = prepareAnnotations(
    annotationsInput,
    document.getPageCount(),
    strategy,
    options.onWarning,
    options.annotationTypes,
    options.watermarkTarget === 'print' ? 'print' : 'export'
  )
  const managedNativeAnnotationIds = resolveManagedNativeAnnotationIds(
    annotationsInput,
    prepared,
    options.managedNativeAnnotationIds
  )
  const byPage = new Map<number, PreparedAnnotation[]>()
  for (const item of prepared) {
    const pageItems = byPage.get(item.annotation.pageIndex) ?? []
    pageItems.push(item)
    byPage.set(item.annotation.pageIndex, pageItems)
  }

  const pageIndexes = managedNativeAnnotationIds.size === 0
    ? [...byPage.keys()]
    : Array.from({ length: document.getPageCount() }, (_, pageIndex) => pageIndex)
  for (const pageIndex of pageIndexes) {
    const page = document.getPage(pageIndex)
    const items = byPage.get(pageIndex) ?? []
    const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (existing === undefined && items.length === 0) continue
    const annots = retainedAnnotationArray(document, page, managedNativeAnnotationIds)
    page.node.set(PDFName.of('Annots'), annots)
    for (const item of items) await writeAnnotation(document, page, item, annots, options)
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
  const { x, y, width, height } = page.getCropBox()
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
    draw(x + width / 2, y + height / 2)
    return
  }
  const stepX = Math.max(textWidth + (spec.horizontalGap ?? 120), 40)
  const stepY = Math.max(size + (spec.verticalGap ?? 90), 40)
  for (let cursorY = y - height; cursorY <= y + height * 2; cursorY += stepY) {
    for (let cursorX = x - width; cursorX <= x + width * 2; cursorX += stepX) {
      draw(cursorX, cursorY)
    }
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
  onWarning: PdfExportOptions['onWarning'],
  annotationTypes: AnnotationTypeRegistry | undefined,
  target: 'print' | 'export'
): PreparedAnnotation[] {
  const prepared: PreparedAnnotation[] = []
  const ids = new Set<string>()
  for (const candidate of input) {
    try {
      const annotation = parseAnnotation(candidate)
      if (ids.has(annotation.id)) throw new Error('Duplicate annotation identifier.')
      if (annotation.pageIndex >= pageCount) throw new Error('Target page does not exist.')
      if (!isBuiltInAnnotationType(annotation.type)) {
        const definition = requireCustomPdfDefinition(annotation, annotationTypes, target)
        const rendererState = buildAnnotationSceneRendererState(
          annotation,
          annotationTypes?.renderControlled(annotation, 'buildAnnotatedPdf') ?? unavailableCustomExport(annotation)
        )
        const snapshot = parseAndValidateKonvaSnapshot(rendererState.serialized, {
          annotationId: annotation.id,
          pageIndex: annotation.pageIndex,
          operation: 'buildAnnotatedPdf'
        })
        validateCustomPdfSnapshot(snapshot)
        ids.add(annotation.id)
        prepared.push({ kind: 'custom', annotation, definition, snapshot })
        continue
      }
      const snapshot = parseAndValidateKonvaSnapshot(annotation.rendererState.serialized, {
        annotationId: annotation.id,
        pageIndex: annotation.pageIndex,
        operation: 'buildAnnotatedPdf'
      })
      parseAnnotationColor(primaryAppearanceColor(annotation))
      ids.add(annotation.id)
      prepared.push({
        kind: 'built-in',
        annotation: annotation as Annotation & { type: AnnotationType },
        snapshot
      })
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

/** Rejects unsupported controlled primitives during preflight before PDF mutation. */
function validateCustomPdfSnapshot(snapshot: ValidatedKonvaSnapshot): void {
  const children = snapshot.root.children ?? []
  if (children.length === 0) throw new Error('Custom annotation scene has no exportable primitives.')
  for (const node of children) {
    if (node.className !== 'Rect' && node.className !== 'Ellipse' && node.className !== 'Line') {
      throw new Error(`Controlled PDF appearance does not support ${node.className} primitives yet.`)
    }
    if (node.attrs['stroke'] === undefined && node.attrs['fill'] === undefined) {
      throw new Error('Controlled PDF primitive has no visible paint.')
    }
  }
}

/** Copies existing annotations except caller-owned dictionaries being reconciled. */
function retainedAnnotationArray(
  document: PDFDocument,
  page: PDFPage,
  managedNativeAnnotationIds: ReadonlySet<string>
): PDFArray {
  const retained = PDFArray.withContext(document.context)
  const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (existing === undefined) return retained
  for (let index = 0; index < existing.size(); index += 1) {
    const entry = existing.get(index)
    const dictionary = document.context.lookup(entry)
    if (!(dictionary instanceof PDFDict)
      || !isReplaceableDictionary(dictionary)
      || !isManagedNativeDictionary(dictionary, managedNativeAnnotationIds)) retained.push(entry)
  }
  return retained
}

/** Returns whether a native dictionary has an owned `/NM` identifier. */
function isManagedNativeDictionary(
  dictionary: PDFDict,
  managedNativeAnnotationIds: ReadonlySet<string>
): boolean {
  const value = dictionary.lookup(PDFName.of('NM'))
  if (!(value instanceof PDFHexString) && !(value instanceof PDFString)) return false
  return managedNativeAnnotationIds.has(value.decodeText())
}

/** Returns whether an existing native dictionary belongs to Core's replaceable set. */
function isReplaceableDictionary(dictionary: PDFDict): boolean {
  const subtype = dictionary.lookupMaybe(PDFName.of('Subtype'), PDFName)
  return subtype !== undefined && REPLACEABLE_SUBTYPES.has(subtype.asString().replace(/^\//, ''))
}

/** Resolves exact native IDs to replace while preserving failed lenient entries. */
function resolveManagedNativeAnnotationIds(
  input: readonly Annotation[],
  prepared: readonly PreparedAnnotation[],
  explicitlyManagedIds: readonly string[] | undefined
): Set<string> {
  const candidateIds = new Set(input.flatMap(candidateOwnedIds))
  const preparedIds = new Set(prepared.flatMap(item => annotationOwnedIds(item.annotation)))
  const failedCandidateIds = new Set(
    [...candidateIds].filter(identifier => !preparedIds.has(identifier))
  )
  const managedIds = new Set(
    (explicitlyManagedIds ?? []).filter(identifier => !failedCandidateIds.has(identifier))
  )
  for (const identifier of preparedIds) managedIds.add(identifier)
  return managedIds
}

/** Reads potentially invalid candidate ownership IDs without trusting its shape. */
function candidateOwnedIds(candidate: Annotation): string[] {
  if (candidate === null || typeof candidate !== 'object') return []
  const value = candidate as Partial<Annotation>
  const identifiers = typeof value.id === 'string' ? [value.id] : []
  if (!Array.isArray(value.comments)) return identifiers
  for (const comment of value.comments) {
    if (comment !== null && typeof comment === 'object' && typeof comment.id === 'string') {
      identifiers.push(comment.id)
    }
  }
  return identifiers
}

/** Returns main and reply IDs owned by one validated canonical annotation. */
function annotationOwnedIds(annotation: Annotation): string[] {
  return [annotation.id, ...annotation.comments.map(comment => comment.id)]
}

/** Writes one annotation and all of its reply dictionaries. */
async function writeAnnotation(
  document: PDFDocument,
  page: PDFPage,
  prepared: PreparedAnnotation,
  annots: PDFArray,
  options: PdfExportOptions
): Promise<void> {
  if (prepared.kind === 'custom') {
    await writeCustomAnnotation(document, page, prepared, annots, options)
    return
  }
  const { annotation, snapshot } = prepared
  const pageBox = pdfPageBox(page)
  const dictionary = baseDictionary(document, page, annotation, pageBox, options)
  writeTypeGeometry(document, dictionary, annotation, snapshot, pageBox)
  writeAppearanceGeometry(document, dictionary, annotation)
  await writeImageAppearance(document, dictionary, annotation, pageBox)
  await writeBuiltInAppearance(document, dictionary, annotation, snapshot, pageBox)
  const reference = document.context.register(dictionary)
  annots.push(reference)
  writeReplyComments(document, page, annotation, reference, annots)
}

/** Writes canonical reply dictionaries shared by native and controlled types. */
function writeReplyComments(
  document: PDFDocument,
  page: PDFPage,
  annotation: Annotation,
  reference: PDFRef,
  annots: PDFArray
): void {
  const pageBox = pdfPageBox(page)
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
      F: 4,
      ...(comment.author === undefined ? {} : {
        InkLayerAuthorId: PDFHexString.fromText(comment.author.id),
        InkLayerAuthorName: PDFHexString.fromText(comment.author.name)
      }),
      ...(comment.references === undefined ? {} : {
        InkLayerReferences: PDFHexString.fromText(JSON.stringify(comment.references))
      })
    })
    annots.push(document.context.register(reply))
  }
}

/** Resolves a compatible enabled controlled PDF appearance policy. */
function requireCustomPdfDefinition(
  annotation: Annotation,
  annotationTypes: AnnotationTypeRegistry | undefined,
  target: 'print' | 'export'
): AnnotationTypeDefinition {
  if (annotationTypes === undefined) unavailableCustomExport(annotation)
  const availability = annotationTypes.validate(annotation)
  if (availability.status !== 'available' || !('render' in availability.definition.renderer)) {
    unavailableCustomExport(annotation)
  }
  const definition = availability.definition
  const enabled = target === 'print'
    ? definition.capabilities.printable
    : definition.capabilities.exportable
  if (!enabled) {
    throw new InkLayerError('ANNOTATION_TYPE_UNAVAILABLE', `Custom annotation is not ${target}able.`, {
      operation: 'buildAnnotatedPdf', annotationId: annotation.id, pageIndex: annotation.pageIndex
    })
  }
  if (definition.pdf?.exportStrategy !== 'appearance-stream') {
    throw new InkLayerError(
      'ANNOTATION_TYPE_UNSUPPORTED',
      'Custom PDF export currently requires the controlled appearance-stream strategy.',
      { operation: 'buildAnnotatedPdf', annotationId: annotation.id, pageIndex: annotation.pageIndex }
    )
  }
  return definition
}

/** Throws the stable missing-strategy error while preserving caller data. */
function unavailableCustomExport(annotation: Annotation): never {
  throw new InkLayerError(
    'ANNOTATION_TYPE_UNAVAILABLE',
    'Custom annotation PDF export requires a compatible instance Definition.',
    { operation: 'buildAnnotatedPdf', annotationId: annotation.id, pageIndex: annotation.pageIndex }
  )
}

/** Writes one controlled scene as a selectable PDF Stamp appearance stream. */
async function writeCustomAnnotation(
  document: PDFDocument,
  page: PDFPage,
  prepared: PreparedCustomAnnotation,
  annots: PDFArray,
  options: PdfExportOptions
): Promise<void> {
  const { annotation, snapshot } = prepared
  const pageBox = pdfPageBox(page)
  const pdfRect = boundsToPdfRect(annotation.bounds, annotation.coordinateSpace, pageBox)
  const width = Math.max(pdfRect[2] - pdfRect[0], 0.01)
  const height = Math.max(pdfRect[3] - pdfRect[1], 0.01)
  const resources: CustomPdfResources = { ExtGState: {} }
  const operators: PDFOperator[] = []
  let graphicsStateIndex = 0

  for (const node of snapshot.root.children ?? []) {
    if (node.className === 'Group') {
      throw new Error('Nested controlled scene groups are not supported by PDF appearance export.')
    }
    const nodeOperators = customNodeOperators(
      node,
      snapshot.root.attrs,
      annotation,
      pageBox,
      pdfRect,
      document,
      resources,
      graphicsStateIndex
    )
    graphicsStateIndex += 1
    operators.push(...nodeOperators)
  }
  if (operators.length === 0) throw new Error('Custom annotation scene has no exportable primitives.')

  const appearance = document.context.formXObject(operators, {
    BBox: document.context.obj([0, 0, width, height]),
    Matrix: document.context.obj([1, 0, 0, 1, 0, 0]),
    Resources: document.context.obj({ ExtGState: resources.ExtGState })
  })
  const appearanceRef = document.context.register(appearance)
  const dictionary = document.context.obj({
    Type: 'Annot',
    Subtype: 'Stamp',
    Rect: pdfNumberArray(document, pdfRect),
    NM: PDFHexString.fromText(annotation.id),
    T: PDFHexString.fromText(pdfAnnotationTitle(annotation, options)),
    Contents: PDFHexString.fromText(annotation.content?.text ?? ''),
    M: PDFHexString.fromText(toPdfDate(annotation.updatedAt ?? annotation.createdAt)),
    InkLayerCanonicalType: PDFHexString.fromText(annotation.type),
    InkLayerTypeData: PDFHexString.fromText(JSON.stringify(annotation.typeData ?? null)),
    InkLayerAppearance: PDFHexString.fromText(JSON.stringify(annotation.appearance)),
    InkLayerAuthorId: PDFHexString.fromText(annotation.author.id),
    InkLayerAuthorName: PDFHexString.fromText(annotation.author.name),
    ...(annotation.referenceNumber === undefined ? {} : {
      InkLayerReferenceNumber: annotation.referenceNumber
    }),
    ...(annotation.content?.references === undefined ? {} : {
      InkLayerReferences: PDFHexString.fromText(JSON.stringify(annotation.content.references))
    }),
    AP: document.context.obj({ N: appearanceRef }),
    F: 4,
    P: page.ref
  })
  const reference = document.context.register(dictionary)
  annots.push(reference)
  writeReplyComments(document, page, annotation, reference, annots)
}

/** Converts one validated controlled primitive to bounded local AP operators. */
function customNodeOperators(
  node: ValidatedKonvaNode,
  rootAttrs: Readonly<Record<string, unknown>>,
  annotation: Annotation,
  pageBox: PdfPageBox,
  annotationRect: readonly [number, number, number, number],
  document: PDFDocument,
  resources: CustomPdfResources,
  graphicsStateIndex: number
): PDFOperator[] {
  if (node.className !== 'Rect' && node.className !== 'Ellipse' && node.className !== 'Line'
    && node.className !== 'Arrow' && node.className !== 'Path') {
    throw new Error(`Controlled PDF appearance does not support ${node.className} primitives yet.`)
  }
  const opacity = numericNodeAttr(node, 'opacity', 1) * annotation.appearance.opacity
  const strokePaint = nodePaint(node, 'stroke')
  const fillPaint = nodePaint(node, 'fill')
  const strokeOpacity = numericNodeAttr(node, 'strokeOpacity', 1) * opacity
    * (strokePaint?.opacity ?? 1)
  const fillOpacity = numericNodeAttr(node, 'fillOpacity', 1) * opacity
    * (fillPaint?.opacity ?? 1)
  const graphicsStateName = `GS${graphicsStateIndex}`
  resources.ExtGState[graphicsStateName] = document.context.obj({
    Type: 'ExtGState', CA: strokeOpacity, ca: fillOpacity
  })
  const operators: PDFOperator[] = [pushGraphicsState(), setGraphicsState(graphicsStateName)]
  if (strokePaint !== undefined) {
    const [red, green, blue] = strokePaint.color
    operators.push(
      setStrokingRgbColor(red, green, blue),
      setLineWidth(numericNodeAttr(node, 'strokeWidth', 1)),
      setDashPattern(numberArrayNodeAttr(node, 'dash'), numericNodeAttr(node, 'dashOffset', 0))
    )
  }
  if (fillPaint !== undefined) {
    const [red, green, blue] = fillPaint.color
    operators.push(setFillingRgbColor(red, green, blue))
  }
  if (node.className === 'Line' || node.className === 'Arrow') {
    const points = numberArrayNodeAttr(node, 'points')
    if (points.length < 4 || points.length % 2 !== 0) throw new Error('Controlled line points are invalid.')
    const localPoints: CoordinatePoint[] = []
    points.forEach((_, index) => {
      if (index % 2 !== 0) return
      const point = localPdfPoint(
        { x: points[index] ?? 0, y: points[index + 1] ?? 0 },
        node.attrs, rootAttrs, annotation, pageBox, annotationRect
      )
      localPoints.push(point)
      operators.push(index === 0 ? moveTo(point.x, point.y) : lineTo(point.x, point.y))
    })
    if (node.attrs['closed'] === true) operators.push(closePath())
    if (node.className === 'Arrow') operators.push(...arrowHeadOperators(
      localPoints,
      numericNodeAttr(node, 'pointerLength', 10),
      numericNodeAttr(node, 'pointerWidth', 10)
    ))
  } else if (node.className === 'Path') {
    const data = stringNodeAttr(node, 'data')
    const points = data === undefined ? [] : sampleSvgPath(data)
    if (points.length < 2) throw new Error('Controlled path data is invalid.')
    points.forEach((point, index) => {
      const local = localPdfPoint(
        point, node.attrs, rootAttrs, annotation, pageBox, annotationRect
      )
      operators.push(index === 0 ? moveTo(local.x, local.y) : lineTo(local.x, local.y))
    })
    if (/\bZ\b/i.test(data ?? '')) operators.push(closePath())
  } else {
    const localBounds = localPdfBounds(node, rootAttrs, annotation, pageBox, annotationRect)
    if (node.className === 'Rect') {
      operators.push(rectangle(localBounds.x, localBounds.y, localBounds.width, localBounds.height))
    } else {
      operators.push(...ellipseOperators(localBounds))
    }
  }
  if (strokePaint !== undefined && fillPaint !== undefined) operators.push(fillAndStroke())
  else if (fillPaint !== undefined) operators.push(fill())
  else if (strokePaint !== undefined) operators.push(stroke())
  else throw new Error('Controlled PDF primitive has no visible paint.')
  operators.push(popGraphicsState())
  return operators
}

/** Builds an outlined arrow head at the final segment endpoint. */
function arrowHeadOperators(
  points: readonly CoordinatePoint[],
  pointerLength: number,
  pointerWidth: number
): PDFOperator[] {
  const end = points.at(-1)
  const previous = points.at(-2)
  if (end === undefined || previous === undefined) return []
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x)
  const baseX = end.x - Math.cos(angle) * pointerLength
  const baseY = end.y - Math.sin(angle) * pointerLength
  const halfWidth = pointerWidth / 2
  const normalX = -Math.sin(angle) * halfWidth
  const normalY = Math.cos(angle) * halfWidth
  return [
    moveTo(baseX + normalX, baseY + normalY),
    lineTo(end.x, end.y),
    lineTo(baseX - normalX, baseY - normalY),
    closePath()
  ]
}

/** Builds an ellipse path using four cubic Bézier segments. */
function ellipseOperators(bounds: AnnotationBounds): PDFOperator[] {
  const factor = 0.552284749831
  const radiusX = bounds.width / 2
  const radiusY = bounds.height / 2
  const centerX = bounds.x + radiusX
  const centerY = bounds.y + radiusY
  return [
    moveTo(centerX + radiusX, centerY),
    appendBezierCurve(centerX + radiusX, centerY + factor * radiusY, centerX + factor * radiusX, centerY + radiusY, centerX, centerY + radiusY),
    appendBezierCurve(centerX - factor * radiusX, centerY + radiusY, centerX - radiusX, centerY + factor * radiusY, centerX - radiusX, centerY),
    appendBezierCurve(centerX - radiusX, centerY - factor * radiusY, centerX - factor * radiusX, centerY - radiusY, centerX, centerY - radiusY),
    appendBezierCurve(centerX + factor * radiusX, centerY - radiusY, centerX + radiusX, centerY - factor * radiusY, centerX + radiusX, centerY),
    closePath()
  ]
}

/** Projects a validated node rectangle into the annotation appearance box. */
function localPdfBounds(
  node: ValidatedKonvaNode,
  rootAttrs: Readonly<Record<string, unknown>>,
  annotation: Annotation,
  pageBox: PdfPageBox,
  annotationRect: readonly [number, number, number, number]
): AnnotationBounds {
  const width = numericNodeAttr(node, node.className === 'Ellipse' ? 'radiusX' : 'width', 0)
    * (node.className === 'Ellipse' ? 2 : 1)
  const height = numericNodeAttr(node, node.className === 'Ellipse' ? 'radiusY' : 'height', 0)
    * (node.className === 'Ellipse' ? 2 : 1)
  const origin = node.className === 'Ellipse'
    ? { x: -width / 2, y: -height / 2 }
    : { x: 0, y: 0 }
  const opposite = { x: origin.x + width, y: origin.y + height }
  const first = localPdfPoint(origin, node.attrs, rootAttrs, annotation, pageBox, annotationRect)
  const second = localPdfPoint(opposite, node.attrs, rootAttrs, annotation, pageBox, annotationRect)
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.abs(second.x - first.x),
    height: Math.abs(second.y - first.y)
  }
}

/** Converts one snapshot point to local PDF appearance coordinates. */
function localPdfPoint(
  point: CoordinatePoint,
  nodeAttrs: Readonly<Record<string, unknown>>,
  rootAttrs: Readonly<Record<string, unknown>>,
  annotation: Annotation,
  pageBox: PdfPageBox,
  annotationRect: readonly [number, number, number, number]
): CoordinatePoint {
  const transformed = transformSnapshotPoint(point, nodeAttrs, rootAttrs)
  const pdfPoint = annotation.coordinateSpace === 'konva-stage'
    ? stagePointToPdf(transformed, pageBox)
    : transformed
  return { x: pdfPoint.x - annotationRect[0], y: pdfPoint.y - annotationRect[1] }
}

/** Reads one optional validated string node attribute. */
function stringNodeAttr(node: ValidatedKonvaNode, key: string): string | undefined {
  const value = node.attrs[key]
  return typeof value === 'string' ? value : undefined
}

/** Parses a validated renderer paint while retaining an rgba() alpha channel. */
function nodePaint(
  node: ValidatedKonvaNode,
  key: 'stroke' | 'fill'
): { color: ReturnType<typeof parseAnnotationColor>; opacity: number } | undefined {
  const value = stringNodeAttr(node, key)
  if (value === undefined || value.trim() === '') return undefined
  const rgba = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/i.exec(value.trim())
  if (rgba === null) return { color: parseAnnotationColor(value), opacity: 1 }
  const red = Number(rgba[1])
  const green = Number(rgba[2])
  const blue = Number(rgba[3])
  const opacity = Number(rgba[4])
  if ([red, green, blue].some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    throw new RangeError('Annotation rgba() channel is invalid.')
  }
  return {
    color: parseAnnotationColor(`rgb(${red}, ${green}, ${blue})`),
    opacity
  }
}

/** Reads one validated finite numeric array node attribute. */
function numberArrayNodeAttr(node: ValidatedKonvaNode, key: string): number[] {
  const value = node.attrs[key]
  return Array.isArray(value) && value.every((part) => typeof part === 'number')
    ? value as number[]
    : []
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
  annotation: Annotation & { type: AnnotationType },
  pageBox: PdfPageBox,
  options: PdfExportOptions
): PDFDict {
  const color = parseAnnotationColor(primaryAppearanceColor(annotation))
  return document.context.obj({
    Type: 'Annot',
    Subtype: subtypeFor(annotation.type),
    Rect: pdfNumberArray(document, boundsToPdfRect(annotation.bounds, annotation.coordinateSpace, pageBox)),
    NM: PDFHexString.fromText(annotation.id),
    T: PDFHexString.fromText(pdfAnnotationTitle(annotation, options)),
    Contents: PDFHexString.fromText(annotation.content?.text ?? ''),
    M: PDFHexString.fromText(toPdfDate(annotation.updatedAt ?? annotation.createdAt)),
    C: pdfNumberArray(document, color),
    CA: annotation.appearance.opacity * primaryComponentOpacity(annotation),
    InkLayerCanonicalType: PDFName.of(annotation.type),
    InkLayerAppearance: PDFHexString.fromText(JSON.stringify(annotation.appearance)),
    InkLayerAuthorId: PDFHexString.fromText(annotation.author.id),
    InkLayerAuthorName: PDFHexString.fromText(annotation.author.name),
    ...(annotation.referenceNumber === undefined ? {} : {
      InkLayerReferenceNumber: annotation.referenceNumber
    }),
    ...(annotation.content?.references === undefined ? {} : {
      InkLayerReferences: PDFHexString.fromText(JSON.stringify(annotation.content.references))
    }),
    ...(annotation.type === 'note' ? { Name: 'Note' } : {}),
    // Match InkLayer React: image-backed Stamp annotations are printable but
    // locked against movement/resizing in conforming PDF viewers.
    F: isLockedImageStamp(annotation) ? 4 | 128 : 4,
    P: page.ref
  })
}

/** Resolves a readable PDF popup title without changing the stable `/NM` identity. */
function pdfAnnotationTitle(annotation: Annotation, options: PdfExportOptions): string {
  const configured = options.annotationTitle?.(structuredClone(annotation))
  if (configured !== undefined) {
    if (typeof configured !== 'string' || configured.trim() === '') {
      throw new TypeError('annotationTitle must return a non-empty string.')
    }
    return configured
  }
  return annotation.referenceNumber === undefined
    ? annotation.author.name
    : `${annotation.author.name} · #${annotation.referenceNumber}`
}

/** Narrows annotations exported as immutable image-backed PDF Stamps. */
function isLockedImageStamp(annotation: Annotation): boolean {
  return annotation.type === 'stamp'
    || (annotation.type === 'signature' && annotation.content?.signature?.kind === 'image')
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
    || isInkSignature(annotation) || annotation.type === 'arrow' || annotation.type === 'cloud') {
    dictionary.set(PDFName.of('InkList'), inkList(document, snapshot, annotation, pageBox))
    if (annotation.type === 'signature') {
      dictionary.set(PDFName.of('InkLayerType'), PDFName.of('SignatureInk'))
    } else if (annotation.type === 'free-highlight') {
      dictionary.set(PDFName.of('InkLayerType'), PDFName.of('FreeHighlight'))
    } else if (annotation.type === 'arrow' || annotation.type === 'cloud') {
      dictionary.set(PDFName.of('InkLayerType'), PDFName.of(annotation.type === 'arrow' ? 'Arrow' : 'Cloud'))
    }
  } else if (annotation.type === 'line') {
    dictionary.set(PDFName.of('L'), pdfNumberArray(document, firstSnapshotPoints(snapshot, annotation, pageBox).slice(0, 4)))
  } else if (annotation.type === 'polygon' || annotation.type === 'polyline') {
    const vertices = firstSnapshotPoints(snapshot, annotation, pageBox)
    dictionary.set(PDFName.of('Vertices'), pdfNumberArray(
      document,
      annotation.type === 'polygon' ? removeClosingPoint(vertices) : vertices
    ))
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

/** Embeds an image-backed Stamp/Signature and attaches a visible normal AP stream. */
async function writeImageAppearance(
  document: PDFDocument,
  dictionary: PDFDict,
  annotation: Annotation,
  pageBox: PdfPageBox
): Promise<void> {
  const source = imageSource(annotation)
  if (source === undefined) return
  if (annotation.type === 'signature') dictionary.set(PDFName.of('Subtype'), PDFName.of('Stamp'))
  let bytes: Uint8Array
  let mime: 'image/png' | 'image/jpeg'
  try {
    ({ bytes, mime } = decodeImageSource(source))
  } catch (cause) {
    throw exportError('Image annotation content is not an embedded PNG or JPEG data URL.', annotation, cause)
  }
  const image = mime === 'image/png'
    ? await document.embedPng(bytes)
    : await document.embedJpg(bytes)
  const rect = boundsToPdfRect(annotation.bounds, annotation.coordinateSpace, pageBox)
  const width = Math.max(Math.abs(rect[2] - rect[0]), 0.01)
  const height = Math.max(Math.abs(rect[3] - rect[1]), 0.01)
  const opacity = annotation.appearance.opacity
  const resources = document.context.obj({
    XObject: { Im0: image.ref },
    ExtGState: { GS0: { Type: 'ExtGState', CA: opacity, ca: opacity } }
  })
  const appearance = document.context.flateStream(
    `q /GS0 gs ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`,
    {
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: [0, 0, width, height],
      Resources: resources
    }
  )
  const reference = document.context.register(appearance)
  dictionary.set(PDFName.of('AP'), document.context.obj({ N: reference }))
  dictionary.set(PDFName.of('InkLayerType'), PDFName.of(
    annotation.type === 'signature' ? 'SignatureImage' : 'Stamp'
  ))
  dictionary.set(PDFName.of('InkLayerImage'), PDFHexString.fromText(source))
}

/** Attaches a normal appearance stream so every built-in type renders consistently. */
async function writeBuiltInAppearance(
  document: PDFDocument,
  dictionary: PDFDict,
  annotation: Annotation,
  snapshot: ValidatedKonvaSnapshot,
  pageBox: PdfPageBox
): Promise<void> {
  if (annotation.type === 'note') return
  if (dictionary.lookupMaybe(PDFName.of('AP'), PDFDict) !== undefined) return
  const rect = boundsToPdfRect(annotation.bounds, annotation.coordinateSpace, pageBox)
  const width = Math.max(Math.abs(rect[2] - rect[0]), 0.01)
  const height = Math.max(Math.abs(rect[3] - rect[1]), 0.01)
  const resources: CustomPdfResources = { ExtGState: {} }
  const operators: PDFOperator[] = []
  let graphicsStateIndex = 0
  let font: PDFFont | undefined

  for (const node of snapshot.root.children ?? []) {
    if (node.attrs['visible'] === false || node.className === 'Image') continue
    if (node.className === 'Text') {
      if (annotation.type !== 'free-text') continue
      font ??= await document.embedFont(StandardFonts.Helvetica)
      resources.Font = { F0: font.ref }
      operators.push(...builtInTextOperators(
        node, snapshot.root.attrs, annotation, pageBox, rect,
        document, resources, graphicsStateIndex, font
      ))
      graphicsStateIndex += 1
      continue
    }
    if (node.className !== 'Rect' && node.className !== 'Ellipse'
      && node.className !== 'Line' && node.className !== 'Arrow'
      && node.className !== 'Path') continue
    if (node.attrs['stroke'] === undefined && node.attrs['fill'] === undefined) continue
    operators.push(...customNodeOperators(
      node, snapshot.root.attrs, annotation, pageBox, rect,
      document, resources, graphicsStateIndex
    ))
    graphicsStateIndex += 1
  }
  if (operators.length === 0) return

  const appearance = document.context.formXObject(operators, {
    BBox: document.context.obj([0, 0, width, height]),
    Matrix: document.context.obj([1, 0, 0, 1, 0, 0]),
    Resources: document.context.obj({
      ExtGState: resources.ExtGState,
      ...(resources.Font === undefined ? {} : { Font: resources.Font })
    })
  })
  const reference = document.context.register(appearance)
  dictionary.set(PDFName.of('AP'), document.context.obj({ N: reference }))
}

/** Converts a visible FreeText renderer node to PDF text operators. */
function builtInTextOperators(
  node: ValidatedKonvaNode,
  rootAttrs: Readonly<Record<string, unknown>>,
  annotation: Annotation,
  pageBox: PdfPageBox,
  annotationRect: readonly [number, number, number, number],
  document: PDFDocument,
  resources: CustomPdfResources,
  graphicsStateIndex: number,
  font: PDFFont
): PDFOperator[] {
  const paint = nodePaint(node, 'fill')
  const text = stringNodeAttr(node, 'text') ?? annotation.content?.text ?? ''
  if (paint === undefined || text.length === 0) return []
  const graphicsStateName = `GS${graphicsStateIndex}`
  resources.ExtGState[graphicsStateName] = document.context.obj({
    Type: 'ExtGState',
    CA: 1,
    ca: annotation.appearance.opacity * numericNodeAttr(node, 'opacity', 1) * paint.opacity
  })
  const [red, green, blue] = paint.color
  const size = numericNodeAttr(node, 'fontSize', annotation.appearance.text?.fontSize ?? 12)
  const bounds = localPdfBounds(node, rootAttrs, annotation, pageBox, annotationRect)
  const encoded = font.encodeText(text.replace(/\r?\n/g, ' '))
  return [
    pushGraphicsState(),
    setGraphicsState(graphicsStateName),
    setFillingRgbColor(red, green, blue),
    beginText(),
    setFontAndSize('F0', size),
    setTextMatrix(1, 0, 0, 1, bounds.x, bounds.y + Math.max(0, bounds.height - size)),
    showText(encoded),
    endText(),
    popGraphicsState()
  ]
}

/** Returns the image payload owned by an image-backed canonical type. */
function imageSource(annotation: Annotation): string | undefined {
  if (annotation.type === 'stamp') return annotation.content?.image
  if (annotation.type === 'signature' && annotation.content?.signature?.kind === 'image') {
    return annotation.content.signature.image
  }
  return undefined
}

/** Decodes a browser-compatible PNG/JPEG data URL without Node-only APIs. */
function decodeImageSource(source: string): { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(source)
  if (match === null) throw new Error('Unsupported image URL.')
  const binary = globalThis.atob((match[2] ?? '').replace(/\s/g, ''))
  return {
    mime: match[1] as 'image/png' | 'image/jpeg',
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0))
  }
}

/** Returns whether Signature uses PDF Ink geometry instead of an image AP. */
function isInkSignature(annotation: Annotation): boolean {
  return annotation.type === 'signature' && annotation.content?.signature?.kind !== 'image'
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
    case 'free-text': return 'FreeText'
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

/** Removes the renderer's explicit closing vertex from native PDF Polygon data. */
function removeClosingPoint(points: readonly number[]): number[] {
  if (points.length < 8) return [...points]
  return points[0] === points.at(-2) && points[1] === points.at(-1)
    ? points.slice(0, -2)
    : [...points]
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
  const cropBox = page.getCropBox()
  const rotation = normalizeRotation(page.getRotation().angle)
  return {
    xMin: cropBox.x,
    yMin: cropBox.y,
    xMax: cropBox.x + cropBox.width,
    yMax: cropBox.y + cropBox.height,
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
