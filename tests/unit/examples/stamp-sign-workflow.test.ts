/**
 * @file Stamp & Sign product-workflow unit tests.
 * @description Verifies page expressions and proportional placement independently of DOM rendering.
 */

import { describe, expect, it } from 'vitest'
import {
  parseStampSignPages,
  resolveStampSignBounds
} from '../../../examples/vanilla/src/stamp-sign-workflow'

describe('Stamp & Sign workflow helpers', () => {
  it('parses presets, ranges, lists, and duplicate pages in document order', () => {
    expect(parseStampSignPages('all', 5, 2)).toEqual([0, 1, 2, 3, 4])
    expect(parseStampSignPages('current', 5, 2)).toEqual([2])
    expect(parseStampSignPages('odd', 5, 2)).toEqual([0, 2, 4])
    expect(parseStampSignPages('even', 5, 2)).toEqual([1, 3])
    expect(parseStampSignPages('3-5, 1, 3', 5, 2)).toEqual([0, 2, 3, 4])
  })

  it('rejects reversed, malformed, and out-of-document page ranges', () => {
    expect(() => parseStampSignPages('4-2', 5, 0)).toThrow(/low to high/u)
    expect(() => parseStampSignPages('first', 5, 0)).toThrow(/invalid/u)
    expect(() => parseStampSignPages('1-6', 5, 0)).toThrow(/outside 1-5/u)
  })

  it('fits the asset ratio inside mixed pages and anchors it by position', () => {
    const bottomRight = resolveStampSignBounds(
      { width: 600, height: 800 },
      { width: 140, height: 60 },
      140,
      24,
      'bottom-right'
    )
    expect(bottomRight.x).toBeCloseTo(436)
    expect(bottomRight.y).toBeCloseTo(716)
    expect(bottomRight.width).toBeCloseTo(140)
    expect(bottomRight.height).toBeCloseTo(60)

    const centered = resolveStampSignBounds(
      { width: 100, height: 60 },
      { width: 2, height: 1 },
      200,
      10,
      'center'
    )
    expect(centered).toEqual({ x: 10, y: 10, width: 80, height: 40 })
  })
})
