/**
 * @file Controlled annotation scene projection tests.
 * @description Proves unknown renderer state is ignored and external scenes are
 * bounded before becoming validated Konva snapshots.
 */

import { describe, expect, it } from 'vitest'
import {
  buildAnnotationSceneRendererState,
  buildUnavailableAnnotationRendererState
} from '../../../src/renderer/konva/annotation-scene'
import { parseAndValidateKonvaSnapshot } from '../../../src/renderer/konva/snapshot'
import type { InkLayerError } from '../../../src/domain/errors'
import { createTestAnnotation } from '../../helpers/annotation'

describe('controlled annotation scenes', () => {
  it('builds an unavailable placeholder without reading retained renderer JSON', () => {
    const annotation = createTestAnnotation({
      type: 'custom:test/missing',
      rendererState: { engine: 'konva', schemaVersion: 1, serialized: 'not-json-DO-NOT-EVALUATE' }
    })
    const state = buildUnavailableAnnotationRendererState(annotation)
    const parsed = parseAndValidateKonvaSnapshot(state.serialized, { annotationId: annotation.id })
    expect(parsed.nodeCount).toBe(3)
    expect(state.serialized).not.toContain('DO-NOT-EVALUATE')
    expect(state.serialized).toContain('Unsupported annotation')
  })

  it('projects controlled primitives and rejects invalid scene output', () => {
    const annotation = createTestAnnotation({ type: 'custom:test/scene' })
    const state = buildAnnotationSceneRendererState(annotation, {
      children: [{
        kind: 'line', points: [10, 20, 110, 70],
        stroke: { color: '#ff0000', width: 2 }
      }]
    })
    expect(parseAndValidateKonvaSnapshot(state.serialized).root.children?.[0]?.className).toBe('Line')

    expect(() => buildAnnotationSceneRendererState(annotation, {
      children: [{
        kind: 'line', points: [Number.NaN, 0, 1, 1],
        stroke: { color: '#ff0000', width: 2 }
      }]
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })
})
