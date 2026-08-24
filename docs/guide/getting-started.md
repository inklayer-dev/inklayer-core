# Build a viewer in 5 minutes

At the end of this page, your browser will show a PDF with continuous scrolling, selectable text, annotations, and built-in zoom gestures. You provide two DOM elements and a PDF URL; Core creates and cleans up the document surface.

> InkLayer Core is headless: it does not ship a toolbar or sidebar. You build those controls in your framework and call the same methods shown here.

## Requirements

- Node.js `^22.13.0` or `>=24.0.0`
- A Vite or Webpack browser application
- A PDF URL served by your application

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

Override the Worker URL only when a self-hosted Content Security Policy or deployment requires it:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  viewer: { workerSrc: '/assets/pdf.worker.min.mjs' }
})
```

## Show loading and password UI

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

Always await `destroy()` before reusing an owned host when practical. It releases the document, Worker lease, page surfaces, listeners, plugins, and pending work.

## Where to go next

| I want to… | Continue with |
|---|---|
| Draw a rectangle or create a text highlight | [Create your first annotation](./first-annotation.md) |
| Load files, passwords, authenticated URLs, or large PDFs | [Load PDFs](./loading-pdfs.md) |
| Add zoom, page navigation, thumbnails, or an outline | [Pages, zoom, and navigation](./viewer-and-pages.md) |
| Search or select PDF text | [Search and text selection](./search-and-selection.md) |
| Save annotations to my backend | [Save and restore annotations](./persistence.md) |
| Integrate this lifecycle into React, Vue, or another framework | [Framework integration](./framework-integration.md) |
| Add product services or a custom drawing tool | [Plugin overview](./plugins.md) |

## Terms you will see later

- `createInkLayer()` creates the Viewer, annotation engine, optional Page Flow, and installed plugins as one instance.
- Page Flow is Core's optional single/continuous/facing page layout and virtualization.
- The Repository is the single data source for saved annotations.
- A Capability is an instance-level ability plugin, such as logging, persistence, text input, print, or download.

You do not need these architecture terms to complete the tutorials; they become useful when building an adapter or plugin.
