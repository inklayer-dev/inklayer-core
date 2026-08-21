/**
 * @file Custom annotation Definition test factory.
 * @description Produces one complete controlled Definition for focused tests.
 */

import type {
  AnnotationTypeDefinition,
  AnnotationTypeDataCodec
} from '../../src/annotation-types/contracts'
import type { CustomAnnotationType } from '../../src/domain/annotation'
import { getDefaultAnnotationAppearance } from '../../src/domain/appearance'

/** Creates one complete box Definition with optional codec and overrides. */
export function createTestAnnotationTypeDefinition(
  type: CustomAnnotationType = 'custom:test/box',
  data?: AnnotationTypeDataCodec,
  overrides: Partial<AnnotationTypeDefinition> = {}
): AnnotationTypeDefinition {
  return {
    type,
    apiVersion: 1,
    geometry: 'box',
    capabilities: {
      creation: 'drag-box',
      creationMode: 'one-shot',
      transform: {
        move: true, resize: true, rotate: false, endpoints: false, vertices: false
      },
      appearance: { opacity: true, stroke: true, fill: true, text: false },
      comments: true,
      printable: false,
      exportable: false
    },
    ...(data === undefined ? {} : { data }),
    appearance: { defaults: getDefaultAnnotationAppearance('rectangle') },
    creation: { controller: 'drag-box' },
    renderer: {
      /** Projects the fixture as one controlled rectangle. */
      render(annotation) {
        return {
          children: [{
            kind: 'rectangle',
            bounds: { ...annotation.bounds },
            ...(annotation.appearance.stroke === null
              ? {}
              : { stroke: { ...annotation.appearance.stroke } }),
            ...(annotation.appearance.fill === null
              ? {}
              : { fill: { ...annotation.appearance.fill } })
          }]
        }
      }
    },
    ...overrides
  }
}
