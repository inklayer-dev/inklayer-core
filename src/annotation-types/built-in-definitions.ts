/**
 * @file Protected built-in Annotation Type Definitions.
 * @description Makes canonical built-in defaults, geometry, creation, direct
 * manipulation, and output policy available through the instance Registry.
 */

import type { AnnotationType } from '../domain/annotation'
import {
  getAnnotationAppearanceCapabilities,
  getDefaultAnnotationAppearance
} from '../domain/appearance'
import {
  ANNOTATION_TYPE_DEFINITION_API_VERSION,
  type AnnotationCreationController,
  type AnnotationGeometryKind,
  type AnnotationTypeCapabilities,
  type AnnotationTypeDefinition
} from './contracts'

/** Canonical protected Definition table installed into every Registry. */
export const BUILT_IN_ANNOTATION_TYPE_DEFINITIONS: Readonly<
Record<AnnotationType, AnnotationTypeDefinition>
> = Object.freeze({
  highlight: definition('highlight', 'text-markup', 'text-selection', 'continuous', transform(), appearance(false, true, false), 'native'),
  strikeout: definition('strikeout', 'text-markup', 'text-selection', 'continuous', transform(), appearance(true, false, false), 'native'),
  underline: definition('underline', 'text-markup', 'text-selection', 'continuous', transform(), appearance(true, false, false), 'native'),
  'free-text': definition('free-text', 'text-box', 'text-input', 'one-shot', transform(true, true), appearance(true, true, true), 'native'),
  rectangle: definition('rectangle', 'box', 'drag-box', 'one-shot', transform(true, true, true), appearance(true, true, false), 'native'),
  circle: definition('circle', 'box', 'drag-box', 'one-shot', transform(true, true), appearance(true, true, false), 'native'),
  freehand: definition('freehand', 'path', 'freehand', 'one-shot', transform(true, true, true), appearance(true, false, false), 'native'),
  'free-highlight': definition('free-highlight', 'path', 'freehand', 'one-shot', transform(true, true, true), appearance(true, false, false), 'appearance-stream'),
  signature: definition('signature', 'image', 'image-placement', 'one-shot', transform(true, true, true), appearance(true, false, false), 'appearance-stream'),
  stamp: definition('stamp', 'image', 'image-placement', 'one-shot', transform(true, true, true), appearance(true, false, false), 'native'),
  note: definition('note', 'point', 'point', 'one-shot', transform(true), appearance(true, true, true), 'native'),
  line: definition('line', 'line', 'line', 'one-shot', transform(true, true, false, true), appearance(true, false, false), 'native'),
  arrow: definition('arrow', 'line', 'line', 'one-shot', transform(true, true, false, true), appearance(true, false, false), 'appearance-stream'),
  polygon: definition('polygon', 'polyline', 'polyline', 'one-shot', transform(true, true), appearance(true, true, false), 'native'),
  polyline: definition('polyline', 'polyline', 'polyline', 'one-shot', transform(true, true, false, false, true), appearance(true, false, false), 'native'),
  cloud: definition('cloud', 'polyline', 'polyline', 'one-shot', transform(true, true), appearance(true, true, false), 'appearance-stream')
})

/** Creates one immutable protected Definition around Core-private rendering. */
function definition(
  type: AnnotationType,
  geometry: AnnotationGeometryKind,
  controller: AnnotationCreationController,
  creationMode: 'one-shot' | 'continuous',
  transformCapabilities: AnnotationTypeCapabilities['transform'],
  appearanceCapabilities: AnnotationTypeCapabilities['appearance'],
  exportStrategy: 'native' | 'appearance-stream'
): AnnotationTypeDefinition {
  return deepFreeze({
    type,
    apiVersion: ANNOTATION_TYPE_DEFINITION_API_VERSION,
    geometry,
    capabilities: {
      creation: controller,
      creationMode,
      transform: transformCapabilities,
      appearance: appearanceCapabilities,
      comments: true,
      printable: true,
      exportable: true
    },
    appearance: {
      defaults: getDefaultAnnotationAppearance(type),
      controls: getAnnotationAppearanceCapabilities(type)
    },
    creation: { controller },
    renderer: { strategy: 'core' },
    pdf: { exportStrategy }
  })
}

/** Creates canonical transform flags without relying on type-string inference. */
function transform(
  move = false,
  resize = false,
  rotate = false,
  endpoints = false,
  vertices = false
): AnnotationTypeCapabilities['transform'] {
  return { move, resize, rotate, endpoints, vertices }
}

/** Creates canonical editable Appearance component flags. */
function appearance(
  stroke: boolean,
  fill: boolean,
  text: boolean
): AnnotationTypeCapabilities['appearance'] {
  return { opacity: true, stroke, fill, text }
}

/** Freezes one JSON-like Definition graph while retaining no mutable callbacks. */
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
