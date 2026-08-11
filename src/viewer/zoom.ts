/**
 * @file Framework-neutral PDF zoom calculation and gesture ownership.
 * @description Resolves PDF.js-compatible presets and maps wheel/touch pinch
 * gestures to bounded, anchor-preserving numeric scale updates.
 */

import type { PdfViewerScale, PdfZoomAnchor } from './types'

/** Geometry required to resolve one adaptive PDF zoom preset. */
export interface PdfZoomMetrics {
  /** Available scroll viewport width in CSS pixels. */
  containerWidth: number
  /** Available scroll viewport height in CSS pixels. */
  containerHeight: number
  /** Current page width at scale one. */
  pageWidth: number
  /** Current page height at scale one. */
  pageHeight: number
  /** Horizontal chrome/border allowance; defaults to PDF.js's 40px. */
  horizontalPadding?: number
  /** Vertical chrome/border allowance; defaults to PDF.js's 5px. */
  verticalPadding?: number
  /** Number of pages occupying one horizontal spread; defaults to one. */
  spreadCount?: 1 | 2
}

/** Construction options for one container-owned pinch/wheel recognizer. */
export interface PdfZoomGestureOptions {
  /** Scroll viewport receiving touch and Ctrl/Meta+wheel input. */
  container: HTMLElement
  /** Returns the live resolved PDF scale. */
  getScale(): number
  /** Applies one bounded numeric scale synchronously. */
  setScale(scale: number, anchor: PdfZoomAnchor): void
  /** Minimum permitted numeric scale; defaults to 0.1. */
  minScale?: number
  /** Maximum permitted numeric scale; defaults to 10. */
  maxScale?: number
}

/** Disposable gesture recognizer owned by one Viewer surface. */
export interface PdfZoomGestureController {
  /** Removes every container/window listener idempotently. */
  destroy(): void
}

interface TouchPoint {
  identifier: number
  pageX: number
  pageY: number
  clientX: number
  clientY: number
}

interface TouchInfo {
  first: TouchPoint
  second: TouchPoint
}

/** Resolves numeric and PDF.js-compatible adaptive zoom values. */
export function resolvePdfViewerScale(value: PdfViewerScale, metrics: PdfZoomMetrics): number {
  if (typeof value === 'number') return validateScale(value)
  const pageWidth = positiveMetric(metrics.pageWidth, 'page width')
  const pageHeight = positiveMetric(metrics.pageHeight, 'page height')
  const containerWidth = positiveMetric(metrics.containerWidth, 'container width')
  const containerHeight = positiveMetric(metrics.containerHeight, 'container height')
  const horizontalPadding = metrics.horizontalPadding ?? 40
  const verticalPadding = metrics.verticalPadding ?? 5
  const spreadCount = metrics.spreadCount ?? 1
  const widthScale = Math.max(containerWidth - horizontalPadding, 1) / pageWidth / spreadCount
  const heightScale = Math.max(containerHeight - verticalPadding, 1) / pageHeight
  switch (value) {
    case 'page-actual': return 1
    case 'page-width': return widthScale
    case 'page-height': return heightScale
    case 'page-fit': return Math.min(widthScale, heightScale)
    case 'auto': {
      const horizontalScale = pageWidth <= pageHeight ? widthScale : Math.min(widthScale, heightScale)
      return Math.min(1.25, horizontalScale)
    }
  }
}

/** Returns one bounded additive toolbar zoom step. */
export function stepPdfViewerScale(
  scale: number,
  direction: 'in' | 'out',
  step = 0.1,
  minScale = 0.1,
  maxScale = 10
): number {
  validateZoomLimits(minScale, maxScale, step)
  const next = scale + (direction === 'in' ? step : -step)
  return roundScale(Math.min(maxScale, Math.max(minScale, next)))
}

/** Creates one immediate, interruptible pinch and Ctrl/Meta+wheel recognizer. */
export function createPdfZoomGestureController(
  options: PdfZoomGestureOptions
): PdfZoomGestureController {
  const minScale = options.minScale ?? 0.1
  const maxScale = options.maxScale ?? 10
  validateZoomLimits(minScale, maxScale, 0.1)
  const container = options.container
  let destroyed = false
  let wheelUnusedFactor = 1
  let touchUnusedFactor = 1
  let touchInfo: TouchInfo | null = null

  const applyZoom = (factor: number, anchor: PdfZoomAnchor, touch: boolean): void => {
    const previousScale = options.getScale()
    const stored = touch ? touchUnusedFactor : wheelUnusedFactor
    const accumulated = accumulateZoomFactor(previousScale, factor, stored)
    if (touch) touchUnusedFactor = accumulated.unusedFactor
    else wheelUnusedFactor = accumulated.unusedFactor
    if (accumulated.factor === 1) return
    const nextScale = roundScale(Math.min(
      maxScale,
      Math.max(minScale, previousScale * accumulated.factor)
    ))
    if (nextScale === previousScale) return
    options.setScale(nextScale, anchor)
    centerZoomAt(container, previousScale, options.getScale(), anchor)
  }

  const handleWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    applyZoom(Math.exp(-event.deltaY / 100), {
      clientX: event.clientX,
      clientY: event.clientY
    }, false)
  }

  const handleTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2) {
      touchInfo = null
      return
    }
    event.preventDefault()
    touchInfo = orderedTouches(event.touches)
  }

  const handleTouchMove = (event: TouchEvent): void => {
    if (touchInfo === null || event.touches.length !== 2) return
    const next = orderedTouches(event.touches)
    const previous = touchInfo
    if (!isPinchMotion(previous, next)) {
      touchInfo = next
      return
    }
    event.preventDefault()
    touchInfo = next
    const previousDistance = distance(previous.first, previous.second) || 1
    const nextDistance = distance(next.first, next.second) || 1
    applyZoom(nextDistance / previousDistance, {
      clientX: (next.first.clientX + next.second.clientX) / 2,
      clientY: (next.first.clientY + next.second.clientY) / 2
    }, true)
  }

  const handleTouchEnd = (event: TouchEvent): void => {
    if (touchInfo === null) return
    event.preventDefault()
    touchInfo = null
    touchUnusedFactor = 1
  }

  container.addEventListener('wheel', handleWheel, { passive: false })
  container.addEventListener('touchstart', handleTouchStart, { passive: false })
  container.addEventListener('touchmove', handleTouchMove, { passive: false })
  container.addEventListener('touchend', handleTouchEnd, { passive: false })
  container.addEventListener('touchcancel', handleTouchEnd, { passive: false })

  return {
    destroy: () => {
      if (destroyed) return
      destroyed = true
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)
    }
  }
}

/** Preserves the document point underneath one viewport-space zoom anchor. */
function centerZoomAt(
  container: HTMLElement,
  previousScale: number,
  nextScale: number,
  anchor: PdfZoomAnchor
): void {
  const scaleDiff = nextScale / previousScale - 1
  if (!Number.isFinite(scaleDiff) || scaleDiff === 0) return
  const bounds = container.getBoundingClientRect()
  container.scrollLeft += (anchor.clientX - bounds.left) * scaleDiff
  container.scrollTop += (anchor.clientY - bounds.top) * scaleDiff
}

/** Accumulates sub-percent input without losing direction reversals. */
function accumulateZoomFactor(
  previousScale: number,
  factor: number,
  unusedFactor: number
): { factor: number; unusedFactor: number } {
  if (factor === 1) return { factor: 1, unusedFactor }
  let stored = unusedFactor
  if ((stored > 1 && factor < 1) || (stored < 1 && factor > 1)) stored = 1
  const nextFactor = Math.floor(previousScale * factor * stored * 100) / (100 * previousScale)
  if (nextFactor === 0) return { factor: 1, unusedFactor: stored }
  return { factor: nextFactor, unusedFactor: factor / nextFactor }
}

/** Returns two touches in stable identifier order. */
function orderedTouches(touches: TouchList): TouchInfo {
  const first = touches.item(0)
  const second = touches.item(1)
  if (first === null || second === null) throw new Error('Two touches are required for pinch zoom.')
  const points = [copyTouch(first), copyTouch(second)].sort((left, right) =>
    left.identifier - right.identifier)
  return { first: points[0] as TouchPoint, second: points[1] as TouchPoint }
}

/** Copies the small immutable touch subset used across event frames. */
function copyTouch(touch: Touch): TouchPoint {
  return {
    identifier: touch.identifier,
    pageX: touch.pageX,
    pageY: touch.pageY,
    clientX: touch.clientX,
    clientY: touch.clientY
  }
}

/** Rejects two-finger translation/rotation while accepting opposing pinch motion. */
function isPinchMotion(previous: TouchInfo, next: TouchInfo): boolean {
  const firstDeltaX = next.first.pageX - previous.first.pageX
  const firstDeltaY = next.first.pageY - previous.first.pageY
  const secondDeltaX = next.second.pageX - previous.second.pageX
  const secondDeltaY = next.second.pageY - previous.second.pageY
  if (Math.abs(firstDeltaX) <= 1 && Math.abs(firstDeltaY) <= 1
    && Math.abs(secondDeltaX) <= 1 && Math.abs(secondDeltaY) <= 1) return false
  if (firstDeltaX === 0 && firstDeltaY === 0) {
    return isCollinearPinch(
      previous.second.pageX - next.first.pageX,
      previous.second.pageY - next.first.pageY,
      next.second.pageX - next.first.pageX,
      next.second.pageY - next.first.pageY
    )
  }
  if (secondDeltaX === 0 && secondDeltaY === 0) {
    return isCollinearPinch(
      previous.first.pageX - next.second.pageX,
      previous.first.pageY - next.second.pageY,
      next.first.pageX - next.second.pageX,
      next.first.pageY - next.second.pageY
    )
  }
  return firstDeltaX * secondDeltaX + firstDeltaY * secondDeltaY < 0
}

/** Accepts one-finger-fixed pinch motion while rejecting material rotation. */
function isCollinearPinch(
  previousX: number,
  previousY: number,
  nextX: number,
  nextY: number
): boolean {
  const crossProduct = previousX * nextY - previousY * nextX
  return Math.abs(crossProduct) <= 0.02
    * Math.hypot(previousX, previousY)
    * Math.hypot(nextX, nextY)
}

/** Returns Euclidean distance between two touch points. */
function distance(first: TouchPoint, second: TouchPoint): number {
  return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY)
}

/** Validates one positive bounded scale. */
function validateScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10) {
    throw new RangeError('PDF scale must be greater than zero and no greater than ten.')
  }
  return scale
}

/** Validates toolbar and gesture zoom boundaries. */
function validateZoomLimits(minScale: number, maxScale: number, step: number): void {
  if (!Number.isFinite(minScale) || !Number.isFinite(maxScale) || !Number.isFinite(step)
    || minScale <= 0 || maxScale < minScale || maxScale > 10 || step <= 0) {
    throw new RangeError('PDF zoom limits are invalid.')
  }
}

/** Validates positive layout geometry. */
function positiveMetric(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`PDF zoom ${name} is invalid.`)
  return value
}

/** Stabilizes public scale values to two decimal places. */
function roundScale(scale: number): number {
  return Math.round(scale * 100) / 100
}
