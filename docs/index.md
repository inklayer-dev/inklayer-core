---
layout: home

hero:
  name: InkLayer Core
  text: One PDF engine for every web framework
  tagline: Build your product UI. Let Core handle PDF viewing, annotations, page flow, print, and export.
  image:
    src: /hero-engine.svg
    alt: PDF document with a text highlight and a selected freehand annotation.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Read the API
      link: /api
    - theme: alt
      text: Demo
      link: 'https://inklayer-dev.github.io/inklayer-core/demo/'

features:
  - title: Framework-independent
    details: Use the same imperative engines from React, Vue, Svelte, Angular, Web Components, or plain TypeScript.
    link: /guide/framework-integration
  - title: Complete document behavior
    details: Loading, Range requests, passwords, search, selection, page flow, zoom, watermarks, print, and export live in Core.
    link: /guide/viewer-and-pages
  - title: Extensible annotations
    details: Use sixteen built-in tools or register your own drawing type with save, print, and PDF export support.
    link: /guide/plugins
  - title: Production lifecycle
    details: Safe cancellation and cleanup, structured errors, isolated viewers, SSR-safe imports, and a bundled PDF.js Worker.
    link: /error-recovery
---

## Start with a working Viewer

Install the package, give Core a scroll container, and load a PDF:

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const core = await createInkLayer({
  root: workspaceElement,
  pageFlow: { container: pagesElement }
})
await core.load({ url: '/documents/review.pdf', range: 'auto' })
```

The [5-minute guide](/guide/getting-started) adds the required DOM/CSS, loading
state, password handling, and cleanup. InkLayer Core is headless: it owns PDF
and annotation behavior while your framework owns the toolbar, panels, and
workflow.

## What do you want to build?

| I want to… | Go to |
|---|---|
| See every feature before writing code | [Try the live demo](/guide/try-demo) |
| Display a scrolling, zoomable PDF | [Build a viewer in 5 minutes](/guide/getting-started) |
| Draw a rectangle or create a text highlight | [Create your first annotation](/guide/first-annotation) |
| Load files, passwords, authenticated URLs, or large PDFs | [Load PDFs](/guide/loading-pdfs) |
| Add page navigation, zoom, thumbnails, or an outline | [Pages, zoom, and navigation](/guide/viewer-and-pages) |
| Search and select real PDF text | [Search and text selection](/guide/search-and-selection) |
| Save annotations to a backend and restore them | [Save and restore annotations](/guide/persistence) |
| Print, export, or add a watermark | [Print, export, and watermarks](/guide/output-and-security) |
| Integrate Core with React, Vue, or another framework | [Framework integration](/guide/framework-integration) |
| Add a product service or custom drawing tool | [Plugin overview](/guide/plugins) |

## Extend only when you need to

Ability plugins connect logging, persistence, text input, print, download, and
other product services. Annotation Type Definitions add namespaced drawing
tools. Both stay inside one instance, while Core continues to own validation,
interaction, persistence, print, export, and cleanup.

[Build your first plugin →](/guide/capability-plugin)
