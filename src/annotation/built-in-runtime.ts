/**
 * @file Core-private optimized built-in renderer facet.
 * @description Dispatches protected Definitions to verified Konva snapshot
 * builders without exposing renderer objects or serialized state to plugins.
 */

import type {
  AnnotationAppearance,
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
