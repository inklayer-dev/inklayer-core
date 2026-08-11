/**
 * @file Central PDF user-space and unscaled Stage coordinate conversion.
 * @description Handles PDF bottom-left, Stage top-left, page boxes, and quarter
 * rotations once for native import and exporters.
 */

import type { AnnotationBounds } from '../domain/annotation'

/** Supported PDF page quarter rotations in degrees clockwise. */
export type PdfPageRotation = 0 | 90 | 180 | 270

/** PDF page box used for coordinate conversion. */
export interface PdfPageBox {
  /** Minimum PDF x coordinate. */
  xMin: number
  /** Minimum PDF y coordinate. */
  yMin: number
  /** Maximum PDF x coordinate. */
  xMax: number
  /** Maximum PDF y coordinate. */
  yMax: number
  /** Clockwise page rotation. */
  rotation: PdfPageRotation
}

/** Two-dimensional point. */
export interface CoordinatePoint {
  /** Horizontal coordinate. */
  x: number
  /** Vertical coordinate. */
  y: number
}

/** Converts one PDF user-space point to unscaled top-left Stage coordinates. */
export function pdfPointToStage(point: CoordinatePoint, page: PdfPageBox): CoordinatePoint {
  validatePageBox(page)
  validatePoint(point)
  switch (page.rotation) {
    case 0:
      return { x: point.x - page.xMin, y: page.yMax - point.y }
    case 90:
      return { x: point.y - page.yMin, y: point.x - page.xMin }
    case 180:
      return { x: page.xMax - point.x, y: point.y - page.yMin }
    case 270:
      return { x: page.yMax - point.y, y: page.xMax - point.x }
  }
}

/** Converts one unscaled Stage point back to PDF user space. */
export function stagePointToPdf(point: CoordinatePoint, page: PdfPageBox): CoordinatePoint {
  validatePageBox(page)
  validatePoint(point)
  switch (page.rotation) {
    case 0:
      return { x: point.x + page.xMin, y: page.yMax - point.y }
    case 90:
      return { x: point.y + page.xMin, y: point.x + page.yMin }
    case 180:
      return { x: page.xMax - point.x, y: point.y + page.yMin }
    case 270:
      return { x: page.xMax - point.y, y: page.yMax - point.x }
  }
}

/** Converts a PDF `[x1,y1,x2,y2]` rectangle to Stage bounds. */
export function pdfRectToStageBounds(
  rect: readonly [number, number, number, number],
  page: PdfPageBox
): AnnotationBounds {
  const first = pdfPointToStage({ x: rect[0], y: rect[1] }, page)
  const second = pdfPointToStage({ x: rect[2], y: rect[3] }, page)
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.abs(second.x - first.x),
    height: Math.abs(second.y - first.y)
  }
}

/** Converts Stage bounds to a normalized PDF `[x1,y1,x2,y2]` rectangle. */
export function stageBoundsToPdfRect(
  bounds: AnnotationBounds,
  page: PdfPageBox
): [number, number, number, number] {
  const first = stagePointToPdf({ x: bounds.x, y: bounds.y }, page)
  const second = stagePointToPdf({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, page)
  return [
    Math.min(first.x, second.x),
    Math.min(first.y, second.y),
    Math.max(first.x, second.x),
    Math.max(first.y, second.y)
  ]
}

/** Validates a finite, non-empty PDF page box. */
function validatePageBox(page: PdfPageBox): void {
  if (![page.xMin, page.yMin, page.xMax, page.yMax].every(Number.isFinite)
    || page.xMax <= page.xMin || page.yMax <= page.yMin
    || ![0, 90, 180, 270].includes(page.rotation)) {
    throw new RangeError('PDF page box is invalid.')
  }
}

/** Validates one finite coordinate point. */
function validatePoint(point: CoordinatePoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Coordinate point must be finite.')
  }
}
