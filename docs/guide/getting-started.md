# Getting started

This page sets up a PDF with continuous scrolling and built-in zoom gestures. Activate text selection in [Search and text selection](./search-and-selection.md), and activate annotation tools in [Create your first annotation](./first-annotation.md).

Provide two DOM elements and a PDF URL; Core creates and cleans up the document surface.

## Requirements

- Node.js `^22.13.0` or `>=24.0.0`
- A Vite or Webpack browser application
- A PDF URL accessible to the browser

## Install

```bash
npm install @inklayer-dev/core
```

## Add the Viewer hosts

```html
<div id="pdf-workspace">
  <div id="pages"></div>
</div>
```

Give the scroll container a real size. The rest of the application layout remains yours:

```css
html, body, #pdf-workspace {
  height: 100%;
  margin: 0;
}

#pages {
  height: 100%;
  overflow: auto;
  background: #f2f4f7;
}
```

## Load and display a PDF

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLElement>('#pages')!

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
```

You should now see a continuous PDF. `pageFlow` mounts and virtualizes page Canvas, TextLayer, and annotation surfaces inside `#pages`. `range: 'auto'` uses HTTP byte chunks for large files when the server supports them.

Core already includes a version-matched PDF.js Worker. Ordinary Vite and Webpack applications do not need to download, copy, or configure `pdf.worker`.

Override the Worker URL only when your Content Security Policy or deployment requires a self-hosted Worker:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  viewer: { workerSrc: '/assets/pdf.worker.min.mjs' }
})
```

## Show loading progress and password UI

Core reports state; your application decides how it looks:

```ts
const stopViewer = core.viewer.subscribe(event => {
  if (event.type === 'loadProgress') {
    updateLoadingUI(event.progress)
  }
  if (event.type === 'passwordRequired') {
    openPasswordDialog(event.request)
  }
  if (event.type === 'error') {
    showDocumentError(event.error)
  }
})
```

See [Load PDFs](./loading-pdfs.md) for local files, headers, password submission, progress, cancellation, and retry.

## Clean up on unmount

```ts
async function unmount() {
  stopViewer()
  await core.destroy()
}
```

When practical, await `destroy()` before reusing a host owned by Core. It releases the document, Worker resources, page surfaces, listeners, plugins, and pending work.
