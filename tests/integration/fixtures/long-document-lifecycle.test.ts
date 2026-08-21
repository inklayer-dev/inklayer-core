/**
 * @file CORE-022 real long-document lifecycle integration.
 * @description Verifies deterministic search order, generation cancellation,
 * document replacement, and teardown without machine-specific timing limits.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  createLongDocumentPdf,
  createMixedPagePdf,
  LONG_DOCUMENT_PAGE_COUNT
} from '../../../examples/vanilla/src/sample-pdf'
import { createPdfViewerEngine } from '../../../src/viewer/pdf-viewer-engine'

describe('CORE-022 long-document lifecycle', () => {
  it('searches every real page in order and replaces an in-flight generation safely', async () => {
    const fixture = new Uint8Array(await readFile(
      new URL('../../fixtures/pdf/long-document.pdf', import.meta.url)
    ))
    expect(fixture).toEqual(createLongDocumentPdf())
    const workerPath = resolve(
      import.meta.dirname,
      '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    )
    const engine = createPdfViewerEngine({ workerSrc: pathToFileURL(workerPath).href })

    const first = await engine.load({ data: fixture })
    expect(first.numPages).toBe(LONG_DOCUMENT_PAGE_COUNT)
    const complete = await engine.search('lifecycle stress search token', {
      wholeWord: false,
      maxResults: LONG_DOCUMENT_PAGE_COUNT + 1
    })
    expect(complete.truncated).toBe(false)
    expect(complete.matches).toHaveLength(LONG_DOCUMENT_PAGE_COUNT)
    expect(complete.matches.map((match) => match.pageIndex)).toEqual(
      Array.from({ length: LONG_DOCUMENT_PAGE_COUNT }, (_, pageIndex) => pageIndex)
    )

    const pending = engine.search('page', { maxResults: 10_000 })
    const replacement = await engine.load({ data: createMixedPagePdf() })
    await expect(pending).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED' })
    expect(replacement.numPages).toBe(3)
    expect(engine.getSnapshot()).toMatchObject({ status: 'ready', generation: 2 })

    await engine.destroy()
    expect(engine.getSnapshot()).toMatchObject({ status: 'destroyed', document: null })
  })
})
