/**
 * @file Central coordinate conversion tests.
 * @description Covers bottom-left/top-left conversion, all quarter rotations,
 * non-zero page boxes, rectangles, and round-trip invariants.
 */

import { describe, expect, it } from 'vitest'
import {
  pdfPointToStage,
  pdfRectToStageBounds,
  stageBoundsToPdfRect,
  stagePointToPdf,
  type PdfPageRotation
} from '../../../src/geometry/coordinates'

describe('PDF and Stage coordinates', () => {
  it.each([0, 90, 180, 270] as PdfPageRotation[])('round-trips points at rotation %i', (rotation) => {
    const page = { xMin: 10, yMin: 20, xMax: 210, yMax: 320, rotation }
    const pdf = { x: 40, y: 80 }
    expect(stagePointToPdf(pdfPointToStage(pdf, page), page)).toEqual(pdf)
  })

  it('converts normalized rectangles in both directions', () => {
    const page = { xMin: 0, yMin: 0, xMax: 200, yMax: 300, rotation: 0 as const }
    const bounds = pdfRectToStageBounds([10, 250, 50, 280], page)
    expect(bounds).toEqual({ x: 10, y: 20, width: 40, height: 30 })
    expect(stageBoundsToPdfRect(bounds, page)).toEqual([10, 250, 50, 280])
  })
})
