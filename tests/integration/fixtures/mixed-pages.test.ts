/**
 * @file CORE-021 real mixed-page PDF integration fixture.
 * @description Exercises CropBox coordinates, quarter rotations, native
 * annotations, text extraction, export, and watermarking against one document.
 */

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

import { createMixedPagePdf } from '../../../examples/vanilla/src/sample-pdf'
import { createTestAnnotation } from '../../helpers/annotation'
import { buildAnnotatedPdf, buildPrintablePdf } from '../../../src/export/pdf'
import { importPdfJsAnnotations } from '../../../src/import/pdfjs'
import { buildToolRendererState } from '../../../src/renderer/konva/snapshot-builder'
import { resolveAnnotationAppearance } from '../../../src/domain/appearance'

const EXPECTED_PAGES = [
  { view: [24, 36, 588, 756], rotation: 0, width: 564, height: 720 },
  { view: [20, 30, 620, 430], rotation: 90, width: 400, height: 600 },
  { view: [15, 20, 555, 800], rotation: 270, width: 780, height: 540 }
] as const

describe('CORE-021 mixed-page fixture', () => {
  it('loads real CropBoxes, rotations, mixed viewports, text, and native annotations in PDF.js', async () => {
    const bytes = await loadMixedPageFixture()
    expect(bytes).toEqual(createMixedPagePdf())
    const loadingTask = getDocument({
      data: bytes.slice(),
      standardFontDataUrl: new URL('../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href
    })
    const document = await loadingTask.promise
    expect(document.numPages).toBe(3)

    const inputs = []
    for (const [pageIndex, expected] of EXPECTED_PAGES.entries()) {
      const page = await document.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale: 1 })
      expect(page.view).toEqual(expected.view)
      expect(page.rotate).toBe(expected.rotation)
      expect([viewport.width, viewport.height]).toEqual([expected.width, expected.height])
      const text = (await page.getTextContent()).items
        .flatMap((item) => 'str' in item ? [item.str] : []).join(' ')
      expect(text).toContain('Selection')
      inputs.push({
        pageIndex,
        pageBox: {
          xMin: expected.view[0], yMin: expected.view[1],
          xMax: expected.view[2], yMax: expected.view[3],
          rotation: expected.rotation
        },
        annotations: await page.getAnnotations()
      })
    }

    const imported = importPdfJsAnnotations(inputs)
    expect(imported.warnings).toEqual([])
    expect(imported.annotations).toEqual([
      expect.objectContaining({ type: 'highlight', bounds: { x: 34, y: 72, width: 252, height: 30 } }),
      expect.objectContaining({ type: 'rectangle', bounds: { x: 90, y: 330, width: 90, height: 80 } }),
      expect.objectContaining({ type: 'underline', bounds: { x: 96, y: 225, width: 32, height: 272 } })
    ])
    expect(imported.supportedIds).toHaveLength(3)
    await loadingTask.destroy()
  })

  it('exports Stage geometry through the CropBox and retains all page boxes', async () => {
    const bounds = { x: 90, y: 330, width: 90, height: 80 }
    const appearance = resolveAnnotationAppearance('rectangle')
    const bytes = await buildAnnotatedPdf(await loadMixedPageFixture(), [createTestAnnotation({
      id: 'cropbox-export',
      pageIndex: 1,
      bounds,
      appearance,
      rendererState: buildToolRendererState({
        id: 'cropbox-export', type: 'rectangle', bounds, appearance, content: { text: '' }
      })
    })])
    const document = await PDFDocument.load(bytes)
    expectPageGeometry(document)
    const dictionary = annotationDictionaries(document, 1)
      .find((entry) => entry.lookupMaybe(PDFName.of('NM'), PDFHexString)?.decodeText()
        === 'cropbox-export')
    expect(dictionary).toBeDefined()
    expect(pdfNumbers(dictionary, 'Rect')).toEqual([350, 120, 430, 210])
  })

  it('writes print watermarks without changing CropBoxes, rotation, or native annotations', async () => {
    const document = await PDFDocument.load(await buildPrintablePdf(await loadMixedPageFixture(), [], {
      watermark: { text: 'CORE-021', layout: 'center' }
    }))
    expectPageGeometry(document)
    expect(document.getPages().every((page) => page.node.get(PDFName.of('Contents')) !== undefined))
      .toBe(true)
    expect(document.getPages().map((_, pageIndex) => annotationDictionaries(document, pageIndex).length))
      .toEqual([1, 1, 1])
  })
})

/** Reads the committed bytes that the browser generator must reproduce exactly. */
async function loadMixedPageFixture(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL('../../fixtures/pdf/mixed-pages.pdf', import.meta.url)))
}

/** Confirms the mixed MediaBox/CropBox/Rotate contract survived a rewrite. */
function expectPageGeometry(document: PDFDocument): void {
  const pages = document.getPages()
  expect(pages.map((page) => page.getMediaBox())).toEqual([
    { x: 0, y: 0, width: 612, height: 792 },
    { x: 0, y: 0, width: 700, height: 500 },
    { x: -20, y: -10, width: 595, height: 842 }
  ])
  expect(pages.map((page) => page.getCropBox())).toEqual([
    { x: 24, y: 36, width: 564, height: 720 },
    { x: 20, y: 30, width: 600, height: 400 },
    { x: 15, y: 20, width: 540, height: 780 }
  ])
  expect(pages.map((page) => page.getRotation().angle)).toEqual([0, 90, 270])
}

/** Resolves all annotation dictionaries from one page. */
function annotationDictionaries(document: PDFDocument, pageIndex: number): PDFDict[] {
  const annotations = document.getPage(pageIndex).node.lookup(PDFName.of('Annots'), PDFArray)
  return annotations.asArray().flatMap((entry) => {
    const value = document.context.lookup(entry)
    return value instanceof PDFDict ? [value] : []
  })
}

/** Reads one low-level numeric array. */
function pdfNumbers(dictionary: PDFDict | undefined, key: string): number[] | undefined {
  const value = dictionary?.lookupMaybe(PDFName.of(key), PDFArray)
  return value?.asArray().map((entry) => Number(entry.toString()))
}
