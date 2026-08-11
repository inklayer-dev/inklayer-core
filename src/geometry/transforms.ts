/**
 * @file Renderer snapshot affine geometry helpers.
 * @description Applies Konva-like translation, scale, and rotation without
 * constructing renderer nodes inside exporters.
 */

import type { CoordinatePoint } from './coordinates'

/** Applies node-local and root-group transforms to one renderer point. */
export function transformSnapshotPoint(
  point: CoordinatePoint,
  nodeAttrs: Readonly<Record<string, unknown>>,
  groupAttrs: Readonly<Record<string, unknown>>
): CoordinatePoint {
  return applyTransform(applyTransform(point, nodeAttrs), groupAttrs)
}

/** Applies one translation, scale, and clockwise-degree rotation transform. */
function applyTransform(
  point: CoordinatePoint,
  attrs: Readonly<Record<string, unknown>>
): CoordinatePoint {
  const scaleX = numericAttr(attrs, 'scaleX', 1)
  const scaleY = numericAttr(attrs, 'scaleY', 1)
  const x = point.x * scaleX
  const y = point.y * scaleY
  const radians = numericAttr(attrs, 'rotation', 0) * Math.PI / 180
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians) + numericAttr(attrs, 'x', 0),
    y: x * Math.sin(radians) + y * Math.cos(radians) + numericAttr(attrs, 'y', 0)
  }
}

/** Reads one finite numeric attribute or its fallback. */
function numericAttr(
  attrs: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number
): number {
  const value = attrs[key]
  return typeof value === 'number' ? value : fallback
}
