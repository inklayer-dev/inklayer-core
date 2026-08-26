/**
 * @file Native PDF annotation export integration tests.
 * @description Reloads output bytes and inspects low-level dictionaries for
 * subtype, geometry, color, authorship, dates, replies, and retention rules.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  degrees,
  type PDFObject
} from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import type { Annotation, AnnotationType } from '../../../src/domain/annotation'
import { resolveAnnotationAppearance } from '../../../src/domain/appearance'
import { buildAnnotatedPdf, buildPrintablePdf } from '../../../src/export/pdf'
import { buildToolRendererState } from '../../../src/renderer/konva/snapshot-builder'
import { createTestAnnotation } from '../../helpers/annotation'
import { createAnnotationTypeRegistry } from '../../../src/annotation-types/annotation-type-registry'
import { createTestAnnotationTypeDefinition } from '../../helpers/annotation-type'

const TYPES: readonly AnnotationType[] = [
  'highlight', 'strikeout', 'underline', 'free-text', 'rectangle', 'circle',
  'freehand', 'free-highlight', 'signature', 'stamp', 'note', 'line', 'arrow',
  'polygon', 'polyline', 'cloud'
]
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII='

describe('buildAnnotatedPdf', () => {
  it('writes every canonical type, metadata, geometry, replies, and preserves Link', async () => {
    const source = await createSourcePdf()
    const annotations = TYPES.map((type, index) => exportAnnotation(type, index))
    annotations[0]?.comments.push({
      id: 'reply-1', title: 'Reply', content: 'Looks good',
      author: { id: 'bob', name: 'Bob' }, date: '2025-08-11T12:00:00Z'
    })
    const bytes = await buildAnnotatedPdf(source, annotations)
    const document = await PDFDocument.load(bytes)
    const dictionaries = annotationDictionaries(document)
    const subtypes = dictionaries.map((dictionary) => nameValue(dictionary, 'Subtype'))

    expect(dictionaries).toHaveLength(TYPES.length + 2)
    expect(subtypes).toContain('Link')
    expect(subtypes).toContain('Highlight')
    expect(subtypes).toContain('Square')
    expect(subtypes).toContain('Circle')
    expect(subtypes).toContain('Line')
    expect(subtypes).toContain('Polygon')
    expect(subtypes).toContain('PolyLine')
    expect(subtypes).toContain('FreeText')
    expect(subtypes).toContain('Stamp')
    expect(subtypes.filter((subtype) => subtype === 'Text')).toHaveLength(2)
    expect(subtypes.filter((subtype) => subtype === 'Ink')).toHaveLength(5)

    for (const type of TYPES.filter(type => type !== 'note')) {
      const dictionary = dictionaries.find(entry => textValue(entry, 'NM') === `annotation-${type}`)
      expect(dictionary?.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')),
        `${type} should have a normal appearance stream`).toBeDefined()
    }

    const highlight = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-highlight')
    expect(textValue(highlight, 'T')).toBe('Alice · #1')
    expect(textValue(highlight, 'InkLayerAuthorId')).toBe('alice')
    expect(textValue(highlight, 'InkLayerAuthorName')).toBe('Alice')
    expect(numberValue(highlight, 'InkLayerReferenceNumber')).toBe(1)
    expect(textValue(highlight, 'Contents')).toBe('Body highlight')
    expect(textValue(highlight, 'M')).toBe('D:20250810120000Z')
    expect(numberArray(highlight, 'Rect')).toEqual([10, 230, 110, 280])
    expect(numberArray(highlight, 'QuadPoints')).toHaveLength(8)
    expect(numberArray(highlight, 'C')).toEqual([0, 1, 0])

    const reply = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'reply-1')
    expect(nameValue(reply, 'RT')).toBe('R')
    expect(textValue(reply, 'T')).toBe('Bob')
    expect(reply?.get(PDFName.of('IRT'))).toBeDefined()

    const arrow = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-arrow')
    expect(nameValue(arrow, 'InkLayerType')).toBe('Arrow')
    expect(arrow?.lookupMaybe(PDFName.of('InkList'), PDFArray)).toBeDefined()
    const cloud = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-cloud')
    expect(nameValue(cloud, 'InkLayerType')).toBe('Cloud')
    const cloudInk = cloud?.lookupMaybe(PDFName.of('InkList'), PDFArray)?.lookup(0, PDFArray)
    expect(cloudInk?.size()).toBeGreaterThan(10)
    const polygon = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-polygon')
    expect(numberArray(polygon, 'Vertices')).toHaveLength(6)
    expect(polygon?.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')))
      .toBeDefined()
    const note = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-note')
    expect(nameValue(note, 'Name')).toBe('Note')
    expect(note?.lookupMaybe(PDFName.of('AP'), PDFDict)).toBeUndefined()
    const polyline = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-polyline')
    expect(numberArray(polyline, 'Vertices')).toHaveLength(4)
    expect(polyline?.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')))
      .toBeDefined()
    const freehand = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-freehand')
    expect(freehand?.lookupMaybe(PDFName.of('InkList'), PDFArray)?.size()).toBe(2)
    const freeText = dictionaries.find((dictionary) => textValue(dictionary, 'NM') === 'annotation-free-text')
    expect(nameValue(freeText, 'InkLayerType')).toBe('FreeText')
    expect(numberValue(freeText, 'InkLayerFontSize')).toBe(14)
  })

  it('replaces only matching native IDs and preserves unmatched supported dictionaries', async () => {
    const replacement = exportAnnotation('rectangle', 0)
    const source = await createNativeAnnotationSource([
      { id: replacement.id, subtype: 'Square' },
      { id: 'untouched-line', subtype: 'Line' },
      { id: 'untouched-link', subtype: 'Link' }
    ])

    const bytes = await buildAnnotatedPdf(source, [replacement])
    const dictionaries = annotationDictionaries(await PDFDocument.load(bytes))

    expect(dictionaries).toHaveLength(3)
    expect(dictionaries.filter(entry => textValue(entry, 'NM') === replacement.id)).toHaveLength(1)
    expect(dictionaries.some(entry => textValue(entry, 'NM') === 'untouched-line')).toBe(true)
    expect(dictionaries.some(entry => textValue(entry, 'NM') === 'untouched-link')).toBe(true)
  })

  it('allows applications to configure the external PDF annotation title', async () => {
    const annotation = exportAnnotation('rectangle', 0)
    const bytes = await buildAnnotatedPdf(await createSourcePdf(), [annotation], {
      annotationTitle: item => `Review ${item.referenceNumber ?? 'unassigned'}`
    })
    const dictionary = annotationDictionaries(await PDFDocument.load(bytes))
      .find(entry => textValue(entry, 'NM') === annotation.id)
    expect(textValue(dictionary, 'T')).toBe('Review 1')
    expect(textValue(dictionary, 'InkLayerAuthorName')).toBe('Alice')
  })

  it('removes managed native IDs even when every managed annotation was deleted', async () => {
    const source = await createNativeAnnotationSource([
      { id: 'deleted-square', subtype: 'Square' },
      { id: 'untouched-line', subtype: 'Line' }
    ])

    const bytes = await buildAnnotatedPdf(source, [], {
      managedNativeAnnotationIds: ['deleted-square']
    })
    const dictionaries = annotationDictionaries(await PDFDocument.load(bytes))

    expect(dictionaries.map(entry => textValue(entry, 'NM'))).toEqual(['untouched-line'])
  })

  it('keeps the original native dictionary when lenient export skips its invalid replacement', async () => {
    const source = await createNativeAnnotationSource([{ id: 'bad', subtype: 'Square' }])
    const invalid = createTestAnnotation({ id: 'bad', pageIndex: 9 })

    const bytes = await buildAnnotatedPdf(source, [invalid], {
      strategy: 'lenient',
      managedNativeAnnotationIds: ['bad']
    })
    const dictionaries = annotationDictionaries(await PDFDocument.load(bytes))

    expect(dictionaries).toHaveLength(1)
    expect(textValue(dictionaries[0], 'NM')).toBe('bad')
  })

  it('preflights strictly and skips only invalid entries in lenient mode', async () => {
    const source = await createSourcePdf()
    const valid = exportAnnotation('rectangle', 0)
    const invalid = createTestAnnotation({ id: 'bad', pageIndex: 9 })
    await expect(buildAnnotatedPdf(source, [valid, invalid])).rejects.toMatchObject({ code: 'EXPORT_FAILED' })

    const warnings: string[] = []
    const bytes = await buildAnnotatedPdf(source, [valid, invalid], {
      strategy: 'lenient',
      onWarning: (warning) => warnings.push(warning.annotationId ?? '')
    })
    expect(warnings).toEqual(['bad'])
    expect(annotationDictionaries(await PDFDocument.load(bytes))).toHaveLength(2)
  })

  it('reports custom annotations explicitly instead of evaluating unknown renderer state', async () => {
    const source = await createSourcePdf()
    const custom = createTestAnnotation({
      id: 'custom-1',
      type: 'custom:test/export',
      typeData: { schemaVersion: 1, payload: { retained: true } },
      rendererState: { engine: 'konva', schemaVersion: 1, serialized: 'do-not-evaluate' }
    })
    await expect(buildAnnotatedPdf(source, [custom])).rejects.toMatchObject({ code: 'EXPORT_FAILED' })

    const warnings: Array<{ id?: string; reason: string }> = []
    const bytes = await buildAnnotatedPdf(source, [custom], {
      strategy: 'lenient',
      onWarning: (warning) => warnings.push({
        ...(warning.annotationId === undefined ? {} : { id: warning.annotationId }),
        reason: warning.reason
      })
    })
    expect(warnings).toEqual([{
      id: 'custom-1',
      reason: 'Custom annotation PDF export requires a compatible instance Definition.'
    }])
    expect(annotationDictionaries(await PDFDocument.load(bytes))).toHaveLength(1)
  })

  it('exports and prints a compatible custom controlled scene as a PDF appearance stream', async () => {
    const source = await createSourcePdf()
    const registry = createAnnotationTypeRegistry()
    const base = createTestAnnotationTypeDefinition('custom:test/export', {
      supportedSchemaVersions: [1],
      /** Accepts the bounded proof payload. */
      validate() {}
    })
    registry.register({
      ...base,
      capabilities: { ...base.capabilities, printable: true, exportable: true },
      pdf: { exportStrategy: 'appearance-stream' }
    })
    const custom = createTestAnnotation({
      id: 'custom-appearance',
      type: 'custom:test/export',
      typeData: { schemaVersion: 1, payload: { label: 'Length', precision: 2 } },
      rendererState: { engine: 'konva', schemaVersion: 1, serialized: 'ignored-safe-rebuild' }
    })

    for (const bytes of [
      await buildAnnotatedPdf(source, [custom], { annotationTypes: registry }),
      await buildPrintablePdf(source, [custom], { annotationTypes: registry })
    ]) {
      const dictionaries = annotationDictionaries(await PDFDocument.load(bytes))
      const dictionary = dictionaries.find((entry) => textValue(entry, 'NM') === custom.id)
      expect(nameValue(dictionary, 'Subtype')).toBe('Stamp')
      expect(textValue(dictionary, 'InkLayerCanonicalType')).toBe('custom:test/export')
      expect(textValue(dictionary, 'InkLayerTypeData')).toContain('Length')
      expect(dictionary?.lookupMaybe(PDFName.of('AP'), PDFDict)?.get(PDFName.of('N')))
        .toBeDefined()
    }
    registry.destroy()
  })

  it('converts Stage geometry against rotated PDF pages', async () => {
    const document = await PDFDocument.create()
    const page = document.addPage([200, 300])
    page.setRotation(degrees(90))
    const bytes = await buildAnnotatedPdf(await document.save(), [exportAnnotation('rectangle', 0)])
    const rectangle = annotationDictionaries(await PDFDocument.load(bytes))[0]
    expect(numberArray(rectangle, 'Rect')).toEqual([20, 10, 70, 110])
  })

  it('embeds visible normal appearance streams for Stamp and image Signature', async () => {
    const source = await createSourcePdf()
    const stamp = exportAnnotation('stamp', 0)
    const signature = exportAnnotation('signature', 1)
    stamp.content = { text: 'Approved', image: TINY_PNG }
    signature.content = {
      text: 'Alice', signature: { kind: 'image', image: TINY_PNG }
    }
    stamp.rendererState = buildToolRendererState({
      id: stamp.id, type: stamp.type, bounds: stamp.bounds,
      content: stamp.content, appearance: stamp.appearance
    })
    signature.rendererState = buildToolRendererState({
      id: signature.id, type: signature.type, bounds: signature.bounds,
      content: signature.content, appearance: signature.appearance
    })
    const dictionaries = annotationDictionaries(await PDFDocument.load(
      await buildAnnotatedPdf(source, [stamp, signature])
    ))
    for (const id of [stamp.id, signature.id]) {
      const dictionary = dictionaries.find((entry) => textValue(entry, 'NM') === id)
      expect(nameValue(dictionary, 'Subtype')).toBe('Stamp')
      expect(numberValue(dictionary, 'F')).toBe(4 | 128)
      expect(dictionary?.lookupMaybe(PDFName.of('AP'), PDFDict)
        ?.get(PDFName.of('N'))).toBeDefined()
    }
    expect(nameValue(
      dictionaries.find((entry) => textValue(entry, 'NM') === signature.id),
      'InkLayerType'
    )).toBe('SignatureImage')
  })

  it('uses one watermark policy while respecting print and export targeting', async () => {
    const source = await createSourcePdf()
    const watermark = {
      text: 'Alice confidential',
      layout: 'center' as const,
      targets: { viewer: true, print: true, export: false, thumbnails: false }
    }
    const exported = await PDFDocument.load(await buildAnnotatedPdf(source, [], { watermark }))
    expect(exported.getPage(0).node.get(PDFName.of('Contents'))).toBeUndefined()
    const printable = await PDFDocument.load(await buildPrintablePdf(source, [], { watermark }))
    expect(printable.getPage(0).node.get(PDFName.of('Contents'))).toBeDefined()
    const exportWatermarked = await PDFDocument.load(await buildAnnotatedPdf(source, [], {
      watermark: {
        ...watermark,
        targets: { ...watermark.targets, export: true }
      }
    }))
    expect(exportWatermarked.getPage(0).node.get(PDFName.of('Contents'))).toBeDefined()
  })
})

/** Builds source bytes containing one unsupported Link dictionary. */
async function createSourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([200, 300])
  const link = document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10] })
  const annots = PDFArray.withContext(document.context)
  annots.push(document.context.register(link))
  page.node.set(PDFName.of('Annots'), annots)
  return document.save()
}

/** Builds source bytes containing identified native annotation dictionaries. */
async function createNativeAnnotationSource(
  entries: readonly { id: string; subtype: string }[]
): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([200, 300])
  const annots = PDFArray.withContext(document.context)
  for (const entry of entries) {
    const dictionary = document.context.obj({
      Type: 'Annot',
      Subtype: entry.subtype,
      Rect: [0, 0, 10, 10],
      NM: PDFHexString.fromText(entry.id)
    })
    annots.push(document.context.register(dictionary))
  }
  page.node.set(PDFName.of('Annots'), annots)
  return document.save()
}

/** Creates a canonical export fixture with type-appropriate renderer geometry. */
function exportAnnotation(type: AnnotationType, index: number): Annotation & { type: AnnotationType } {
  const id = `annotation-${type}`
  const bounds = { x: 10 + index, y: 20 + index, width: 100, height: 50 }
  const appearance = resolveAnnotationAppearance(type, {
    opacity: 0.5,
    ...(type === 'highlight' || type === 'note' ? { fill: { color: '#00ff00' } }
      : type === 'free-text' ? { text: { color: '#00ff00', fontSize: 14 } }
        : type === 'stamp' ? {}
          : { stroke: { color: '#00ff00', width: 2 } })
  })
  return createTestAnnotation({
    id,
    type,
    referenceNumber: index + 1,
    bounds,
    content: {
      text: `Body ${type}`,
      ...(type === 'stamp' ? { image: TINY_PNG } : {}),
      ...(type.includes('light') ? { selectedText: 'Selected' } : {})
    },
    appearance,
    rendererState: buildToolRendererState({
      id, type, bounds, content: { text: `Body ${type}` }, appearance,
      points: type === 'polygon'
        ? [
            bounds.x, bounds.y,
            bounds.x + bounds.width, bounds.y,
            bounds.x + bounds.width / 2, bounds.y + bounds.height
          ]
        : [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height],
      ...(type === 'freehand' ? {
        strokes: [
          [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height],
          [bounds.x + bounds.width, bounds.y, bounds.x, bounds.y + bounds.height]
        ]
      } : {})
    })
  }) as Annotation & { type: AnnotationType }
}

/** Resolves low-level dictionaries from the first page annotation array. */
function annotationDictionaries(document: PDFDocument): PDFDict[] {
  const annots = document.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
  return annots.asArray().flatMap((entry) => {
    const value = document.context.lookup(entry)
    return value instanceof PDFDict ? [value] : []
  })
}

/** Reads a PDF name without its slash prefix. */
function nameValue(dictionary: PDFDict | undefined, key: string): string | undefined {
  return dictionary?.lookupMaybe(PDFName.of(key), PDFName)?.asString().replace(/^\//, '')
}

/** Reads a Unicode string or hexadecimal string entry. */
function textValue(dictionary: PDFDict | undefined, key: string): string | undefined {
  return dictionary?.lookupMaybe(PDFName.of(key), PDFHexString)?.decodeText()
}

/** Reads one flat PDF numeric array. */
function numberArray(dictionary: PDFDict | undefined, key: string): number[] | undefined {
  const value = dictionary?.lookupMaybe(PDFName.of(key), PDFArray)
  return value?.asArray().flatMap((entry: PDFObject) => entry instanceof PDFNumber ? [entry.asNumber()] : [])
}

/** Reads one PDF numeric dictionary entry. */
function numberValue(dictionary: PDFDict | undefined, key: string): number | undefined {
  return dictionary?.lookupMaybe(PDFName.of(key), PDFNumber)?.asNumber()
}
