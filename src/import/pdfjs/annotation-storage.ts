/**
 * @file Explicit PDF.js annotationStorage mutation boundary.
 * @description Hides only IDs confirmed by successful native decoding and keeps
 * storage changes separate from decoder iteration.
 */

/** Minimal PDF.js annotationStorage surface used by Core. */
export interface PdfJsAnnotationStorage {
  /** Stores one internal editor value. */
  setValue(key: string, value: Readonly<Record<string, unknown>>): void
}

/** Hides successfully imported native annotations in PDF.js rendering. */
export function hideImportedPdfJsAnnotations(
  storage: PdfJsAnnotationStorage,
  supportedIds: readonly string[],
  pageIndexById: ReadonlyMap<string, number>
): void {
  for (const id of new Set(supportedIds)) {
    const pageIndex = pageIndexById.get(id)
    if (pageIndex === undefined) continue
    storage.setValue(`pdfjs_internal_editor_${id}`, { deleted: true, id, pageIndex })
  }
}
