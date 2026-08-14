/**
 * @file Annotation Engine tool contracts.
 * @description Separates transient selection from persisted annotation types and
 * records interaction capabilities used by framework-neutral UI consumers.
 */

import type { AnnotationType } from '../domain/annotation'

/** Transient and persisted tools selectable in the Annotation Engine. */
export type AnnotationTool = 'select' | 'text-select' | AnnotationType

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

/** Complete verified tool capability table. */
export const ANNOTATION_TOOL_DEFINITIONS: Readonly<Record<AnnotationType, AnnotationToolDefinition>> = {
  highlight: { type: 'highlight', textSelection: true, creationMode: 'continuous', resizable: false, draggable: false, transformMode: 'none', rotatable: false },
  strikeout: { type: 'strikeout', textSelection: true, creationMode: 'continuous', resizable: false, draggable: false, transformMode: 'none', rotatable: false },
  underline: { type: 'underline', textSelection: true, creationMode: 'continuous', resizable: false, draggable: false, transformMode: 'none', rotatable: false },
  'free-text': { type: 'free-text', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'box', rotatable: false },
  rectangle: { type: 'rectangle', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'box', rotatable: true },
  circle: { type: 'circle', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'box', rotatable: false },
  freehand: { type: 'freehand', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'uniform', rotatable: true },
  'free-highlight': { type: 'free-highlight', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'uniform', rotatable: true },
  signature: { type: 'signature', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'uniform', rotatable: true },
  stamp: { type: 'stamp', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'uniform', rotatable: true },
  note: { type: 'note', textSelection: false, creationMode: 'once', resizable: false, draggable: true, transformMode: 'move', rotatable: false },
  line: { type: 'line', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'endpoints', rotatable: false },
  arrow: { type: 'arrow', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'endpoints', rotatable: false },
  polygon: { type: 'polygon', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'vertices', rotatable: false },
  polyline: { type: 'polyline', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'vertices', rotatable: false },
  cloud: { type: 'cloud', textSelection: false, creationMode: 'once', resizable: true, draggable: true, transformMode: 'uniform', rotatable: false }
}
