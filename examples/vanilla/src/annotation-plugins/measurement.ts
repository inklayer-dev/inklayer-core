/**
 * @file Example application-owned annotation type plugin.
 * @description Demonstrates a custom Definition without importing Konva or private Core APIs.
 */

import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

/** Stable custom identity persisted by the Measurement plugin. */
export const DEMO_MEASUREMENT_TYPE = 'custom:demo/measurement' as const

/** Creates a fresh Definition that can be registered into one Core instance. */
export function createDemoMeasurementDefinition(): AnnotationTypeDefinition {
  return {
    type: DEMO_MEASUREMENT_TYPE,
    apiVersion: 1,
    geometry: 'box',
    data: {
      supportedSchemaVersions: [1],
      /** Validates the independently versioned measurement payload. */
      validate(payload) {
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          throw new Error('Measurement payload must be an object.')
        }
      }
    },
    capabilities: {
      creation: 'drag-box',
      creationMode: 'one-shot',
      transform: {
        move: true, resize: true, rotate: false, endpoints: false, vertices: false
      },
      appearance: { opacity: true, stroke: true, fill: true, text: false },
      comments: true,
      printable: true,
      exportable: true
    },
    appearance: {
      defaults: {
        opacity: 1,
        stroke: {
          color: '#8b5cf6', width: 2, opacity: 1, dash: [6, 4], dashOffset: 0,
          lineCap: 'butt', lineJoin: 'round'
        },
        fill: { color: '#c4b5fd', opacity: 0.2 },
        text: null
      }
    },
    creation: {
      controller: 'drag-box',
      /** Derives semantic dimensions from pointer-created page geometry. */
      initialize(input) {
        return {
          bounds: { ...input.bounds },
          content: { text: 'Measurement box' },
          typeData: measurementData(input.bounds.width, input.bounds.height)
        }
      }
    },
    interaction: {
      /** Keeps the plugin payload synchronized after a resize. */
      reduceTransform(_annotation, input) {
        return {
          bounds: { ...input.bounds },
          typeData: measurementData(input.bounds.width, input.bounds.height)
        }
      }
    },
    renderer: {
      /** Projects the custom type into Core-controlled renderer-neutral primitives. */
      render(annotation) {
        const { x, y, width, height } = annotation.bounds
        const stroke = annotation.appearance.stroke ?? {
          color: '#8b5cf6', width: 2, opacity: 1, dash: [6, 4]
        }
        return {
          children: [
            {
              kind: 'rectangle', bounds: { x, y, width, height },
              stroke: { ...stroke },
              ...(annotation.appearance.fill === null
                ? {}
                : { fill: { ...annotation.appearance.fill } })
            },
            {
              kind: 'line',
              points: [x + 8, y + height / 2, x + width - 8, y + height / 2],
              stroke: { ...stroke, dash: [] }
            },
            {
              kind: 'line',
              points: [x + 8, y + height / 2 - 5, x + 8, y + height / 2 + 5],
              stroke: { ...stroke, dash: [] }
            },
            {
              kind: 'line',
              points: [x + width - 8, y + height / 2 - 5, x + width - 8, y + height / 2 + 5],
              stroke: { ...stroke, dash: [] }
            }
          ]
        }
      }
    },
    pdf: { exportStrategy: 'appearance-stream' }
  }
}

/** Builds the plugin-owned semantic payload for one page-space box. */
function measurementData(width: number, height: number) {
  return {
    schemaVersion: 1,
    payload: { width, height, unit: 'pt' }
  } as const
}
