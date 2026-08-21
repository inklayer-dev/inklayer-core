# Getting started

InkLayer Core is an imperative browser library. It owns PDF and annotation
behavior while your application owns layout, controls, dialogs, sidebars, and
business workflow.

## Requirements

- Node.js `20.19+` or `22.12+`
- A modern browser listed in [browser support](../browser-support.md)
- A bundler that supports ESM and Worker assets; Vite and Webpack are tested

## Install

```bash
npm install inklayer-core
```

Import the public engine CSS once in your browser application:

```ts
import 'inklayer-core/style'
```

## Create an instance

The Composition Root is the recommended entry for applications because it owns
the Viewer, Annotation Engine, optional Page Flow, Capabilities, and teardown as
one lifecycle.

```ts
import { createInkLayer } from 'inklayer-core/capabilities'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const core = await createInkLayer({
  root,
  annotation: {
    currentUser: { id: 'user-42', name: 'Ada' },
    authorLabelVisibility: 'auto'
  }
})

const documentHandle = await core.load({
  url: '/api/documents/42.pdf',
  range: 'auto',
  headers: { Authorization: `Bearer ${token}` },
  credentials: 'include'
})

console.log(documentHandle.numPages)
```

Core bundles a version-matched PDF.js Worker. Applications do not need to
download, copy, or configure a worker for an ordinary Vite or Webpack build. Use
`workerSrc` only when your Content Security Policy or deployment requires a
self-hosted URL:

```ts
const core = await createInkLayer({
  root,
  viewer: { workerSrc: '/assets/pdf.worker.min.mjs' }
})
```

## Subscribe and clean up

Subscriptions return disposers. Call them when the consuming component no
longer needs that stream, and always destroy the instance on unmount.

```ts
const stopViewer = core.viewer.subscribe(event => {
  if (event.type === 'passwordRequired') openPasswordDialog(event.request)
  if (event.type === 'error') showDocumentError(event.error)
})

const stopAnnotations = core.annotations.subscribe(event => {
  if (event.type === 'selectionChanged') updateInspector(event.selection)
})

async function unmount() {
  stopViewer()
  stopAnnotations()
  await core.destroy()
}
```

## Choose the next guide

- [Framework integration](./framework-integration.md) explains component and DOM ownership.
- [Viewer and page flow](./viewer-and-pages.md) covers loading, rendering, zoom, search, and selection.
- [Annotations](./annotations.md) covers tools, appearance, persistence, and custom types.
- [Output and security](./output-and-security.md) covers print, export, watermarks, and protected PDFs.
- [Public API](../api.md) is the complete contract reference.
