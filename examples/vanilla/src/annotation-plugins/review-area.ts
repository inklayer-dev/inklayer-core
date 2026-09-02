/**
 * @file Semantic review-area custom annotation for the Vanilla demo.
 * @description Demonstrates a business-owned drag region with versioned review metadata.
 */

import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

/** Stable custom identity persisted for review areas. */
export const DEMO_REVIEW_AREA_TYPE = 'custom:demo/review-area' as const

/** Creates a review-area Definition using only controlled exportable primitives. */
export function createDemoReviewAreaDefinition(): AnnotationTypeDefinition {
  return {
    type: DEMO_REVIEW_AREA_TYPE,
    apiVersion: 1,
    geometry: 'box',
    data: {
      supportedSchemaVersions: [1],
      /** Accepts only the object payload shape owned by this example. */
      validate(payload) {
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          throw new Error('Review area payload must be an object.')
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
          color: '#f59e0b', width: 2, opacity: 1, dash: [], dashOffset: 0,
          lineCap: 'butt', lineJoin: 'round'
        },
        fill: { color: '#fbbf24', opacity: 0.18 },
        text: null
      }
    },
    creation: {
      controller: 'drag-box',
      /** Adds application-owned workflow state to the canonical annotation. */
      initialize({ bounds }) {
        return {
          bounds,
          content: { text: 'High-risk review area' },
          typeData: {
            schemaVersion: 1,
            payload: { category: 'legal-risk', severity: 'high', status: 'pending' }
          }
        }
      }
    },
    renderer: {
      /** Renders a double-frame review region without renderer-specific objects. */
      render(annotation) {
        const { x, y, width, height } = annotation.bounds
        const stroke = annotation.appearance.stroke ?? {
          color: '#f59e0b', width: 2, opacity: 1, dash: []
        }
        return {
          children: [
            {
              kind: 'rectangle', bounds: { x, y, width, height }, stroke,
              ...(annotation.appearance.fill === null ? {} : { fill: annotation.appearance.fill })
            },
            {
              kind: 'rectangle',
              bounds: {
                x: x + 5, y: y + 5,
                width: Math.max(0, width - 10), height: Math.max(0, height - 10)
              },
              stroke: { ...stroke, width: 1, opacity: 0.65, dash: [4, 3] }
            }
          ]
        }
      }
    },
    pdf: { exportStrategy: 'appearance-stream' }
  }
}
