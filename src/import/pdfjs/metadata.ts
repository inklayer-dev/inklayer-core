/**
 * @file Optional low-level InkLayer PDF metadata inspection.
 * @description Loads document bytes once to recover custom Arrow, Cloud, and
 * FreeText markers that PDF.js normalized annotations do not expose directly.
 */

import type { PdfJsAnnotationPageInput, PdfJsImportWarning } from './types'
import type { Annotation, AnnotationAppearance, AnnotationType } from '../../domain/annotation'
import type { User } from '../../domain/user'
import { resolveAnnotationAppearance } from '../../domain/appearance'
import { importPdfJsAnnotations } from './normalize'
import { isValidAnnotationReference, type AnnotationReference } from '../../domain/references'

/** Custom metadata recovered from one native PDF annotation dictionary. */
export interface InkLayerPdfAnnotationMetadata {
  /** Annotation `/NM` identifier or indirect-reference fallback. */
  id: string
  /** PDF.js annotation ID derived from the indirect object reference. */
  pdfjsId?: string
  /** Canonical custom marker type. */
  type?: 'Cloud' | 'FreeText' | 'Arrow' | 'FreeHighlight' | 'SignatureInk' | 'SignatureImage' | 'Stamp'
  /** Exact InkLayer canonical type when written by Core. */
  canonicalType?: AnnotationType
  /** Exact validated appearance when written by Core. */
  appearance?: AnnotationAppearance
  /** Original canonical author retained when `/T` uses a formatted title. */
  author?: User
  /** Stable document-scoped display number. */
  referenceNumber?: number
  /** Stable structured annotation references. */
  references?: AnnotationReference[]
  /** Optional custom FreeText font size. */
  fontSize?: number
  /** Optional custom FreeText layout width. */
  textWidth?: number
  /** Optional annotation opacity. */
  opacity?: number
  /** Original image data retained for exact InkLayer round-trip. */
  image?: string
}

/** Combined resilient metadata inspection and native decoding result. */
export interface ImportPdfJsAnnotationsWithMetadataResult {
  /** Successfully decoded canonical annotations. */
  annotations: Annotation[]
  /** Malformed item and optional metadata inspection warnings. */
  warnings: PdfJsImportWarning[]
  /** PDF.js IDs safe to hide after successful canonical decoding. */
  supportedIds: string[]
  /** Successfully recovered immutable custom metadata records. */
  metadata: readonly InkLayerPdfAnnotationMetadata[]
}

/** Inspects custom dictionary markers from PDF bytes without mutating PDF.js state. */
export async function inspectInkLayerPdfMetadata(
  pdfBytes: Uint8Array | ArrayBuffer
): Promise<readonly InkLayerPdfAnnotationMetadata[]> {
  const { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } =
    await import('pdf-lib')
  const document = await PDFDocument.load(pdfBytes)
  const records: InkLayerPdfAnnotationMetadata[] = []
  for (const page of document.getPages()) {
    const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (annotations === undefined) continue
    for (const reference of annotations.asArray()) {
      const dictionary = document.context.lookup(reference)
      if (!(dictionary instanceof PDFDict)) continue
      const subtype = dictionary.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString().replace(/^\//, '')
      const borderEffect = dictionary.lookupMaybe(PDFName.of('BE'), PDFDict)
      const cloudy = subtype === 'Polygon' && (
        borderEffect?.lookupMaybe(PDFName.of('S'), PDFName)?.asString() === '/C'
        || dictionary.lookupMaybe(PDFName.of('IT'), PDFName)?.asString() === '/PolygonCloud'
      )
      const marker = dictionary.lookupMaybe(PDFName.of('InkLayerType'), PDFName)?.asString().replace(/^\//, '')
      const type = cloudy ? 'Cloud' : validMarker(marker, subtype)
      const canonicalName = dictionary.lookupMaybe(PDFName.of('InkLayerCanonicalType'), PDFName)
        ?.asString().replace(/^\//, '')
      const canonicalType = validCanonicalType(canonicalName)
      const appearanceObject = dictionary.lookupMaybe(
        PDFName.of('InkLayerAppearance'), PDFString, PDFHexString
      )
      const appearance = parseStoredAppearance(appearanceObject?.decodeText(), canonicalType)
      const nameObject = dictionary.get(PDFName.of('NM'))
      const name = nameObject === undefined ? undefined : document.context.lookup(nameObject)
      const pdfjsId = reference instanceof PDFRef ? `${reference.objectNumber}R` : undefined
      const id = name instanceof PDFString || name instanceof PDFHexString
        ? name.decodeText()
        : pdfjsId
      if (id === undefined || id.length === 0) continue
      const fontSize = dictionary.lookupMaybe(PDFName.of('InkLayerFontSize'), PDFNumber)?.asNumber()
      const textWidth = dictionary.lookupMaybe(PDFName.of('InkLayerTextWidth'), PDFNumber)?.asNumber()
      const opacity = dictionary.lookupMaybe(PDFName.of('CA'), PDFNumber)?.asNumber()
      const imageObject = dictionary.lookupMaybe(PDFName.of('InkLayerImage'), PDFString, PDFHexString)
      const image = imageObject?.decodeText()
      const authorId = dictionary.lookupMaybe(
        PDFName.of('InkLayerAuthorId'), PDFString, PDFHexString
      )?.decodeText()
      const authorName = dictionary.lookupMaybe(
        PDFName.of('InkLayerAuthorName'), PDFString, PDFHexString
      )?.decodeText()
      const author = authorId === undefined || authorName === undefined
        ? undefined
        : { id: authorId, name: authorName }
      const storedReferenceNumber = dictionary.lookupMaybe(
        PDFName.of('InkLayerReferenceNumber'), PDFNumber
      )?.asNumber()
      const referenceNumber = Number.isSafeInteger(storedReferenceNumber)
        && (storedReferenceNumber ?? 0) > 0
        ? storedReferenceNumber
        : undefined
      const referencesObject = dictionary.lookupMaybe(
        PDFName.of('InkLayerReferences'), PDFString, PDFHexString
      )
      const references = parseStoredReferences(referencesObject?.decodeText())
      if (type === undefined && canonicalType === undefined && appearance === undefined
        && author === undefined && referenceNumber === undefined && references === undefined) continue
      records.push({
        id,
        ...(pdfjsId === undefined || pdfjsId === id ? {} : { pdfjsId }),
        ...(type === undefined ? {} : { type }),
        ...(canonicalType === undefined ? {} : { canonicalType }),
        ...(appearance === undefined ? {} : { appearance }),
        ...(author === undefined ? {} : { author }),
        ...(referenceNumber === undefined ? {} : { referenceNumber }),
        ...(references === undefined ? {} : { references }),
        ...(fontSize === undefined ? {} : { fontSize }),
        ...(textWidth === undefined ? {} : { textWidth }),
        ...(opacity === undefined ? {} : { opacity }),
        ...(image === undefined ? {} : { image })
      })
    }
  }
  return records
}

/** Parses exporter-owned structured references without trusting PDF metadata. */
function parseStoredReferences(value: string | undefined): AnnotationReference[] | undefined {
  if (value === undefined) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every(isValidAnnotationReference)
      ? parsed.map(reference => ({ ...reference }))
      : undefined
  } catch {
    return undefined
  }
}

const CANONICAL_TYPES = new Set<AnnotationType>([
  'highlight', 'strikeout', 'underline', 'free-text', 'rectangle', 'circle',
  'freehand', 'free-highlight', 'signature', 'stamp', 'note', 'line', 'arrow',
  'polygon', 'polyline', 'cloud'
])

/** Accepts only current V1 canonical names. */
function validCanonicalType(value: string | undefined): AnnotationType | undefined {
  return value !== undefined && CANONICAL_TYPES.has(value as AnnotationType)
    ? value as AnnotationType
    : undefined
}

/** Validates exporter-owned appearance JSON through the domain appearance rules. */
function parseStoredAppearance(
  value: string | undefined,
  type: AnnotationType | undefined
): AnnotationAppearance | undefined {
  if (value === undefined || type === undefined) return undefined
  try {
    return resolveAnnotationAppearance(type, JSON.parse(value) as AnnotationAppearance)
  } catch {
    return undefined
  }
}

/** Decodes pages after optional metadata enrichment and isolates inspection failure. */
export async function importPdfJsAnnotationsWithMetadata(
  pages: readonly PdfJsAnnotationPageInput[],
  pdfBytes: Uint8Array | ArrayBuffer
): Promise<ImportPdfJsAnnotationsWithMetadataResult> {
  if (pages.every((page) => page.annotations.length === 0)) {
    return { ...importPdfJsAnnotations(pages), metadata: [] }
  }
  let metadata: readonly InkLayerPdfAnnotationMetadata[] = []
  let warning: PdfJsImportWarning | undefined
  try {
    metadata = await inspectInkLayerPdfMetadata(pdfBytes)
  } catch (cause) {
    warning = {
      code: 'METADATA_INSPECTION_FAILED',
      message: 'InkLayer PDF annotation metadata could not be inspected; standard decoding continued.',
      cause
    }
  }
  const decoded = importPdfJsAnnotations(enrichPages(pages, metadata))
  return {
    ...decoded,
    warnings: warning === undefined ? decoded.warnings : [warning, ...decoded.warnings],
    metadata
  }
}

/** Accepts only marker/subtype combinations emitted by supported exporters. */
function validMarker(
  marker: string | undefined,
  subtype: string | undefined
): InkLayerPdfAnnotationMetadata['type'] | undefined {
  if (marker === 'Cloud' && (subtype === 'Ink' || subtype === 'Polygon')) return marker
  if (marker === 'Arrow' && subtype === 'Ink') return marker
  if (marker === 'FreeText' && (subtype === 'Text' || subtype === 'FreeText')) return marker
  if (marker === 'FreeHighlight' && subtype === 'Ink') return marker
  if (marker === 'SignatureInk' && subtype === 'Ink') return marker
  if (marker === 'SignatureImage' && subtype === 'Stamp') return marker
  if (marker === 'Stamp' && subtype === 'Stamp') return marker
  return undefined
}

/** Adds recovered custom fields to matching normalized PDF.js annotation objects. */
function enrichPages(
  pages: readonly PdfJsAnnotationPageInput[],
  metadata: readonly InkLayerPdfAnnotationMetadata[]
): PdfJsAnnotationPageInput[] {
  const byId = new Map(metadata.flatMap((record) => [
    [record.id, record] as const,
    ...(record.pdfjsId === undefined ? [] : [[record.pdfjsId, record] as const])
  ]))
  return pages.map((page) => ({
    ...page,
    annotations: page.annotations.map((annotation) => {
      if (!isRecord(annotation) || typeof annotation['id'] !== 'string') return annotation
      const record = byId.get(annotation['id'])
      if (record === undefined) return annotation
      return {
        ...annotation,
        inkLayerType: record.type,
        ...(record.canonicalType === undefined ? {} : { canonicalType: record.canonicalType }),
        ...(record.appearance === undefined ? {} : { appearance: record.appearance }),
        ...(record.author === undefined ? {} : { inkLayerAuthor: record.author }),
        ...(record.referenceNumber === undefined ? {} : { referenceNumber: record.referenceNumber }),
        ...(record.references === undefined ? {} : { references: record.references }),
        ...(record.fontSize === undefined ? {} : { fontSize: record.fontSize }),
        ...(record.opacity === undefined ? {} : { opacity: record.opacity }),
        ...(record.image === undefined ? {} : { image: record.image }),
        ...(record.type === 'Cloud' ? { cloudy: true } : {})
      }
    })
  }))
}

/** Returns whether one untrusted annotation is an object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
