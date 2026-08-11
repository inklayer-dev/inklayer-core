/**
 * @file Real PDF.js Viewer loader integration test.
 * @description Opens the deterministic PDF fixture through the installed
 * runtime dependency and verifies document metadata and teardown.
 */

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createPdfViewerEngine } from '../../../src/viewer/pdf-viewer-engine'
import { createMinimalPdf } from '../../fixtures/pdf/minimal-pdf'

describe('real PDF.js loading', () => {
  it('opens and destroys a valid one-page byte document', async () => {
    const workerPath = resolve(
      import.meta.dirname,
      '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    )
    const engine = createPdfViewerEngine({ workerSrc: pathToFileURL(workerPath).href })
    const handle = await engine.load({ data: createMinimalPdf() })
    expect(handle.numPages).toBe(1)
    expect(handle.document).toBeDefined()
    await engine.destroy()
    expect(engine.getSnapshot().status).toBe('destroyed')
  })

  it('retries a real encrypted PDF and never exposes submitted credentials', async () => {
    const workerPath = resolve(
      import.meta.dirname,
      '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    )
    const fixturePath = resolve(import.meta.dirname, '../../fixtures/pdf/pr6531_1.pdf')
    const engine = createPdfViewerEngine({ workerSrc: pathToFileURL(workerPath).href })
    const requests: Array<{ requestId: string; reason: string; attempt: number }> = []
    engine.subscribe((event) => {
      if (event.type !== 'passwordRequired') return
      requests.push({ ...event.request })
      engine.submitPassword(event.request.requestId,
        event.request.reason === 'required' ? 'qwerty' : 'asdfasdf')
    })

    const handle = await engine.load({ data: new Uint8Array(await readFile(fixturePath)) })

    expect(requests).toEqual([
      expect.objectContaining({ reason: 'required', attempt: 1 }),
      expect.objectContaining({ reason: 'incorrect', attempt: 2 })
    ])
    expect(JSON.stringify(requests)).not.toContain('qwerty')
    expect(JSON.stringify(requests)).not.toContain('asdfasdf')
    expect(handle.passwordProtected).toBe(true)
    expect(handle.numPages).toBeGreaterThan(0)
    await engine.destroy()
  })
})
