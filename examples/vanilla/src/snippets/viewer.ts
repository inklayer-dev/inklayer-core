/**
 * @file Minimal Viewer snippet shown by the Vanilla demo.
 * @description Opens one PDF in Core-owned continuous Page Flow hosts.
 */

import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
if (root === null || pages === null) throw new Error('Viewer hosts were not found.')

const core = await createInkLayer({
  root,
  pageFlow: {
    container: pages,
    scale: 'page-width'
  }
})

const documentHandle = await core.load({
  url: '/documents/review.pdf',
  range: 'auto'
})

console.log(`Opened ${documentHandle.numPages} pages`)

// On unmount: await core.destroy()
