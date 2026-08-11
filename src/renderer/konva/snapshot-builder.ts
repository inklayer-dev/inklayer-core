/**
 * @file Canonical tool-to-Konva snapshot builders.
 * @description Gives every persisted annotation kind a real, validated redraw
 * representation without duplicating renderer JSON across editors.
 */

import type {
  AnnotationAppearance,
  AnnotationBounds,
  AnnotationContent,
  AnnotationType,
  KonvaRendererState
} from '../../domain/annotation'
import { parseAndValidateKonvaSnapshot } from './snapshot'

/** Geometry and content accepted by every tool snapshot builder. */
export interface ToolSnapshotInput {
  /** Annotation identifier used as the root group ID. */
  id: string
  /** Persisted canonical annotation kind. */
  type: AnnotationType
  /** Axis-aligned Stage-space bounds. */
  bounds: AnnotationBounds
  /** Semantic text or image content. */
  content?: AnnotationContent
  /** Editable visual properties. */
  appearance?: AnnotationAppearance
  /** Optional path points for line-based tools. */
  points?: readonly number[]
  /** Optional independent strokes belonging to one freehand annotation. */
  strokes?: readonly (readonly number[])[]
  /** Optional SVG path data for Cloud/native paths. */
  pathData?: string
  /** Optional markup rectangles relative to the Stage. */
  textRects?: readonly AnnotationBounds[]
}

/** Builds and validates exact renderer state for any persisted annotation type. */
export function buildToolRendererState(input: ToolSnapshotInput): KonvaRendererState {
  const root = {
    className: 'Group',
    attrs: { id: input.id },
    children: buildChildren(input)
  }
  const serialized = JSON.stringify(root)
  parseAndValidateKonvaSnapshot(serialized, { annotationId: input.id, operation: 'buildToolRendererState' })
  return { engine: 'konva', schemaVersion: 1, serialized }
}

/** Builds verified Konva child nodes for one canonical tool. */
function buildChildren(input: ToolSnapshotInput): readonly Record<string, unknown>[] {
  const style = createStyleAttrs(input.appearance)
  const { x, y, width, height } = input.bounds
  switch (input.type) {
    case 'highlight':
    case 'strikeout':
    case 'underline': {
      const markupType = input.type
      return (input.textRects ?? [input.bounds]).map((rect) => ({
        className: 'Rect',
        attrs: {
          ...markupBounds(markupType, rect, input.appearance?.strokeWidth ?? 2),
          ...style,
          fill: defaultColor(markupType),
          opacity: markupType === 'highlight' ? (style['opacity'] ?? 0.35) : (style['opacity'] ?? 1)
        }
      }))
    }
    case 'free-text':
      return [{
        className: 'Text',
        attrs: { x, y, width, height, text: input.content?.text ?? '', ...style, fill: style['fill'] ?? '#000000' }
      }]
    case 'rectangle':
      return [{ className: 'Rect', attrs: { x, y, width, height, ...style } }]
    case 'circle':
      return [{
        className: 'Ellipse',
        attrs: { x: x + width / 2, y: y + height / 2, radiusX: width / 2, radiusY: height / 2, ...style }
      }]
    case 'freehand':
    case 'free-highlight':
    case 'signature': {
      const strokes = input.type === 'freehand' && input.strokes !== undefined
        ? input.strokes
        : [input.points ?? rectanglePoints(input.bounds, false)]
      return strokes.map((points) => ({
        className: 'Line',
        attrs: {
          points,
          ...style,
          lineCap: 'round',
          lineJoin: 'round',
          opacity: input.type === 'free-highlight' ? (style['opacity'] ?? 0.35) : (style['opacity'] ?? 1)
        }
      }))
    }
    case 'stamp':
      return [{
        className: 'Image',
        attrs: { x, y, width, height, src: input.content?.image ?? '', ...style }
      }]
    case 'note':
      return [
        { className: 'Rect', attrs: { x, y, width, height, fill: style['fill'] ?? '#ffdc5e', ...style } },
        { className: 'Text', attrs: { x, y, width, height, text: input.content?.text ?? '', fill: '#222222' } }
      ]
    case 'line':
      return [{ className: 'Line', attrs: { points: input.points ?? [x, y, x + width, y + height], ...style } }]
    case 'arrow':
      return [{
        className: 'Arrow',
        attrs: { points: input.points ?? [x, y, x + width, y + height], pointerLength: 10, pointerWidth: 10, ...style }
      }]
    case 'polygon':
      return [{
        className: 'Line', attrs: { points: input.points ?? rectanglePoints(input.bounds, true), closed: true, ...style }
      }]
    case 'polyline':
      return [{ className: 'Line', attrs: { points: input.points ?? rectanglePoints(input.bounds, false), ...style } }]
    case 'cloud':
      return [{
        className: 'Path',
        attrs: {
          x,
          y,
          data: input.pathData ?? (input.points === undefined
            ? rectanglePath(width, height)
            : cloudPathFromPoints(input.points, input.bounds)),
          ...style
        }
      }]
  }
}

/** Converts canonical appearance to shared Konva attributes. */
function createStyleAttrs(appearance: AnnotationAppearance | undefined): Record<string, unknown> {
  return {
    stroke: appearance?.color ?? '#ff0000',
    strokeWidth: appearance?.strokeWidth ?? 2,
    ...(appearance?.opacity === undefined ? {} : { opacity: appearance.opacity }),
    ...(appearance?.fontSize === undefined ? {} : { fontSize: appearance.fontSize })
  }
}

/** Returns the default text-markup color. */
function defaultColor(type: 'highlight' | 'strikeout' | 'underline'): string {
  return type === 'highlight' ? '#ffff00' : '#ff0000'
}

/** Converts a selection rectangle to highlight, strikeout, or underline geometry. */
function markupBounds(
  type: 'highlight' | 'strikeout' | 'underline',
  bounds: AnnotationBounds,
  strokeWidth: number
): AnnotationBounds {
  if (type === 'highlight') return bounds
  const height = Math.max(strokeWidth, 1)
  return {
    x: bounds.x,
    y: type === 'strikeout' ? bounds.y + (bounds.height - height) / 2 : bounds.y + bounds.height - height,
    width: bounds.width,
    height
  }
}

/** Builds rectangle perimeter points for path-oriented tools. */
function rectanglePoints(bounds: AnnotationBounds, close: boolean): number[] {
  const { x, y, width, height } = bounds
  const points = [x, y, x + width, y, x + width, y + height, x, y + height]
  if (close) points.push(x, y)
  return points
}

/** Builds a local rectangular SVG path used as a safe Cloud fallback. */
function rectanglePath(width: number, height: number): string {
  return generateCloudPath([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    { x: 0, y: 0 }
  ])
}

/** Converts absolute Stage points to local Cloud path data. */
function cloudPathFromPoints(points: readonly number[], bounds: AnnotationBounds): string {
  const vertices: Array<{ x: number; y: number }> = []
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]
    const y = points[index + 1]
    if (x !== undefined && y !== undefined) vertices.push({ x: x - bounds.x, y: y - bounds.y })
  }
  const first = vertices[0]
  if (first !== undefined) vertices.push({ x: first.x, y: first.y })
  return generateCloudPath(vertices)
}

/** Builds outward quadratic waves along a closed polygon. */
function generateCloudPath(points: readonly { x: number; y: number }[], radius = 15): string {
  if (points.length < 2) return ''
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  )
  center.x /= points.length
  center.y /= points.length
  let path = ''
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index]
    const second = points[index + 1]
    if (first === undefined || second === undefined) continue
    const dx = second.x - first.x
    const dy = second.y - first.y
    const length = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const normalX = Math.cos(angle + Math.PI / 2)
    const normalY = Math.sin(angle + Math.PI / 2)
    const toCenterX = center.x - (first.x + second.x) / 2
    const toCenterY = center.y - (first.y + second.y) / 2
    const normalSign = normalX * toCenterX + normalY * toCenterY > 0 ? -1 : 1
    const steps = Math.min(2048, Math.max(2, Math.floor(length / (radius * 1.3))))
    for (let step = 0; step < steps; step += 1) {
      const startRatio = step / steps
      const endRatio = (step + 1) / steps
      const startX = first.x + dx * startRatio
      const startY = first.y + dy * startRatio
      const endX = first.x + dx * endRatio
      const endY = first.y + dy * endRatio
      const controlX = (startX + endX) / 2 + normalX * radius * normalSign
      const controlY = (startY + endY) / 2 + normalY * radius * normalSign
      if (index === 0 && step === 0) path += `M ${startX} ${startY} `
      path += `Q ${controlX} ${controlY} ${endX} ${endY} `
    }
  }
  return path.trim()
}
