/**
 * @file Type-checked multi-page Stamp & Sign snippet shown by the Vanilla demo.
 * @description Creates one bottom-right image Stamp on each selected PDF page.
 */

import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
const stampImage = document.querySelector<HTMLImageElement>('#approved-stamp')
if (root === null || pages === null || stampImage === null) {
  throw new Error('Stamp & Sign hosts were not found.')
}

const core = await createInkLayer({ root, pageFlow: { container: pages } })
const handle = await core.load({ url: '/documents/contract.pdf' })
const pageIndexes = [0, 1, 2] // Pages 1-3 selected by your application UI.

for (const pageIndex of pageIndexes) {
  const page = await handle.document.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const width = 140
  const height = 60
  const margin = 24
  core.annotations.createAnnotation({
    type: 'stamp',
    pageIndex,
    bounds: {
      x: viewport.width - width - margin,
      y: viewport.height - height - margin,
      width,
      height
    },
    content: { text: 'Approved stamp', image: stampImage.src },
    appearance: { opacity: 0.65 }
  })
}

// Export with buildAnnotatedPdf(sourceBytes, core.annotations.getAnnotations()).
