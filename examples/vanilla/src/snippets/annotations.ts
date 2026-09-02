/**
 * @file Minimal annotation snippet shown by the Vanilla demo.
 * @description Opens one PDF and connects an application-owned Rectangle button.
 */

import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
const rectangle = document.querySelector<HTMLButtonElement>('#rectangle')
if (root === null || pages === null || rectangle === null) {
  throw new Error('Annotation hosts were not found.')
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

await core.load({ url: '/documents/review.pdf' })

rectangle.onclick = () => {
  core.annotations.setTool('rectangle')
}

// Core owns drawing and selection; your application owns the button.
// On unmount: await core.destroy()
