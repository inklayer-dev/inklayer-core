/**
 * @file Controlled annotation scene to Konva snapshot projection.
 * @description Converts bounded renderer-neutral Definition output and safe
 * unavailable placeholders without exposing live Konva nodes to extensions.
 */

import type { Annotation, AnnotationBounds, KonvaRendererState } from '../../domain/annotation'
import { parseAnnotationColor } from '../../domain/color'
import { InkLayerError } from '../../domain/errors'
import { parseJsonValue } from '../../domain/json-value'
import type {
  AnnotationScene,
  AnnotationSceneFill,
  AnnotationSceneNode,
  AnnotationSceneStroke
} from '../../annotation-types/contracts'
import { parseAndValidateKonvaSnapshot } from './snapshot'

const MAX_SCENE_NODES = 10_000
const MAX_SCENE_POINTS = 100_000
const MAX_SCENE_TEXT = 1_000_000

/** Builds one exact validated snapshot from controlled Definition output. */
export function buildAnnotationSceneRendererState(
  annotation: Readonly<Annotation>,
  scene: AnnotationScene
): KonvaRendererState {
  const detached = parseJsonValue(scene, 'buildAnnotationSceneRendererState', {
    maxValues: MAX_SCENE_NODES + MAX_SCENE_POINTS + 1_000
  }) as unknown as AnnotationScene
  if (typeof detached !== 'object' || detached === null || !Array.isArray(detached.children)) {
    throw sceneError(annotation, 'Annotation scene must contain a children array.')
  }
  const state = { nodes: 0, points: 0 }
  const root = {
    className: 'Group',
    attrs: { id: annotation.id, opacity: annotation.appearance.opacity },
    children: detached.children.map((node) => projectNode(node, annotation, state))
  }
  const serialized = JSON.stringify(root)
  parseAndValidateKonvaSnapshot(serialized, {
    annotationId: annotation.id,
    pageIndex: annotation.pageIndex,
    operation: 'buildAnnotationSceneRendererState'
  })
  return { engine: 'konva', schemaVersion: 1, serialized }
}

/** Builds a Core-owned placeholder without reading unknown renderer data. */
export function buildUnavailableAnnotationRendererState(
  annotation: Readonly<Annotation>
): KonvaRendererState {
  const { x, y, width, height } = annotation.bounds
  const fontSize = Math.max(10, Math.min(14, height / 3))
  const scene: AnnotationScene = {
    children: [
      {
        kind: 'rectangle', bounds: { x, y, width, height },
        stroke: { color: '#8c8c8c', width: 1, opacity: 0.9, dash: [6, 4] },
        fill: { color: '#f5f5f5', opacity: 0.35 }
      },
      {
        kind: 'text', bounds: { x: x + 4, y: y + 4, width: Math.max(0, width - 8), height: Math.max(0, height - 8) },
        text: 'Unsupported annotation', color: '#595959', fontSize
      }
    ]
  }
  return buildAnnotationSceneRendererState(annotation, scene)
}

/** Projects one bounded scene primitive to the validated Konva vocabulary. */
function projectNode(
  node: AnnotationSceneNode,
  annotation: Readonly<Annotation>,
  state: { nodes: number; points: number }
): Record<string, unknown> {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    throw sceneError(annotation, 'Annotation scene node must be an object.')
  }
  state.nodes += 1
  if (state.nodes > MAX_SCENE_NODES) throw sceneError(annotation, 'Annotation scene contains too many nodes.')
  const common = commonAttrs(node, annotation)
  switch (node.kind) {
    case 'group':
      if (!Array.isArray(node.children)) throw sceneError(annotation, 'Annotation scene group children are invalid.')
      return {
        className: 'Group',
        attrs: {
          ...common,
          ...(node.x === undefined ? {} : { x: finite(node.x, annotation) }),
          ...(node.y === undefined ? {} : { y: finite(node.y, annotation) }),
          ...(node.rotation === undefined ? {} : { rotation: finite(node.rotation, annotation) })
        },
        children: node.children.map((child) => projectNode(child, annotation, state))
      }
    case 'rectangle':
      return {
        className: 'Rect',
        attrs: {
          ...common, ...boundsAttrs(node.bounds, annotation),
          ...(node.cornerRadius === undefined ? {} : { cornerRadius: nonNegative(node.cornerRadius, annotation) }),
          ...strokeAttrs(node.stroke, annotation), ...fillAttrs(node.fill, annotation)
        }
      }
    case 'ellipse': {
      const bounds = validateBounds(node.bounds, annotation)
      return {
        className: 'Ellipse',
        attrs: {
          ...common,
          x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
          radiusX: bounds.width / 2, radiusY: bounds.height / 2,
          ...strokeAttrs(node.stroke, annotation), ...fillAttrs(node.fill, annotation)
        }
      }
    }
    case 'line': {
      if (node.points.length < 4 || node.points.length % 2 !== 0) {
        throw sceneError(annotation, 'Annotation scene line points are invalid.')
      }
      state.points += node.points.length
      if (state.points > MAX_SCENE_POINTS) throw sceneError(annotation, 'Annotation scene contains too many points.')
      if (node.closed !== undefined && typeof node.closed !== 'boolean') {
        throw sceneError(annotation, 'Annotation scene line closure is invalid.')
      }
      return {
        className: 'Line',
        attrs: {
          ...common, points: node.points.map((point) => finite(point, annotation)),
          closed: node.closed ?? false,
          ...(node.tension === undefined ? {} : { tension: finite(node.tension, annotation) }),
          ...strokeAttrs(node.stroke, annotation), ...fillAttrs(node.fill, annotation)
        }
      }
    }
    case 'path':
      if (typeof node.data !== 'string' || node.data.length === 0 || node.data.length > MAX_SCENE_TEXT) {
        throw sceneError(annotation, 'Annotation scene path data is invalid.')
      }
      return {
        className: 'Path',
        attrs: {
          ...common, data: node.data,
          ...(node.x === undefined ? {} : { x: finite(node.x, annotation) }),
          ...(node.y === undefined ? {} : { y: finite(node.y, annotation) }),
          ...strokeAttrs(node.stroke, annotation), ...fillAttrs(node.fill, annotation)
        }
      }
    case 'text':
      if (typeof node.text !== 'string' || node.text.length > MAX_SCENE_TEXT) {
        throw sceneError(annotation, 'Annotation scene text is invalid.')
      }
      color(node.color, annotation)
      if (node.align !== undefined && !new Set(['left', 'center', 'right']).has(node.align)) {
        throw sceneError(annotation, 'Annotation scene text alignment is invalid.')
      }
      return {
        className: 'Text',
        attrs: {
          ...common, ...boundsAttrs(node.bounds, annotation), text: node.text,
          fill: node.color, fontSize: positive(node.fontSize, annotation),
          align: node.align ?? 'left'
        }
      }
    case 'image':
      if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(node.source)
        || node.source.length > 10_000_000) {
        throw sceneError(annotation, 'Annotation scene image source is invalid.')
      }
      return { className: 'Image', attrs: { ...common, ...boundsAttrs(node.bounds, annotation), src: node.source } }
    default:
      throw sceneError(annotation, 'Annotation scene node kind is unsupported.')
  }
}

/** Projects attributes shared by all scene nodes. */
function commonAttrs(node: AnnotationSceneNode, annotation: Readonly<Annotation>): Record<string, unknown> {
  if (node.listening !== undefined && typeof node.listening !== 'boolean') {
    throw sceneError(annotation, 'Annotation scene listening flag is invalid.')
  }
  return {
    ...(node.opacity === undefined ? {} : { opacity: unit(node.opacity, annotation) }),
    ...(node.listening === undefined ? {} : { listening: node.listening })
  }
}

/** Projects one semantic stroke. */
function strokeAttrs(
  stroke: AnnotationSceneStroke | undefined,
  annotation: Readonly<Annotation>
): Record<string, unknown> {
  if (stroke === undefined) return {}
  color(stroke.color, annotation)
  const dash = stroke.dash ?? []
  if (dash.length > 32 || dash.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw sceneError(annotation, 'Annotation scene stroke dash is invalid.')
  }
  if (stroke.lineCap !== undefined && !new Set(['butt', 'round', 'square']).has(stroke.lineCap)) {
    throw sceneError(annotation, 'Annotation scene stroke lineCap is invalid.')
  }
  if (stroke.lineJoin !== undefined && !new Set(['miter', 'round', 'bevel']).has(stroke.lineJoin)) {
    throw sceneError(annotation, 'Annotation scene stroke lineJoin is invalid.')
  }
  return {
    stroke: stroke.color,
    strokeWidth: positive(stroke.width, annotation),
    strokeOpacity: unit(stroke.opacity ?? 1, annotation),
    dash: [...dash],
    lineCap: stroke.lineCap ?? 'butt',
    lineJoin: stroke.lineJoin ?? 'miter'
  }
}

/** Projects one semantic fill. */
function fillAttrs(
  fill: AnnotationSceneFill | undefined,
  annotation: Readonly<Annotation>
): Record<string, unknown> {
  if (fill === undefined) return {}
  color(fill.color, annotation)
  return { fill: fill.color, fillOpacity: unit(fill.opacity ?? 1, annotation) }
}

/** Projects validated bounds to flat renderer attributes. */
function boundsAttrs(bounds: AnnotationBounds, annotation: Readonly<Annotation>): Record<string, number> {
  const parsed = validateBounds(bounds, annotation)
  return { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height }
}

/** Validates finite non-negative scene bounds. */
function validateBounds(bounds: AnnotationBounds, annotation: Readonly<Annotation>): AnnotationBounds {
  return {
    x: finite(bounds.x, annotation), y: finite(bounds.y, annotation),
    width: nonNegative(bounds.width, annotation), height: nonNegative(bounds.height, annotation)
  }
}

/** Validates a supported annotation color. */
function color(value: string, annotation: Readonly<Annotation>): void {
  try { parseAnnotationColor(value) } catch (cause) {
    throw sceneError(annotation, 'Annotation scene color is invalid.', cause)
  }
}

/** Validates a bounded finite coordinate. */
function finite(value: number, annotation: Readonly<Annotation>): number {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) {
    throw sceneError(annotation, 'Annotation scene number is invalid.')
  }
  return value
}

/** Validates a non-negative finite number. */
function nonNegative(value: number, annotation: Readonly<Annotation>): number {
  const parsed = finite(value, annotation)
  if (parsed < 0) throw sceneError(annotation, 'Annotation scene number cannot be negative.')
  return parsed
}

/** Validates a positive finite number. */
function positive(value: number, annotation: Readonly<Annotation>): number {
  const parsed = finite(value, annotation)
  if (parsed <= 0) throw sceneError(annotation, 'Annotation scene number must be positive.')
  return parsed
}

/** Validates a finite unit value. */
function unit(value: number, annotation: Readonly<Annotation>): number {
  const parsed = finite(value, annotation)
  if (parsed < 0 || parsed > 1) throw sceneError(annotation, 'Annotation scene opacity is invalid.')
  return parsed
}

/** Creates one structured controlled-rendering failure. */
function sceneError(annotation: Readonly<Annotation>, message: string, cause?: unknown): InkLayerError {
  return new InkLayerError('ANNOTATION_INVALID', message, {
    operation: 'buildAnnotationSceneRendererState', annotationId: annotation.id,
    pageIndex: annotation.pageIndex, ...(cause === undefined ? {} : { cause })
  })
}
