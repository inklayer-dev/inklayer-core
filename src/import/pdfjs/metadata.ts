/**
 * @file Optional low-level InkLayer PDF metadata inspection.
 * @description Loads document bytes once to recover custom Arrow, Cloud, and
 * FreeText markers that PDF.js normalized annotations do not expose directly.
 */

import type { PdfJsAnnotationPageInput, PdfJsImportWarning } from './types'
import type { Annotation } from '../../domain/annotation'
import { importPdfJsAnnotations } from './normalize'

/** Custom metadata recovered from one native PDF annotation dictionary. */
export interface InkLayerPdfAnnotationMetadata {
  /** Annotation `/NM` identifier or indirect-reference fallback. */
  id: string
  /** Canonical custom marker type. */
  type: 'Cloud' | 'FreeText' | 'Arrow'
  /** Optional custom FreeText font size. */
  fontSize?: number
  /** Optional custom FreeText layout width. */
  textWidth?: number
  /** Optional annotation opacity. */
  opacity?: number
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
      if (type === undefined) continue
      const nameObject = dictionary.get(PDFName.of('NM'))
      const name = nameObject === undefined ? undefined : document.context.lookup(nameObject)
      const id = name instanceof PDFString || name instanceof PDFHexString
        ? name.decodeText()
        : reference instanceof PDFRef ? `${reference.objectNumber}R` : undefined
      if (id === undefined || id.length === 0) continue
      const fontSize = dictionary.lookupMaybe(PDFName.of('InkLayerFontSize'), PDFNumber)?.asNumber()
      const textWidth = dictionary.lookupMaybe(PDFName.of('InkLayerTextWidth'), PDFNumber)?.asNumber()
      const opacity = dictionary.lookupMaybe(PDFName.of('CA'), PDFNumber)?.asNumber()
      records.push({
        id,
        type,
        ...(fontSize === undefined ? {} : { fontSize }),
        ...(textWidth === undefined ? {} : { textWidth }),
        ...(opacity === undefined ? {} : { opacity })
      })
    }
  }
  return records
}

/** Decodes pages after optional metadata enrichment and isolates inspection failure. */
export async function importPdfJsAnnotationsWithMetadata(
  pages: readonly PdfJsAnnotationPageInput[],
  pdfBytes: Uint8Array | ArrayBuffer
): Promise<ImportPdfJsAnnotationsWithMetadataResult> {
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
  return undefined
}

/** Adds recovered custom fields to matching normalized PDF.js annotation objects. */
function enrichPages(
  pages: readonly PdfJsAnnotationPageInput[],
  metadata: readonly InkLayerPdfAnnotationMetadata[]
): PdfJsAnnotationPageInput[] {
  const byId = new Map(metadata.map((record) => [record.id, record]))
  return pages.map((page) => ({
    ...page,
    annotations: page.annotations.map((annotation) => {
      if (!isRecord(annotation) || typeof annotation['id'] !== 'string') return annotation
      const record = byId.get(annotation['id'])
      if (record === undefined) return annotation
      return {
        ...annotation,
        inkLayerType: record.type,
        ...(record.fontSize === undefined ? {} : { fontSize: record.fontSize }),
        ...(record.opacity === undefined ? {} : { opacity: record.opacity }),
        ...(record.type === 'Cloud' ? { cloudy: true } : {})
      }
    })
  }))
}

/** Returns whether one untrusted annotation is an object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
