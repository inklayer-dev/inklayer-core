/**
 * @file Type-checked custom-annotation registration example shown by the Vanilla demo.
 * @description Registers three application Definitions while Core owns gestures and output.
 */

import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'
import { createDemoIssueMarkerDefinition } from '../annotation-plugins/issue-marker'
import { createDemoMeasurementDefinition } from '../annotation-plugins/measurement'
import { createDemoReviewAreaDefinition } from '../annotation-plugins/review-area'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
const reviewArea = document.querySelector<HTMLButtonElement>('#review-area')
if (root === null || pages === null || reviewArea === null) {
  throw new Error('The custom annotation workspace is missing.')
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotationTypes: [
    createDemoMeasurementDefinition(),
    createDemoReviewAreaDefinition(),
    createDemoIssueMarkerDefinition()
  ]
})
await core.load({ url: '/documents/review.pdf' })

reviewArea.addEventListener('click', () => {
  core.annotations.setTool('custom:demo/review-area')
})
