/**
 * @file Minimal manual Stamp & Sign snippet shown by the Vanilla demo.
 * @description Prepares one application image, opacity, and Core one-shot placement tool.
 */

import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')
const pages = document.querySelector<HTMLDivElement>('#pages')
const stampImage = document.querySelector<HTMLImageElement>('#approved-stamp')
const placeStamp = document.querySelector<HTMLButtonElement>('#place-stamp')
if (root === null || pages === null || stampImage === null || placeStamp === null) {
  throw new Error('Stamp & Sign hosts were not found.')
}

const core = await createInkLayer({ root, pageFlow: { container: pages } })
await core.load({ url: '/documents/contract.pdf' })

core.annotations.setImageAsset('stamp', {
  image: stampImage.src,
  width: 140,
  height: 60,
  text: 'Approved stamp'
})
core.annotations.setToolAppearance('stamp', { opacity: 0.8 })

placeStamp.onclick = () => {
  core.annotations.setTool('stamp')
  // The next PDF click places a selectable, resizable Stamp annotation.
}

// Image signatures use setImageAsset('signature', ...) and setTool('signature').
