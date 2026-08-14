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
})
