/**
 * @file Custom annotation catalogue for the Vanilla product demo.
 * @description Registers three application-owned semantic annotation Definitions.
 */

import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'
import { createDemoIssueMarkerDefinition, DEMO_ISSUE_MARKER_TYPE } from './issue-marker'
import { createDemoMeasurementDefinition, DEMO_MEASUREMENT_TYPE } from './measurement'
import { createDemoReviewAreaDefinition, DEMO_REVIEW_AREA_TYPE } from './review-area'

export { DEMO_ISSUE_MARKER_TYPE, DEMO_MEASUREMENT_TYPE, DEMO_REVIEW_AREA_TYPE }

/** One application-owned palette entry paired with its controlled Definition. */
export interface DemoCustomAnnotation {
  /** Namespaced persisted annotation identity. */
  readonly type: typeof DEMO_MEASUREMENT_TYPE
    | typeof DEMO_REVIEW_AREA_TYPE
    | typeof DEMO_ISSUE_MARKER_TYPE
  /** Product-facing tool name. */
  readonly label: string
  /** Short semantic purpose shown as native help text. */
  readonly description: string
  /** Existing product icon used without extending Core's icon contract. */
  readonly iconTool: 'rectangle' | 'circle' | 'note'
  /** Returns a fresh independently registered Definition. */
  readonly createDefinition: () => AnnotationTypeDefinition
}

/** Custom tools deliberately covering geometry, business areas, and point issues. */
export const DEMO_CUSTOM_ANNOTATIONS: readonly DemoCustomAnnotation[] = [
  {
    type: DEMO_MEASUREMENT_TYPE,
    label: 'Measurement',
    description: 'Calculated geometry with versioned dimensions',
    iconTool: 'rectangle',
    createDefinition: createDemoMeasurementDefinition
  },
  {
    type: DEMO_REVIEW_AREA_TYPE,
    label: 'Review area',
    description: 'Business category, severity and workflow status',
    iconTool: 'rectangle',
    createDefinition: createDemoReviewAreaDefinition
  },
  {
    type: DEMO_ISSUE_MARKER_TYPE,
    label: 'Issue marker',
    description: 'Click placement linked to an external issue code',
    iconTool: 'note',
    createDefinition: createDemoIssueMarkerDefinition
  }
]
