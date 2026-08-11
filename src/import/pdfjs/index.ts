/**
 * @file Public PDF.js native annotation import entry.
 * @description Exposes normalized decoding and the separate confirmed-ID
 * annotationStorage mutation helper.
 */

export { hideImportedPdfJsAnnotations, type PdfJsAnnotationStorage } from './annotation-storage'
export { importPdfJsAnnotations, type ImportPdfJsAnnotationsResult } from './normalize'
export {
  importPdfJsAnnotationsWithMetadata,
  inspectInkLayerPdfMetadata,
  type ImportPdfJsAnnotationsWithMetadataResult,
  type InkLayerPdfAnnotationMetadata
} from './metadata'
export type {
  PdfJsAnnotationInput,
  PdfJsAnnotationPageInput,
  PdfJsImportWarning,
  PdfJsPoint,
  PdfJsStringValue
} from './types'
