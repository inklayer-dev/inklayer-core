/**
 * @file PDF.js native annotation import integration tests.
 * @description Covers every supported subtype, custom Cloud/Arrow markers,
 * replies, malformed isolation, unsupported preservation, and storage mutation.
 */

import { describe, expect, it, vi } from 'vitest'
import { PDFArray, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { hideImportedPdfJsAnnotations } from '../../../src/import/pdfjs/annotation-storage'
import {
  importPdfJsAnnotationsWithMetadata,
  inspectInkLayerPdfMetadata
} from '../../../src/import/pdfjs/metadata'
import { importPdfJsAnnotations } from '../../../src/import/pdfjs/normalize'
import { parseAndValidateKonvaSnapshot } from '../../../src/renderer/konva/snapshot'

const pageBox = { xMin: 0, yMin: 0, xMax: 200, yMax: 300, rotation: 0 as const }

/** Creates one minimal normalized PDF.js annotation. */
function nativeAnnotation(id: string, annotationType: number): Record<string, unknown> {
  return {
    id,
    annotationType,
    rect: [10, 250, 50, 280],
    titleObj: { str: 'Alice' },
    contentsObj: { str: 'Content' },
    color: [255, 0, 0],
    modificationDate: 'D:20250810120000Z'
  }
}

describe('PDF.js native import', () => {
  it('decodes every confirmed standard type and custom marker', () => {
    const inputs = [
      nativeAnnotation('note', 1),
      nativeAnnotation('free-text', 3),
      { ...nativeAnnotation('line', 4), lineCoordinates: [10, 250, 50, 280] },
      nativeAnnotation('rectangle', 5),
      nativeAnnotation('circle', 6),
      { ...nativeAnnotation('polygon', 7), vertices: [{ x: 10, y: 250 }, { x: 50, y: 250 }, { x: 30, y: 280 }] },
      { ...nativeAnnotation('polyline', 8), vertices: [{ x: 10, y: 250 }, { x: 50, y: 280 }] },
      { ...nativeAnnotation('highlight', 9), quadPoints: [10, 280, 50, 280, 10, 250, 50, 250] },
      nativeAnnotation('underline', 10),
      nativeAnnotation('strikeout', 12),
      { ...nativeAnnotation('ink', 15), inkLists: [
        [{ x: 10, y: 250 }, { x: 50, y: 280 }],
        [{ x: 50, y: 250 }, { x: 10, y: 280 }]
      ] },
      { ...nativeAnnotation('arrow', 15), inkLayerType: 'Arrow', inkLists: [[{ x: 10, y: 250 }, { x: 50, y: 280 }]] },
      { ...nativeAnnotation('cloud', 15), inkLayerType: 'Cloud', inkLists: [[
        { x: 10, y: 250 }, { x: 50, y: 250 }, { x: 50, y: 280 }, { x: 10, y: 250 }
      ]] }
    ]
    const result = importPdfJsAnnotations([{ pageIndex: 0, pageBox, annotations: inputs }])
    expect(result.warnings).toEqual([])
    expect(result.annotations.map((annotation) => annotation.type)).toEqual([
      'note', 'free-text', 'line', 'rectangle', 'circle', 'polygon', 'polyline',
      'highlight', 'underline', 'strikeout', 'freehand', 'arrow', 'cloud'
    ])
    for (const annotation of result.annotations) {
      expect(annotation.native).toBe(true)
      expect(annotation.coordinateSpace).toBe('konva-stage')
      expect(() => parseAndValidateKonvaSnapshot(annotation.rendererState.serialized, {
        annotationId: annotation.id
      })).not.toThrow()
    }
    const freehand = result.annotations.find((annotation) => annotation.type === 'freehand')
    if (freehand === undefined) throw new Error('Freehand import fixture was not decoded.')
    const freehandSnapshot = parseAndValidateKonvaSnapshot(
      freehand.rendererState.serialized, { annotationId: freehand.id }
    )
    expect(freehandSnapshot.root.children?.filter((child) => child.className === 'Line')).toHaveLength(2)
  })

  it('attaches replies and isolates malformed and unsupported entries', () => {
    const parent = nativeAnnotation('parent', 5)
    const reply = { ...nativeAnnotation('reply', 16), inReplyTo: 'parent', contentsObj: { str: 'Reply' } }
    const unsupported = nativeAnnotation('link', 2)
    const malformed = { id: 'bad', annotationType: 5, rect: [0, Number.NaN, 1, 1] }
    const result = importPdfJsAnnotations([{
      pageIndex: 0, pageBox, annotations: [parent, reply, unsupported, malformed]
    }])
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]?.comments[0]).toMatchObject({ id: 'reply', content: 'Reply' })
    expect(result.supportedIds).toEqual(['parent', 'reply'])
    expect(result.supportedIds).not.toContain('link')
    expect(result.warnings).toEqual([expect.objectContaining({
      code: 'MALFORMED_ANNOTATION', annotationId: 'bad'
    })])
  })

  it('mutates annotationStorage only for confirmed supported IDs', () => {
    const setValue = vi.fn()
    hideImportedPdfJsAnnotations({ setValue }, ['supported'], new Map([
      ['supported', 0],
      ['unsupported', 0]
    ]))
    expect(setValue).toHaveBeenCalledOnce()
    expect(setValue).toHaveBeenCalledWith('pdfjs_internal_editor_supported', {
      deleted: true, id: 'supported', pageIndex: 0
    })
  })

  it('inspects custom metadata once and isolates inspection failure from standard decoding', async () => {
    const document = await PDFDocument.create()
    const page = document.addPage([200, 300])
    const dictionary = document.context.obj({
      Type: 'Annot', Subtype: 'Ink', Rect: [10, 250, 50, 280],
      NM: PDFHexString.fromText('arrow'), InkLayerType: 'Arrow', CA: 0.5
    })
    const annots = PDFArray.withContext(document.context)
    annots.push(document.context.register(dictionary))
    page.node.set(PDFName.of('Annots'), annots)
    const bytes = await document.save()
    await expect(inspectInkLayerPdfMetadata(bytes)).resolves.toEqual([
      { id: 'arrow', type: 'Arrow', opacity: 0.5 }
    ])

    const arrow = {
      ...nativeAnnotation('arrow', 15),
      inkLists: [[{ x: 10, y: 250 }, { x: 50, y: 280 }]]
    }
    const enriched = await importPdfJsAnnotationsWithMetadata([{
      pageIndex: 0, pageBox, annotations: [arrow]
    }], bytes)
    expect(enriched.annotations[0]).toMatchObject({ type: 'arrow', appearance: { opacity: 0.5 } })
    expect(enriched.warnings).toEqual([])

    const fallback = await importPdfJsAnnotationsWithMetadata([{
      pageIndex: 0, pageBox, annotations: [nativeAnnotation('rectangle', 5)]
    }], new Uint8Array([1, 2, 3]))
    expect(fallback.annotations[0]?.type).toBe('rectangle')
    expect(fallback.warnings).toEqual([expect.objectContaining({ code: 'METADATA_INSPECTION_FAILED' })])
  })
})
