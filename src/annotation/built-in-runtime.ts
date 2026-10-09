/**
 * @file Core-private optimized built-in renderer facet.
 * @description Dispatches protected Definitions to verified Konva snapshot
 * builders without exposing renderer objects or serialized state to plugins.
 */

import type {
  AnnotationAppearance,
  AnnotationBounds,
  AnnotationContent,
  AnnotationType,
  KonvaRendererState
} from '../domain/annotation'
import type { AnnotationTypeDefinition } from '../annotation-types/contracts'
import {
  buildToolRendererState,
  restyleToolRendererState,
  updateToolRendererContent,
  type ToolSnapshotInput
} from '../renderer/konva/snapshot-builder'
import { InkLayerError } from '../domain/errors'
import { parseAndValidateKonvaSnapshot } from '../renderer/konva/snapshot'

/** Builds one protected Definition's initial exact renderer snapshot. */
export function buildBuiltInRendererState(
  definition: AnnotationTypeDefinition,
  input: ToolSnapshotInput
): KonvaRendererState {
  requireCoreRenderer(definition, input.type, 'buildBuiltInRendererState')
  return buildToolRendererState(input)
}

/** Restyles one protected Definition's exact renderer snapshot. */
export function restyleBuiltInRendererState(
  definition: AnnotationTypeDefinition,
  state: KonvaRendererState,
  type: AnnotationType,
  appearance: AnnotationAppearance
): KonvaRendererState {
  requireCoreRenderer(definition, type, 'restyleBuiltInRendererState')
  return restyleToolRendererState(state, type, appearance)
}

/** Synchronizes content-backed nodes for one protected Definition. */
export function updateBuiltInRendererContent(
  definition: AnnotationTypeDefinition,
  state: KonvaRendererState,
  type: AnnotationType,
  content: AnnotationContent | undefined
): KonvaRendererState {
  requireCoreRenderer(definition, type, 'updateBuiltInRendererContent')
  return updateToolRendererContent(state, type, content)
}

/** Applies one renderer-owned bounds change without exposing Konva state to callers. */
export function updateBuiltInRendererBounds(
  definition: AnnotationTypeDefinition,
  state: KonvaRendererState,
  type: AnnotationType,
  current: AnnotationBounds,
  next: AnnotationBounds,
  uniform: boolean
): KonvaRendererState {
  requireCoreRenderer(definition, type, 'updateBuiltInRendererBounds')
  const parsed = parseAndValidateKonvaSnapshot(state.serialized, {
    operation: 'updateBuiltInRendererBounds'
  })
  const root = structuredClone(parsed.root) as unknown as MutableKonvaNode
  const ratioX = next.width / current.width
  const ratioY = next.height / current.height
  if (uniform && Math.abs(ratioX - ratioY) > 1e-6) {
    throw invalidBounds('Uniform annotation bounds must preserve aspect ratio.')
  }
  const rotation = finiteAttribute(root.attrs['rotation'], 0)
  if (!uniform && Math.abs(ratioX - ratioY) > 1e-6 && Math.abs(rotation % 180) > 1e-6) {
    throw invalidBounds('Non-uniform bounds cannot preserve a rotated annotation.')
  }
  const x = finiteAttribute(root.attrs['x'], 0)
  const y = finiteAttribute(root.attrs['y'], 0)
  const scaleX = finiteAttribute(root.attrs['scaleX'], 1)
  const scaleY = finiteAttribute(root.attrs['scaleY'], 1)
  const projectedX = x + (current.x - x) * ratioX
  const projectedY = y + (current.y - y) * ratioY
  root.attrs['x'] = x + next.x - projectedX
  root.attrs['y'] = y + next.y - projectedY
  root.attrs['scaleX'] = scaleX * ratioX
  root.attrs['scaleY'] = scaleY * ratioY
  const serialized = JSON.stringify(root)
  parseAndValidateKonvaSnapshot(serialized, { operation: 'updateBuiltInRendererBounds' })
  return { engine: 'konva', schemaVersion: 1, serialized }
}

/** Mutable renderer root used only while composing one validated affine update. */
interface MutableKonvaNode {
  className: string
  attrs: Record<string, unknown>
  children?: MutableKonvaNode[]
}

/** Reads one optional finite Konva transform attribute. */
function finiteAttribute(value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidBounds('Annotation renderer transform is invalid.')
  }
  return value
}

/** Creates one stable public-operation failure without leaking renderer details. */
function invalidBounds(message: string): InkLayerError {
  return new InkLayerError('ANNOTATION_INVALID', message, {
    operation: 'updateAnnotationBounds'
  })
}

/** Rejects accidental routing of a custom Definition into private rendering. */
function requireCoreRenderer(
  definition: AnnotationTypeDefinition,
  type: AnnotationType,
  operation: string
): void {
  if (definition.type === type && definition.renderer.strategy === 'core') return
  throw new InkLayerError('ANNOTATION_TYPE_UNAVAILABLE', 'Built-in renderer behavior is unavailable.', {
    operation
  })
}
