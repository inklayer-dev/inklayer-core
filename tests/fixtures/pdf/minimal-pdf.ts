/**
 * @file Deterministic one-page PDF integration fixture.
 * @description Builds a minimal valid PDF with calculated byte offsets so real
 * PDF.js loading can be tested without a generated binary in source control.
 */

/** Creates a minimal one-page PDF with an empty page content stream. */
export function createMinimalPdf(): Uint8Array {
  const encoder = new TextEncoder()
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n'
  ]
  let body = '%PDF-1.7\n'
  const offsets: number[] = []
  for (const object of objects) {
    offsets.push(encoder.encode(body).byteLength)
    body += object
  }
  const xrefOffset = encoder.encode(body).byteLength
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `xref\n0 5\n0000000000 65535 f \n${entries}`
  body += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return encoder.encode(body)
}
