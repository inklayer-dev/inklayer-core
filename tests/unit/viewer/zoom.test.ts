/**
 * @file PDF zoom resolver and gesture unit tests.
 * @description Verifies PDF.js-compatible presets, bounded toolbar steps, wheel
 * anchoring, opposing two-touch pinch recognition, and listener teardown.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createPdfZoomGestureController,
  resolvePdfViewerScale,
  stepPdfViewerScale
} from '../../../src/viewer/zoom'

describe('PDF zoom', () => {
  it('resolves every numeric and adaptive PDF.js-compatible scale', () => {
    const portrait = {
      containerWidth: 1000,
      containerHeight: 800,
      pageWidth: 500,
      pageHeight: 1000,
      horizontalPadding: 0,
      verticalPadding: 0
    }
    expect(resolvePdfViewerScale(1.5, portrait)).toBe(1.5)
    expect(resolvePdfViewerScale('page-actual', portrait)).toBe(1)
    expect(resolvePdfViewerScale('page-width', portrait)).toBe(2)
    expect(resolvePdfViewerScale('page-height', portrait)).toBe(0.8)
    expect(resolvePdfViewerScale('page-fit', portrait)).toBe(0.8)
    expect(resolvePdfViewerScale('auto', portrait)).toBe(1.25)
    expect(resolvePdfViewerScale('auto', { ...portrait, pageWidth: 1000, pageHeight: 500 })).toBe(1)
  })

  it('steps numeric scales through configured bounds', () => {
    expect(stepPdfViewerScale(1, 'in')).toBe(1.1)
    expect(stepPdfViewerScale(1, 'out')).toBe(0.9)
    expect(stepPdfViewerScale(4, 'in', 0.1, 0.1, 4)).toBe(4)
    expect(stepPdfViewerScale(0.1, 'out')).toBe(0.1)
  })

  it('anchors Ctrl+wheel and opposing two-touch pinch updates and detaches cleanly', () => {
    let scale = 1
    const setScale = vi.fn((next: number) => { scale = next })
    const container = createGestureContainer()
    const controller = createPdfZoomGestureController({
      container,
      getScale: () => scale,
      setScale
    })

    container.dispatchEvent(gestureEvent('wheel', {
      ctrlKey: true, metaKey: false, deltaY: -20, clientX: 110, clientY: 70
    }))
    expect(scale).toBe(1.22)
    expect(container.scrollLeft).toBeCloseTo(22)
    expect(container.scrollTop).toBeCloseTo(11)

    container.dispatchEvent(gestureEvent('touchstart', {
      touches: touchList(touch(1, 50, 50), touch(2, 150, 50))
    }))
    container.dispatchEvent(gestureEvent('touchmove', {
      touches: touchList(touch(1, 40, 50), touch(2, 160, 50))
    }))
    expect(scale).toBeGreaterThan(1.22)
    container.dispatchEvent(gestureEvent('touchmove', {
      touches: touchList(touch(1, 40, 50), touch(2, 180, 50))
    }))
    expect(setScale).toHaveBeenCalledTimes(3)

    controller.destroy()
    const detachedScale = scale
    container.dispatchEvent(gestureEvent('wheel', {
      ctrlKey: true, metaKey: false, deltaY: -20, clientX: 110, clientY: 70
    }))
    expect(scale).toBe(detachedScale)
  })
})

/** Creates one EventTarget-backed scroll viewport without a browser DOM. */
function createGestureContainer(): HTMLElement {
  const target = new EventTarget() as EventTarget & {
    scrollLeft: number
    scrollTop: number
    getBoundingClientRect(): DOMRect
  }
  target.scrollLeft = 0
  target.scrollTop = 0
  target.getBoundingClientRect = () => ({ left: 10, top: 20 } as DOMRect)
  return target as HTMLElement
}

/** Creates a cancelable synthetic event with a typed read-only payload. */
function gestureEvent(type: string, values: Record<string, unknown>): Event {
  const event = new Event(type, { cancelable: true })
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value })
  }
  return event
}

/** Creates the Touch subset consumed by the Core recognizer. */
function touch(identifier: number, x: number, y: number): Touch {
  return { identifier, pageX: x, pageY: y, clientX: x, clientY: y } as Touch
}

/** Creates one stable two-entry TouchList. */
function touchList(first: Touch, second: Touch): TouchList {
  return {
    0: first,
    1: second,
    length: 2,
    item: (index: number) => [first, second][index] ?? null
  } as unknown as TouchList
}
