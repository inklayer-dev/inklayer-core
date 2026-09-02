/**
 * @file Minimal Keyword Highlighter snippet shown by the Vanilla demo.
 * @description Scans application-prepared terms and patterns after loading a PDF.
 */

import { createInkLayer } from '@inklayer-dev/core/capabilities'
import { createKeywordHighlighter } from '@inklayer-dev/core/highlighter'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
if (root === null || pages === null) throw new Error('Highlighter hosts were not found.')

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

await core.load({ url: '/documents/review.pdf' })

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})

highlighter.setRules([
  {
    id: 'review-terms',
    label: 'Review terms',
    terms: ['liability', 'termination', 'penalty'],
    color: '#f4b860'
  },
  {
    id: 'structured-values',
    label: 'Dates and amounts',
    color: '#8b5cf6',
    patterns: [{
      id: 'iso-date',
      kind: 'regex',
      source: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
      flags: 'u'
    }]
  }
])

await highlighter.scan()

const firstMatch = highlighter.getSnapshot().matches[0]
if (firstMatch) highlighter.activateMatch(firstMatch.id)

// On unmount: highlighter.destroy(); await core.destroy()
