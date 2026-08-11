/**
 * @file Self-contained Vanilla demo PDF fixture.
 * @description Creates a deterministic one-page document at runtime so the
 * browser demo does not depend on a server, framework, or committed binary.
 */

/** Creates a three-page PDF with searchable text and an internal outline. */
export function createSamplePdf(): Uint8Array {
  const encoder = new TextEncoder()
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
  let body = '%PDF-1.7\n'
  const offsets: number[] = []
  for (const object of objects) {
    offsets.push(encoder.encode(body).byteLength)
    body += object
  }
  const xrefOffset = encoder.encode(body).byteLength
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `xref\n0 14\n0000000000 65535 f \n${entries}`
  body += `trailer\n<< /Size 14 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return encoder.encode(body)
}

/** Wraps one ASCII content stream in a numbered PDF object. */
function streamObject(id: number, stream: string): string {
  return `${id} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
}
