/**
 * @file Unified Konva snapshot validator tests.
 * @description Covers the verified fixture plus malformed JSON, roots, IDs,
 * classes, depth, nodes, points, images, dangerous keys, and finite numbers.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { InkLayerError } from '../../../../src/domain/errors'
import { parseAndValidateKonvaSnapshot } from '../../../../src/renderer/konva/snapshot'
import {
  buildToolRendererState,
  restyleToolRendererState
} from '../../../../src/renderer/konva/snapshot-builder'
import { resolveAnnotationAppearance } from '../../../../src/domain/appearance'

/** Reads the maintained rectangle snapshot fixture. */
async function readSnapshotFixture(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../../fixtures/konva/rectangle.json'), 'utf8')
}

describe('Konva snapshot validation', () => {
  it('validates and freezes the verified fixture', async () => {
    const snapshot = parseAndValidateKonvaSnapshot(await readSnapshotFixture(), {
      annotationId: 'annotation-1',
      pageIndex: 0
    })
    expect(snapshot.nodeCount).toBe(2)
    expect(snapshot.root.children?.[0]?.className).toBe('Rect')
    expect(Object.isFrozen(snapshot.root)).toBe(true)
    expect(Object.isFrozen(snapshot.root.children)).toBe(true)
  })

  it.each([
    '',
    '{bad json',
    JSON.stringify({ className: 'Rect', attrs: {} }),
    JSON.stringify({ className: 'Group', attrs: { id: 'wrong' } }),
    JSON.stringify({ className: 'Group', attrs: {}, children: [{ className: 'Stage', attrs: {} }] }),
    JSON.stringify({ className: 'Group', attrs: { x: Number.NaN } }),
    '{"className":"Group","attrs":{"constructor":{"polluted":true}}}'
  ])('rejects unsafe snapshot input with structured context', (serialized) => {
    expect(() => parseAndValidateKonvaSnapshot(serialized, {
      annotationId: 'annotation-1', pageIndex: 3, operation: 'loadAnnotation'
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({
      code: 'KONVA_SNAPSHOT_INVALID',
      annotationId: 'annotation-1',
      pageIndex: 3,
      operation: 'loadAnnotation'
    }))
  })

  it('enforces configured depth, node, point, and data URL limits', () => {
    const nested = JSON.stringify({
      className: 'Group', attrs: {}, children: [{ className: 'Group', attrs: {} }]
    })
    expect(() => parseAndValidateKonvaSnapshot(nested, { maxDepth: 1 }))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'KONVA_SNAPSHOT_INVALID' }))
    expect(() => parseAndValidateKonvaSnapshot(nested, { maxNodes: 1 }))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'KONVA_SNAPSHOT_INVALID' }))
    expect(() => parseAndValidateKonvaSnapshot(JSON.stringify({
      className: 'Group', attrs: {}, children: [{ className: 'Line', attrs: { points: [0, 1, 2] } }]
    }), { maxPoints: 2 })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'KONVA_SNAPSHOT_INVALID' })
    )
    expect(() => parseAndValidateKonvaSnapshot(JSON.stringify({
      className: 'Group', attrs: {}, children: [{ className: 'Image', attrs: { src: 'data:12345' } }]
    }), { maxDataUrlLength: 5 })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'KONVA_SNAPSHOT_INVALID' })
    )
  })

  it('never paints a browser-only border around image Signature or Stamp nodes', () => {
    const image = 'data:image/png;base64,AA=='
    for (const [type, content] of [
      ['signature', { text: 'Signature', signature: { kind: 'image', image } }],
      ['stamp', { text: 'Stamp', image }]
    ] as const) {
      const appearance = resolveAnnotationAppearance(type)
      const state = buildToolRendererState({
        id: type, type, bounds: { x: 1, y: 2, width: 30, height: 20 }, content, appearance
      })
      const restyled = restyleToolRendererState(state, type, appearance)
      for (const rendererState of [state, restyled]) {
        const child = parseAndValidateKonvaSnapshot(rendererState.serialized).root.children?.[0]
        expect(child?.className).toBe('Image')
        expect(child?.attrs['stroke']).toBeUndefined()
        expect(child?.attrs['strokeWidth']).toBeUndefined()
      }
    }
  })

  it('renders Note as a folded document icon and preserves its structure when restyled', () => {
    const initial = resolveAnnotationAppearance('note')
    const state = buildToolRendererState({
      id: 'note', type: 'note', bounds: { x: 10, y: 20, width: 24, height: 24 },
      content: { text: 'Review this section' }, appearance: initial
    })
    const updated = resolveAnnotationAppearance('note', {
      fill: { color: '#84adff' }, text: { color: '#102a56' }
    })
    const restyled = restyleToolRendererState(state, 'note', updated)

    for (const rendererState of [state, restyled]) {
      const children = parseAndValidateKonvaSnapshot(rendererState.serialized).root.children ?? []
      expect(children).toHaveLength(7)
      expect(children.map(child => child.attrs['name'])).toEqual([
        'inklayer-note-paper',
        'inklayer-note-fold',
        'inklayer-note-fold-shadow',
        'inklayer-note-text-line',
        'inklayer-note-text-line',
        'inklayer-note-text-line',
        'inklayer-note-content'
      ])
      const lines = children.filter(child => child.attrs['name'] === 'inklayer-note-text-line')
      expect(lines).toHaveLength(3)
      for (const line of lines) expect(line.attrs['points']).toHaveLength(4)
      expect(children.find(child => child.className === 'Text')?.attrs).toMatchObject({
        text: 'Review this section', visible: false, listening: false
      })
    }
    const paper = parseAndValidateKonvaSnapshot(restyled.serialized).root.children?.[0]
    expect(paper?.attrs['fillLinearGradientColorStops']).toEqual([
      0, 'rgba(132, 173, 255, 1)', 1, 'rgba(255, 255, 255, 1)'
    ])
  })
})
