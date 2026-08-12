/**
 * @file Canonical V1 annotation appearance policy tests.
 * @description Locks defaults, deep partial semantics, explicit component
 * disabling, capability rejection, and detached values.
 */

import { describe, expect, it } from 'vitest'
import {
  getDefaultAnnotationAppearance,
  mergeAnnotationAppearance,
  resolveAnnotationAppearance
} from '../../../src/domain/appearance'

describe('annotation appearance', () => {
  it('uses semantic defaults rather than Konva attributes', () => {
    expect(getDefaultAnnotationAppearance('highlight')).toEqual({
      opacity: 1,
      stroke: null,
      fill: { color: '#b4fa56', opacity: 0.5 },
      text: null
    })
    expect(getDefaultAnnotationAppearance('underline').stroke).toMatchObject({
      color: '#1272e8', width: 2, dash: []
    })
  })

  it('deeply merges, enables, and explicitly disables supported components', () => {
    const rectangle = resolveAnnotationAppearance('rectangle', {
      stroke: { color: '#123456', dash: [4, 2] },
      fill: { color: '#abcdef', opacity: 0.25 }
    })
    expect(rectangle.stroke).toMatchObject({ color: '#123456', width: 2, dash: [4, 2] })
    expect(rectangle.fill).toEqual({ color: '#abcdef', opacity: 0.25 })
    expect(mergeAnnotationAppearance('rectangle', rectangle, { fill: null }).fill).toBeNull()
  })

  it('rejects unsupported controls and invalid values', () => {
    expect(() => resolveAnnotationAppearance('highlight', { stroke: { color: '#000000' } }))
      .toThrow(RangeError)
    expect(() => resolveAnnotationAppearance('strikeout', { stroke: { dash: [2, 2] } }))
      .toThrow(RangeError)
    expect(() => resolveAnnotationAppearance('rectangle', { opacity: 2 }))
      .toThrow(RangeError)
  })
})
