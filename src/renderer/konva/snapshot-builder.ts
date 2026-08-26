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
import { parseAnnotationColor } from '../../domain/color'
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
  appearance: AnnotationAppearance
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
    attrs: { id: input.id, opacity: input.appearance.opacity },
    children: buildChildren(input)
  }
  const serialized = JSON.stringify(root)
  parseAndValidateKonvaSnapshot(serialized, { annotationId: input.id, operation: 'buildToolRendererState' })
  return { engine: 'konva', schemaVersion: 1, serialized }
}

/** Reapplies semantic appearance to an existing exact snapshot without changing geometry. */
export function restyleToolRendererState(
  rendererState: KonvaRendererState,
  type: AnnotationType,
  appearance: AnnotationAppearance
): KonvaRendererState {
  const validated = parseAndValidateKonvaSnapshot(rendererState.serialized, {
    operation: 'restyleToolRendererState'
  })
  const root = structuredClone(validated.root) as unknown as MutableKonvaNode
  root.attrs['opacity'] = appearance.opacity
  for (const child of root.children ?? []) restyleChild(child, type, appearance)
  const serialized = JSON.stringify(root)
  parseAndValidateKonvaSnapshot(serialized, { operation: 'restyleToolRendererState' })
  return { engine: 'konva', schemaVersion: 1, serialized }
}

/** Reapplies semantic content to content-backed nodes without changing geometry. */
export function updateToolRendererContent(
  rendererState: KonvaRendererState,
  type: AnnotationType,
  content: AnnotationContent | undefined
): KonvaRendererState {
  const validated = parseAndValidateKonvaSnapshot(rendererState.serialized, {
    operation: 'updateToolRendererContent'
  })
  const root = structuredClone(validated.root) as unknown as MutableKonvaNode
  updateChildContent(root, type, content)
  const serialized = JSON.stringify(root)
  parseAndValidateKonvaSnapshot(serialized, { operation: 'updateToolRendererContent' })
  return { engine: 'konva', schemaVersion: 1, serialized }
}

/** Mutable internal form used only while rebuilding validated JSON. */
interface MutableKonvaNode {
  className: string
  attrs: Record<string, unknown>
  children?: MutableKonvaNode[]
}

/** Updates only renderer attributes that canonically mirror semantic content. */
function updateChildContent(
  node: MutableKonvaNode,
  type: AnnotationType,
  content: AnnotationContent | undefined
): void {
  if ((type === 'free-text' || type === 'note') && node.className === 'Text') {
    node.attrs['text'] = content?.text ?? ''
  }
  if (type === 'stamp' && node.className === 'Image') {
    node.attrs['src'] = content?.image ?? ''
  }
  if (type === 'signature' && node.className === 'Image') {
    node.attrs['src'] = content?.signature?.kind === 'image' ? content.signature.image : ''
  }
  for (const child of node.children ?? []) updateChildContent(child, type, content)
}

/** Replaces persisted paint attrs while retaining one child node's exact geometry. */
function restyleChild(
  node: MutableKonvaNode,
  type: AnnotationType,
  appearance: AnnotationAppearance
): void {
  for (const key of PAINT_ATTRS) delete node.attrs[key]
  if (type === 'note') restyleNoteChild(node, appearance)
  else if (node.className === 'Image' && (type === 'signature' || type === 'stamp')) {
    // Raster assets own their pixels; annotation paint must not create a
    // browser-only frame that is absent from the exported PDF appearance.
  } else if (type === 'highlight') Object.assign(node.attrs, fillAttrs(appearance))
  else if (type === 'strikeout' || type === 'underline') {
    Object.assign(node.attrs, {
      fill: appearance.stroke === null ? undefined : colorWithOpacity(
        appearance.stroke.color,
        appearance.stroke.opacity
      )
    })
  } else if (node.className === 'Text') Object.assign(node.attrs, textAttrs(appearance))
  else if (node.className === 'Rect' && type === 'free-text') {
    Object.assign(node.attrs, strokeAttrs(appearance), fillAttrs(appearance))
  } else {
    Object.assign(node.attrs, strokeAttrs(appearance))
    if (type === 'rectangle' || type === 'circle' || type === 'polygon' || type === 'cloud') {
      Object.assign(node.attrs, fillAttrs(appearance))
    }
  }
  for (const child of node.children ?? []) restyleChild(child, type, appearance)
}

const PAINT_ATTRS = [
  'stroke', 'strokeWidth', 'strokeOpacity', 'fill', 'fillOpacity', 'opacity',
  'dash', 'dashOffset', 'lineCap', 'lineJoin', 'fontSize', 'fillPriority',
  'fillLinearGradientStartPoint', 'fillLinearGradientEndPoint',
  'fillLinearGradientColorStops'
] as const

/** Builds verified Konva child nodes for one canonical tool. */
function buildChildren(input: ToolSnapshotInput): readonly Record<string, unknown>[] {
  const stroke = strokeAttrs(input.appearance)
  const fill = fillAttrs(input.appearance)
  const text = textAttrs(input.appearance)
  const { x, y, width, height } = input.bounds
  switch (input.type) {
    case 'highlight':
    case 'strikeout':
    case 'underline': {
      const markupType = input.type
      return (input.textRects ?? [input.bounds]).map((rect) => ({
        className: 'Rect',
        attrs: {
          ...markupBounds(markupType, rect, input.appearance.stroke?.width ?? 1),
          ...(markupType === 'highlight' ? fill : {
            fill: input.appearance.stroke === null ? undefined : colorWithOpacity(
              input.appearance.stroke.color,
              input.appearance.stroke.opacity
            )
          })
        }
      }))
    }
    case 'free-text':
      return [
        { className: 'Rect', attrs: { x, y, width, height, ...stroke, ...fill } },
        { className: 'Text', attrs: { x, y, width, height, text: input.content?.text ?? '', ...text } }
      ]
    case 'rectangle':
      return [{ className: 'Rect', attrs: { x, y, width, height, ...stroke, ...fill } }]
    case 'circle':
      return [{
        className: 'Ellipse',
        attrs: { x: x + width / 2, y: y + height / 2, radiusX: width / 2, radiusY: height / 2, ...stroke, ...fill }
      }]
    case 'signature': {
      if (input.content?.signature?.kind === 'image') {
        return [{
          className: 'Image',
          attrs: { x, y, width, height, src: input.content.signature.image }
        }]
      }
      const signatureStrokes = input.content?.signature?.kind === 'ink'
        ? input.content.signature.strokes
        : [input.points ?? rectanglePoints(input.bounds, false)]
      return signatureStrokes.map((points) => ({
        className: 'Line', attrs: { points, ...stroke }
      }))
    }
    case 'freehand':
    case 'free-highlight': {
      const strokes = input.type === 'freehand' && input.strokes !== undefined
        ? input.strokes
        : [input.points ?? rectanglePoints(input.bounds, false)]
      return strokes.map((points) => ({
        className: 'Line',
        attrs: {
          points,
          ...stroke
        }
      }))
    }
    case 'stamp':
      return [{
        className: 'Image',
        attrs: { x, y, width, height, src: input.content?.image ?? '' }
      }]
    case 'note':
      return buildNoteIcon(input.bounds, input.appearance, input.content?.text ?? '')
    case 'line':
      return [{ className: 'Line', attrs: { points: input.points ?? [x, y, x + width, y + height], ...stroke } }]
    case 'arrow':
      return [{
        className: 'Arrow',
        attrs: { points: input.points ?? [x, y, x + width, y + height], pointerLength: 10, pointerWidth: 10, ...stroke }
      }]
    case 'polygon':
      return [{
        className: 'Line', attrs: { points: input.points ?? rectanglePoints(input.bounds, true), closed: true, ...stroke, ...fill }
      }]
    case 'polyline':
      return [{ className: 'Line', attrs: { points: input.points ?? rectanglePoints(input.bounds, false), ...stroke } }]
    case 'cloud':
      return [{
        className: 'Path',
        attrs: {
          x,
          y,
          data: input.pathData ?? (input.points === undefined
            ? rectanglePath(width, height)
            : buildCloudPathFromPoints(input.points, input.bounds)),
          ...stroke,
          ...fill
        }
      }]
  }
}

/** Builds a folded document icon while keeping its color controlled by appearance. */
function buildNoteIcon(
  bounds: AnnotationBounds,
  appearance: AnnotationAppearance,
  content: string
): readonly Record<string, unknown>[] {
  const { x, y, width, height } = bounds
  const size = Math.min(width, height)
  const foldSize = Math.min(5, size * 0.25)
  const lineWidth = Math.max(0.6, size / 30)
  const paper = {
    className: 'Rect',
    attrs: {
      name: 'inklayer-note-paper', x, y, width, height,
      cornerRadius: Math.min(4, size * 0.18),
      ...notePaperPaint(appearance, height)
    }
  }
  const fold = {
    className: 'Line',
    attrs: {
      name: 'inklayer-note-fold',
      points: [
        x + width - foldSize, y,
        x + width, y + foldSize,
        x + width - foldSize, y + foldSize
      ],
      closed: true,
      fill: 'rgba(255, 255, 255, 0.86)',
      stroke: 'rgba(0, 0, 0, 0.14)',
      strokeWidth: lineWidth
    }
  }
  const foldShadow = {
    className: 'Line',
    attrs: {
      name: 'inklayer-note-fold-shadow',
      points: [
        x + width - foldSize, y + foldSize,
        x + width, y + foldSize,
        x + width - foldSize, y
      ],
      stroke: 'rgba(0, 0, 0, 0.12)',
      strokeWidth: Math.max(0.4, lineWidth * 0.65)
    }
  }
  const padding = Math.max(3, size * 0.17)
  const spacing = (height - padding * 2) / 4
  const lines = Array.from({ length: 3 }, (_, index) => {
    const lineY = y + padding + (index + 1) * spacing
    return {
      className: 'Line',
      attrs: {
        name: 'inklayer-note-text-line',
        points: [
          x + padding,
          lineY,
          x + width - (index === 0 ? foldSize + 2 : padding),
          lineY
        ],
        ...noteTextLinePaint(appearance, Math.max(1, size / 18))
      }
    }
  })
  const contentNode = {
    className: 'Text',
    attrs: {
      name: 'inklayer-note-content', x, y, width, height,
      text: content, visible: false, listening: false, ...textAttrs(appearance)
    }
  }
  return [paper, fold, foldShadow, ...lines, contentNode]
}

/** Reapplies appearance without recoloring the fixed folded-corner details. */
function restyleNoteChild(node: MutableKonvaNode, appearance: AnnotationAppearance): void {
  switch (node.attrs['name']) {
    case 'inklayer-note-paper':
      Object.assign(node.attrs, notePaperPaint(appearance, Number(node.attrs['height'] ?? 0)))
      break
    case 'inklayer-note-fold':
      Object.assign(node.attrs, {
        fill: 'rgba(255, 255, 255, 0.86)',
        stroke: 'rgba(0, 0, 0, 0.14)',
        strokeWidth: 0.7
      })
      break
    case 'inklayer-note-fold-shadow':
      Object.assign(node.attrs, { stroke: 'rgba(0, 0, 0, 0.12)', strokeWidth: 0.4 })
      break
    case 'inklayer-note-text-line':
      Object.assign(node.attrs, noteTextLinePaint(appearance, 1.2))
      break
    case 'inklayer-note-content':
      Object.assign(node.attrs, textAttrs(appearance), { visible: false, listening: false })
      break
  }
}

/** Returns the paper fill, gradient, and border derived from Note appearance. */
function notePaperPaint(
  appearance: AnnotationAppearance,
  height: number
): Record<string, unknown> {
  const fill = appearance.fill
  const fillColor = fill?.color ?? '#ffdd1f'
  const fillOpacity = fill?.opacity ?? 1
  return {
    ...strokeAttrs(appearance),
    fill: colorWithOpacity(fillColor, fillOpacity),
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: 0, y: height },
    fillLinearGradientColorStops: [
      0, colorWithOpacity(fillColor, fillOpacity),
      1, `rgba(255, 255, 255, ${fillOpacity})`
    ]
  }
}

/** Returns the document-line color derived from Note text appearance. */
function noteTextLinePaint(
  appearance: AnnotationAppearance,
  width: number
): Record<string, unknown> {
  const text = appearance.text
  return {
    stroke: colorWithOpacity(text?.color ?? '#222222', (text?.opacity ?? 1) * 0.78),
    strokeWidth: width,
    lineCap: 'round'
  }
}

/** Converts canonical appearance to shared Konva attributes. */
function strokeAttrs(appearance: AnnotationAppearance): Record<string, unknown> {
  const stroke = appearance.stroke
  return stroke === null ? {} : {
    stroke: colorWithOpacity(stroke.color, stroke.opacity),
    strokeWidth: stroke.width,
    dash: [...stroke.dash],
    dashOffset: stroke.dashOffset,
    lineCap: stroke.lineCap,
    lineJoin: stroke.lineJoin
  }
}

/** Converts canonical fill appearance to Konva attributes. */
function fillAttrs(appearance: AnnotationAppearance): Record<string, unknown> {
  const fill = appearance.fill
  return fill === null ? {} : { fill: colorWithOpacity(fill.color, fill.opacity) }
}

/** Converts canonical text appearance to Konva attributes. */
function textAttrs(appearance: AnnotationAppearance): Record<string, unknown> {
  const text = appearance.text
  return text === null ? {} : {
    fill: colorWithOpacity(text.color, text.opacity),
    fontSize: text.fontSize
  }
}

/** Converts validated CSS RGB paint and independent component alpha to RGBA. */
function colorWithOpacity(color: string, opacity: number): string {
  const [red, green, blue] = parseAnnotationColor(color)
  return `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${opacity})`
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
export function buildCloudPathFromPoints(
  points: readonly number[],
  bounds: AnnotationBounds,
  close = true
): string {
  const vertices: Array<{ x: number; y: number }> = []
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]
    const y = points[index + 1]
    if (x !== undefined && y !== undefined) vertices.push({ x: x - bounds.x, y: y - bounds.y })
  }
  const first = vertices[0]
  const last = vertices.at(-1)
  if (close && first !== undefined && (last?.x !== first.x || last.y !== first.y)) {
    vertices.push({ x: first.x, y: first.y })
  }
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
