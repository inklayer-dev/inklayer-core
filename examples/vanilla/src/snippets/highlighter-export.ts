/**
 * @file Minimal Keyword Highlighter PDF export snippet.
 * @description Converts reviewed matches to standard Highlight annotations before PDF export.
 */

import { downloadBlob } from '@inklayer-dev/core'
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'
import { createKeywordHighlighter } from '@inklayer-dev/core/highlighter'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
if (root === null || pages === null) throw new Error('Highlighter hosts were not found.')

const response = await fetch('/documents/review.pdf')
const sourcePdfBytes = new Uint8Array(await response.arrayBuffer())
const core = await createInkLayer({ root, pageFlow: { container: pages } })
await core.load({ data: sourcePdfBytes })

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})
highlighter.setRules([{
  id: 'review-terms',
  label: 'Review terms',
  terms: ['liability', 'termination', 'penalty'],
  color: '#f4b860'
}])
await highlighter.scan()

const applyResult = await highlighter.applyMatches()
const output = await buildAnnotatedPdf(
  sourcePdfBytes,
  core.annotations.repository.getAll(),
  { annotationTypes: core.annotationTypes }
)

downloadBlob({
  content: output,
  filename: 'inklayer-highlighted.pdf',
  mimeType: 'application/pdf'
})

console.log('Exported highlights', applyResult.createdAnnotationIds)
