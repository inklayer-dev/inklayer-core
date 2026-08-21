/**
 * @file Annotation Engine tool contracts.
 * @description Separates transient selection from persisted annotation types and
 * records interaction capabilities used by framework-neutral UI consumers.
 */

import {
  BUILT_IN_ANNOTATION_TYPES,
  type AnnotationType,
  type AnnotationTypeId
} from '../domain/annotation'
import { BUILT_IN_ANNOTATION_TYPE_DEFINITIONS } from '../annotation-types/built-in-definitions'

/** Transient and persisted tools selectable in the Annotation Engine. */
export type AnnotationTool = 'select' | 'text-select' | AnnotationTypeId

/** Direct-manipulation geometry used by the internal Painter. */
export type AnnotationTransformMode =
  | 'none'
  | 'move'
  | 'box'
  | 'uniform'
  | 'endpoints'
  | 'vertices'

/** Whether an interaction tool remains active after one successful creation. */
export type AnnotationCreationMode = 'once' | 'continuous'

/** Interaction capabilities for one persisted tool. */
export interface AnnotationToolDefinition {
  /** Persisted canonical type. */
  type: AnnotationType
  /** Whether creation consumes a browser text selection. */
  textSelection: boolean
  /** Default tool lifecycle after an interactive creation. */
  creationMode: AnnotationCreationMode
  /** Whether selection handles may resize the annotation. */
  resizable: boolean
  /** Whether the annotation may be dragged. */
  draggable: boolean
  /** Geometry-specific transform affordance used in selection mode. */
  transformMode: AnnotationTransformMode
  /** Whether a rotation handle is meaningful for this annotation. */
  rotatable: boolean
}

/** Compatibility projection of the canonical protected Definition table. */
export const ANNOTATION_TOOL_DEFINITIONS: Readonly<Record<AnnotationType, AnnotationToolDefinition>> =
  Object.freeze(Object.fromEntries(BUILT_IN_ANNOTATION_TYPES.map((type) => {
    const definition = BUILT_IN_ANNOTATION_TYPE_DEFINITIONS[type]
    const capabilities = definition.capabilities.transform
    const transformMode: AnnotationTransformMode = capabilities.endpoints
      ? 'endpoints'
      : capabilities.vertices
        ? 'vertices'
        : capabilities.resize
          ? definition.geometry === 'box' || definition.geometry === 'text-box' ? 'box' : 'uniform'
          : capabilities.move ? 'move' : 'none'
    return [type, {
      type,
      textSelection: definition.creation.controller === 'text-selection',
      creationMode: definition.capabilities.creationMode === 'one-shot' ? 'once' : 'continuous',
      resizable: capabilities.resize,
      draggable: capabilities.move,
      transformMode,
      rotatable: capabilities.rotate
    } satisfies AnnotationToolDefinition]
  }))) as Readonly<Record<AnnotationType, AnnotationToolDefinition>>
