# Pages, zoom, and navigation

This page covers page navigation and zoom after a PDF has loaded. It starts with the Core-managed continuous Page Flow from [Getting started](./getting-started.md), then explains the separate PDF.js web Viewer modes for single-page and facing layouts.

## Use the continuous multi-page view

The `pageFlow` configured in Getting started creates one virtualized vertical surface for the whole document. After `core.load()` resolves, get its controller from the same `core` instance:

```ts
const flow = core.getPageFlow()
if (!flow) throw new Error('Load a PDF before accessing Page Flow.')
```

Page Flow creates lightweight placeholders for every page and renders only pages near the viewport. Core owns page order, Canvas, text and annotation layers, visible-page tracking, and offscreen cleanup. Your application owns the toolbar and scrollbar styling.

### Jump to a page

Page numbers shown to users normally start at 1, while Core APIs use zero-based page indexes:

```ts
const pageNumber = 8
flow.scrollToPage(pageNumber - 1, 'smooth')
```

To keep a page-number field in sync with scrolling, add `onCurrentPageChanged` to the `pageFlow` configuration used when creating `core`:

```ts
pageFlow: {
  container: pages,
  scale: 'page-width',
  onCurrentPageChanged(pageIndex) {
    pageNumberOutput.textContent = String(pageIndex + 1)
  }
}
```

### Change the zoom

```ts
await flow.setScale('page-width')
await flow.setScale('page-fit')
await flow.setScale(1.25)

zoomInButton.onclick = () => { void flow.zoomIn() }
zoomOutButton.onclick = () => { void flow.zoomOut() }
```

Available presets are `auto`, `page-actual`, `page-fit`, `page-width`, and `page-height`. Core also handles bounded Ctrl/Meta + wheel zoom and two-touch pinch zoom while keeping the gesture midpoint anchored. Set `enablePinchZoom: false` in the `pageFlow` options only when the application intentionally disables these gestures.

## Switch between single, continuous, and facing layouts

`setLayoutMode()` belongs to the PDF.js web Viewer rendering path. It requires a configured `viewer.container` and does not change the Core-managed Page Flow used above. Do not mount both renderers into the same DOM surface.

| Mode | Result |
|---|---|
| `single` | Shows one page at a time. |
| `continuous` | Scrolls through pages vertically. |
| `facing` | Shows one two-page spread at a time. |
| `continuous-facing` | Scrolls through a sequence of two-page spreads. |

When your adapter uses the PDF.js web Viewer path, connect its layout control to the selected mode:

```ts
import type { PdfViewerLayoutMode } from '@inklayer-dev/core'

async function changeLayout(mode: PdfViewerLayoutMode) {
  await core.viewer.setLayoutMode(mode)
}

await changeLayout('facing')
```

The same Viewer path uses `core.viewer.setScale()`, `zoomIn()`, and `zoomOut()` for zoom. Navigate with a zero-based page index:

```ts
core.viewer.setScale('page-width')
core.viewer.goToPage(7)
```

Start with the continuous Page Flow unless the product specifically needs single-page or facing modes.

## Show an outline

`getOutline()` returns a tree for your application to render. Internal PDF destinations are already resolved to `item.target`:

```ts
const outline = await core.viewer.getOutline()
const firstItem = outline[0]

if (firstItem?.target) {
  const flow = core.getPageFlow()
  if (flow) {
    flow.scrollToPage(firstItem.target.pageIndex, 'smooth')
  } else {
    core.viewer.goToPage(firstItem.target.pageIndex)
  }
}
```

An outline item can instead contain an external `url`. Your application decides whether and how to open external links.

## Show thumbnails

Create an object URL when a thumbnail enters the UI:

```ts
const thumbnail = await core.viewer.renderThumbnail({
  pageIndex: 0,
  maxWidth: 160
})

const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
thumbnailImage.src = thumbnailUrl
```

Release that URL only when the thumbnail item is removed or the document is replaced:

```ts
function removeThumbnail() {
  thumbnailImage.removeAttribute('src')
  URL.revokeObjectURL(thumbnailUrl)
}
```

Your application owns every object URL it creates. Revoke all remaining thumbnail URLs during document replacement and component teardown.

## Mount pages yourself

Omit `pageFlow` only when your adapter needs complete ownership of page layout. It must then render pages and attach text and annotation layers itself. See [Search and text selection](./search-and-selection.md#when-mounting-pages-yourself) for the TextLayer lifecycle. Start with Core-managed Page Flow unless you have that requirement.

For source loading and passwords, see [Load PDFs](./loading-pdfs.md). For document text, see [Search and text selection](./search-and-selection.md).
