# InkLayer Core

> One PDF engine for every web framework.

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/%40inklayer-dev%2Fcore)](https://www.npmjs.com/package/@inklayer-dev/core) [![Core CI](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml/badge.svg)](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/%40inklayer-dev%2Fcore)](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE)

InkLayer Core provides framework-independent PDF viewing and annotation behavior. Use it with React, Vue, another web framework, or plain TypeScript while your application keeps control of the toolbar, panels, and workflow.

[Getting started](https://inklayer-dev.github.io/inklayer-core/guide/getting-started) · [Live demo](https://inklayer-dev.github.io/inklayer-core/demo/) · [Documentation](https://inklayer-dev.github.io/inklayer-core/)

## Minimal Viewer

Install the package:

```bash
npm install @inklayer-dev/core
```

Provide a root element and a scroll container:

```html
<div id="pdf-workspace">
  <div id="pages"></div>
</div>
```

Give the scroll container an explicit size:

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

Create Core and load a PDF:

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

await core.load({ url: '/documents/review.pdf', range: 'auto' })
```

This creates a virtualized, continuously scrolling Viewer with built-in zoom gestures. Call `await core.destroy()` when the page or framework component is unmounted. Text selection, annotation tools, search controls, and other product actions are enabled by your application as needed.

Core ships with a version-matched PDF.js Worker. Ordinary Vite and Webpack applications do not need to download, copy, or configure `pdf.worker`.

[Continue with the complete tutorial →](https://inklayer-dev.github.io/inklayer-core/guide/getting-started)

## What Core provides

- Load PDFs from URLs or local bytes, including HTTP Range requests, passwords, progress, cancellation, and retry.
- Display single, continuous, or facing pages with virtual rendering, zoom, navigation, thumbnails, and outlines.
- Search PDF text, highlight results, and turn real text selections into markup annotations.
- Create and edit 16 built-in annotation types, including text markup, shapes, freehand drawing, notes, stamps, and signatures.
- Manage serializable annotation data with authors, comments, references, appearance, and client-side permission rules.
- Add watermarks and generate printable PDFs, annotated PDFs, secure raster print output, or annotation workbooks.
- Run multiple isolated instances, report structured errors, release resources deterministically, and import packages safely during SSR.

[Create your first annotation →](https://inklayer-dev.github.io/inklayer-core/guide/first-annotation)

## Core handles documents; your application handles UI

InkLayer Core is headless: it provides the document engine and interaction APIs, not a finished toolbar or application shell.

| InkLayer Core | Your application or framework adapter |
| --- | --- |
| PDF loading, pages, layouts, zoom, and navigation | Viewer layout, controls, routing, and loading states |
| Search, outlines, thumbnails, and text-selection data | Search field, result list, sidebar, and selection menu |
| Annotation tools, gestures, transforms, and canonical data | Toolbar, appearance controls, comment panels, and dialogs |
| Client-side author and permission checks | Trusted identity and authoritative backend permission checks |
| Repository operations and change events | Server persistence, synchronization, and conflict handling |
| Watermark, print, PDF, and Excel generation APIs | Buttons, filenames, uploads, downloads, and invocation timing |

See [Core boundary](https://inklayer-dev.github.io/inklayer-core/core-boundary) for the complete responsibility model.

## Choose your integration

- [Vanilla JavaScript](https://inklayer-dev.github.io/inklayer-core/guide/framework-integration): build a Viewer with navigation, thumbnails, a toolbar, and an annotation list.
- [Vue](https://inklayer-dev.github.io/inklayer-core/guide/framework-vue): keep one Core instance in the component and connect it to Vue state and lifecycle.
- [React](https://inklayer-dev.github.io/inklayer-core/guide/framework-react): keep one Core instance in a ref and connect it to React state and effects.

The same Core APIs can also be used from Svelte, Angular, Web Components, or another client framework.

## Extend Core when needed

[Capability plugins](https://inklayer-dev.github.io/inklayer-core/guide/capability-plugin) connect one instance to application services such as logging, authenticated PDF requests, text input, annotation storage, printing, and downloads. Some services are called automatically by Core; print and download services are called explicitly by the application.

[Custom annotation types](https://inklayer-dev.github.io/inklayer-core/guide/custom-annotation-type) add namespaced tools with their own data validation, creation behavior, renderer, and output support. Extensions work through public contracts and do not receive mutable Konva nodes or PDF.js private state.

## Low-level Viewer

Applications that mount pages themselves can create the Viewer directly. Worker configuration remains automatic:

```ts
import { createPdfViewerEngine } from '@inklayer-dev/core/viewer'

const viewer = createPdfViewerEngine()
```

Override `workerSrc` only when a self-hosted CSP or deployment policy requires it:

```ts
const viewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

## Package entries

| Entry | Purpose |
| --- | --- |
| `@inklayer-dev/core` | Annotation data, validation, Repository, browser helpers, and shared types |
| `@inklayer-dev/core/capabilities` | `createInkLayer()` and Capability plugins |
| `@inklayer-dev/core/viewer` | PDF Viewer and Page Flow |
| `@inklayer-dev/core/annotation` | Annotation engine and interactions |
| `@inklayer-dev/core/annotation-types` | Built-in and custom annotation type definitions |
| `@inklayer-dev/core/import/pdfjs` | Native PDF annotation import through PDF.js |
| `@inklayer-dev/core/export/pdf` | Annotated PDF and printable PDF generation |
| `@inklayer-dev/core/export/excel` | Annotation workbook generation |
| `@inklayer-dev/core/style` | Scoped engine CSS |

## Compatibility

- Browser engines: tested with current Playwright builds of Chromium, Firefox, and WebKit
- Application builds: Vite, Webpack browser builds, and Node SSR imports
- Node tooling: `^22.13.0 || >=24.0.0`

Embedded WebViews require separate verification. See [browser support](https://inklayer-dev.github.io/inklayer-core/browser-support) and the [public API](https://inklayer-dev.github.io/inklayer-core/api).

## Development

```bash
npm install
npm run dev       # source-backed Vanilla example
npm run docs:dev  # VitePress documentation
npm run check     # complete release quality gate
```

Released under the [MIT License](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE).
