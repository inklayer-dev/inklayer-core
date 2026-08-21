/**
 * @file Self-contained Vanilla demo PDF fixtures.
 * @description Creates deterministic documents at runtime so the browser demo
 * does not depend on a framework or opaque remote test data.
 */

/** Creates a three-page PDF with searchable text and an internal outline. */
export function createSamplePdf(): Uint8Array {
  return createPdf(0)
}

/** Creates a valid padded document large enough to exercise HTTP Range loading. */
export function createRangeSamplePdf(): Uint8Array {
  return createPdf(420_000)
}

/** Creates the CORE-021 fixture with rotated CropBoxes, mixed sizes, text, and native annotations. */
export function createMixedPagePdf(): Uint8Array {
  const streams = [
    'BT /F1 20 Tf 60 700 Td (Mixed Fixture Portrait) Tj 0 -36 Td /F1 12 Tf (Selection begins on the portrait page) Tj ET',
    'BT /F1 20 Tf 80 380 Td (Mixed Fixture Rotate 90) Tj 0 -36 Td /F1 12 Tf (Selection continues across the rotated page) Tj ET',
    'BT /F1 20 Tf 60 720 Td (Mixed Fixture Rotate 270) Tj 0 -36 Td /F1 12 Tf (Selection ends on the wide visible page) Tj ET'
  ]
  return assemblePdf([
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [24 36 588 756] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /Annots [10 0 R] >>\nendobj\n',
    streamObject(4, streams[0] ?? ''),
    '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 500] /CropBox [20 30 620 430] /Rotate 90 /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R /Annots [11 0 R] >>\nendobj\n',
    streamObject(6, streams[1] ?? ''),
    '7 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [-20 -10 575 832] /CropBox [15 20 555 800] /Rotate 270 /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R /Annots [12 0 R] >>\nendobj\n',
    streamObject(8, streams[2] ?? ''),
    '9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '10 0 obj\n<< /Type /Annot /Subtype /Highlight /Rect [58 654 310 684] /QuadPoints [58 684 310 684 58 654 310 654] /C [1 0.84 0] /CA 0.45 /NM (mixed-highlight) /T (Fixture) /Contents (Native portrait highlight) /F 4 >>\nendobj\n',
    '11 0 obj\n<< /Type /Annot /Subtype /Square /Rect [350 120 430 210] /C [0.12 0.55 0.95] /BS << /W 4 /S /D /D [8 4] >> /NM (mixed-square) /T (Fixture) /Contents (Native rotated square) /F 4 >>\nendobj\n',
    '12 0 obj\n<< /Type /Annot /Subtype /Underline /Rect [58 672 330 704] /QuadPoints [58 704 330 704 58 672 330 672] /C [0.18 0.72 0.42] /NM (mixed-underline) /T (Fixture) /Contents (Native rotated underline) /F 4 >>\nendobj\n'
  ], 0)
}

/** Page count used by the deterministic CORE-022 lifecycle stress document. */
export const LONG_DOCUMENT_PAGE_COUNT = 96

/** Creates a searchable long document without embedding external assets. */
export function createLongDocumentPdf(): Uint8Array {
  const kids: string[] = []
  const pageObjects: string[] = []
  for (let pageIndex = 0; pageIndex < LONG_DOCUMENT_PAGE_COUNT; pageIndex += 1) {
    const pageId = 4 + pageIndex * 2
    const contentId = pageId + 1
    const pageNumber = pageIndex + 1
    kids.push(`${pageId} 0 R`)
    pageObjects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 560] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      streamObject(contentId,
        `BT /F1 18 Tf 36 500 Td (Long Document Page ${String(pageNumber).padStart(3, '0')}) Tj 0 -34 Td /F1 12 Tf (Lifecycle stress search token on page ${pageNumber} of ${LONG_DOCUMENT_PAGE_COUNT}) Tj ET`)
    )
  }
  return assemblePdf([
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${LONG_DOCUMENT_PAGE_COUNT} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ...pageObjects
  ], 0)
}

/** Builds the shared document with optional pre-xref comment padding. */
function createPdf(minimumBytes: number): Uint8Array {
  const streams = [
    'BT /F1 18 Tf 24 500 Td (InkLayer Core Vanilla) Tj 0 -34 Td /F1 12 Tf (Overview and document navigation) Tj ET',
    'BT /F1 18 Tf 24 500 Td (Viewer Features) Tj 0 -34 Td /F1 12 Tf (Search and outline live in Core) Tj ET',
    'BT /F1 18 Tf 24 500 Td (Text Selection) Tj 0 -34 Td /F1 12 Tf (Select this sentence to create a highlight) Tj ET'
  ]
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Outlines 10 0 R /PageMode /UseOutlines >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 560] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    streamObject(4, streams[0] ?? ''),
    '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 560] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    streamObject(6, streams[1] ?? ''),
    '7 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 560] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>\nendobj\n',
    streamObject(8, streams[2] ?? ''),
    '9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '10 0 obj\n<< /Type /Outlines /First 11 0 R /Last 13 0 R /Count 3 >>\nendobj\n',
    '11 0 obj\n<< /Title (Overview) /Parent 10 0 R /Dest [3 0 R /Fit] /Next 12 0 R >>\nendobj\n',
    '12 0 obj\n<< /Title (Viewer Features) /Parent 10 0 R /Dest [5 0 R /Fit] /Prev 11 0 R /Next 13 0 R >>\nendobj\n',
    '13 0 obj\n<< /Title (Text Selection) /Parent 10 0 R /Dest [7 0 R /Fit] /Prev 12 0 R >>\nendobj\n'
  ]
  return assemblePdf(objects, minimumBytes)
}

/** Serializes sequential indirect objects with exact byte offsets. */
function assemblePdf(objects: readonly string[], minimumBytes: number): Uint8Array {
  const encoder = new TextEncoder()
  let body = '%PDF-1.7\n'
  const offsets: number[] = []
  for (const object of objects) {
    offsets.push(encoder.encode(body).byteLength)
    body += object
  }
  const currentLength = encoder.encode(body).byteLength
  const paddingLength = Math.max(0, minimumBytes - currentLength)
  if (paddingLength > 3) body += `%${'R'.repeat(paddingLength - 2)}\n`
  const xrefOffset = encoder.encode(body).byteLength
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return encoder.encode(body)
}

/** Wraps one ASCII content stream in a numbered PDF object. */
function streamObject(id: number, stream: string): string {
  return `${id} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
}
