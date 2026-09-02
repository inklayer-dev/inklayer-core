/**
 * @file Minimal Watermark snippet shown by the Vanilla demo.
 * @description Applies one watermark policy before Continuous pages render.
 */

import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
if (root === null || pages === null) throw new Error('Watermark hosts were not found.')

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

core.viewer.setWatermark({
  text: 'CONFIDENTIAL · ACME',
  layout: 'repeated',
  opacity: 0.12,
  rotation: -28,
  targets: {
    viewer: true,
    print: true,
    export: true,
    thumbnails: false
  }
})

await core.load({ url: '/documents/review.pdf' })

// On unmount: await core.destroy()
