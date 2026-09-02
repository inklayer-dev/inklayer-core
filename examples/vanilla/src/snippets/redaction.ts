/**
 * @file Type-checked minimal secure keyword-redaction example shown by the Vanilla demo.
 * @description Scans prepared policy rules and exports reviewed ranges as an image-only PDF.
 */

import {
  buildSecureRedactedPdf,
  createInkLayer,
  downloadBlob
} from '@inklayer-dev/core'
import { createKeywordHighlighter } from '@inklayer-dev/core/highlighter'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
if (root === null || pages === null) throw new Error('The PDF workspace is missing.')

const core = await createInkLayer({ root, pageFlow: { container: pages } })
await core.load({ url: '/documents/contract.pdf' })

const highlighter = createKeywordHighlighter({ viewer: core.viewer, annotations: core.annotations })
highlighter.setRules([{
  id: 'sensitive-values',
  label: 'Sensitive values',
  terms: ['confidential'],
  patterns: [{
    id: 'account-number',
    kind: 'regex',
    source: '\\b\\d{4}[ -]\\d{4}[ -]\\d{4}[ -]\\d{4}\\b',
    flags: 'u'
  }],
  color: '#facc15' // Review preview only; secure output always uses opaque black boxes.
}])
await highlighter.scan()

const included = highlighter.getSnapshot().matches
  .filter((match) => match.reviewState === 'included')
const bytes = await buildSecureRedactedPdf({
  viewer: core.viewer,
  ranges: included.map((match) => match.range)
})
downloadBlob({
  content: bytes,
  filename: 'contract-redacted.pdf',
  mimeType: 'application/pdf'
})
