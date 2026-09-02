/**
 * @file Semantic issue-marker custom annotation for the Vanilla demo.
 * @description Demonstrates click placement and versioned external-review metadata.
 */

import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

/** Stable custom identity persisted for issue markers. */
export const DEMO_ISSUE_MARKER_TYPE = 'custom:demo/issue-marker' as const

/** Creates a fixed-size point Definition from controlled ellipse and line primitives. */
export function createDemoIssueMarkerDefinition(): AnnotationTypeDefinition {
  return {
    type: DEMO_ISSUE_MARKER_TYPE,
    apiVersion: 1,
    geometry: 'point',
    data: {
      supportedSchemaVersions: [1],
      /** Accepts only an object payload owned by the issue workflow. */
      validate(payload) {
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          throw new Error('Issue marker payload must be an object.')
        }
      }
    },
    capabilities: {
      creation: 'point',
      creationMode: 'continuous',
      transform: {
        move: true, resize: false, rotate: false, endpoints: false, vertices: false
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
          color: '#ffffff', width: 2, opacity: 1, dash: [], dashOffset: 0,
          lineCap: 'round', lineJoin: 'round'
        },
        fill: { color: '#ef4444', opacity: 1 },
        text: null
      }
    },
    creation: {
      controller: 'point',
      /** Persists a stable application issue code alongside page geometry. */
      initialize({ bounds }) {
        return {
          bounds,
          content: { text: 'Missing signature' },
          typeData: {
            schemaVersion: 1,
            payload: { code: 'MISSING_SIGNATURE', severity: 'warning', resolved: false }
          }
        }
      }
    },
    renderer: {
      /** Draws an alert marker whose PDF appearance uses supported primitives. */
      render(annotation) {
        const { x, y, width, height } = annotation.bounds
        const stroke = annotation.appearance.stroke ?? {
          color: '#ffffff', width: 2, opacity: 1, dash: [], lineCap: 'round' as const
        }
        const fill = annotation.appearance.fill ?? { color: '#ef4444', opacity: 1 }
        const centerX = x + width / 2
        return {
          children: [
            { kind: 'ellipse', bounds: { x, y, width, height }, stroke, fill },
            {
              kind: 'line',
              points: [centerX, y + 5, centerX, y + height - 8],
              stroke: { ...stroke, width: 2.5 }
            },
            {
              kind: 'ellipse',
              bounds: { x: centerX - 1.5, y: y + height - 5, width: 3, height: 3 },
              fill: { color: stroke.color, opacity: 1 }
            }
          ]
        }
      }
    },
    pdf: { exportStrategy: 'appearance-stream' }
  }
}
