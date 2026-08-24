# InkLayer Core

> One PDF engine for every web framework.

[![npm](https://img.shields.io/npm/v/%40inklayer-dev%2Fcore)](https://www.npmjs.com/package/@inklayer-dev/core)
[![downloads](https://img.shields.io/npm/dm/%40inklayer-dev%2Fcore)](https://www.npmjs.com/package/@inklayer-dev/core)
[![Core CI](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml/badge.svg)](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40inklayer-dev%2Fcore)](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE)

Build a PDF viewer and annotation experience in React, Vue, Svelte, Angular,
Web Components, or plain TypeScript without rewriting document behavior for
each framework.

[Get started](https://inklayer-dev.github.io/inklayer-core/guide/getting-started) ·
[Live demo](https://inklayer-dev.github.io/inklayer-core/demo/) ·
[Documentation](https://inklayer-dev.github.io/inklayer-core/) ·
[简体中文](./README.zh-CN.md)

## Show a PDF

```bash
npm install @inklayer-dev/core
```

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const core = await createInkLayer({
  root: document.querySelector<HTMLElement>('#pdf-workspace')!,
  pageFlow: {
    container: document.querySelector<HTMLElement>('#pages')!,
    scale: 'page-width'
  }
})

await core.load({ url: '/documents/review.pdf', range: 'auto' })

// Framework unmount
await core.destroy()
```

`pageFlow` displays a virtualized, continuously scrolling PDF. Core ships with
a version-matched PDF.js Worker, so ordinary Vite and Webpack applications do
not need to download, copy, or configure `pdf.worker`.

Follow the [5-minute Viewer guide](https://inklayer-dev.github.io/inklayer-core/guide/getting-started)
for the required DOM/CSS, loading UI, password handling, and cleanup.

## What you can build

- URL, local-file, password, and chunked HTTP Range loading with progress,
  cancellation, retry, headers, and permissions;
- single, continuous, and facing page layouts with virtualized page flow;
- zoom presets, page navigation, thumbnails, outline, search, and real PDF text
  selection;
- 16 built-in annotation types with drawing, hit testing, transforms, keyboard
  behavior, comments, and tags;
- image-backed Signature and Stamp, FreeText, multi-stroke Freehand, corrected
  Free Highlight, Polygon, Polyline, and Cloud interactions;
- watermarks, browser print, secure raster print, annotated PDF, and Excel output;
- instance-level ability plugins and namespaced custom annotation types;
- structured errors, deterministic cleanup, multiple isolated viewers, and
  SSR-safe imports.

[Browse the task guides →](https://inklayer-dev.github.io/inklayer-core/guide/first-annotation)

## Core handles documents; your app handles UI

InkLayer Core is headless. It does not ship a fixed toolbar, sidebar, password
dialog, search panel, or product workflow.

| InkLayer Core | Your application or framework adapter |
|---|---|
| PDF loading, Worker, pages, scale, navigation | Layout, toolbar, route state |
| Search, TextLayer selection, page coordinates | Search field, results, selection menu |
| Annotation gestures, transforms, hit testing | Tool palette, appearance controls, panels |
| Annotation data and typed events | Server persistence, auth, sync policy |
| Watermarks, print/export composition | Buttons, filenames, uploads, download policy |

This boundary gives React, Vue, and future adapters the same behavior without
forcing them to share presentation.

## Extend one instance

Install product services with ability plugins:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [
    createLoggerCapability(appLogger),
    createAnnotationRepositoryCapability(repository)
  ]
})
```

Add a namespaced drawing tool with an Annotation Type Definition:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotationTypes: [reviewArea]
})

core.annotations.setTool('custom:acme/review-area')
```

Core still owns gestures, validation, controlled rendering, persistence, print,
PDF export, and cleanup. Plugins never receive Konva or PDF.js private objects.

[Plugin overview](https://inklayer-dev.github.io/inklayer-core/guide/plugins) ·
[Your first Capability plugin](https://inklayer-dev.github.io/inklayer-core/guide/capability-plugin) ·
[Custom annotation type](https://inklayer-dev.github.io/inklayer-core/guide/custom-annotation-type)

## Low-level Viewer

Applications that mount pages themselves can create the Viewer directly. Worker
configuration is still automatic:

```ts
import { createPdfViewerEngine } from '@inklayer-dev/core/viewer'

const viewer = createPdfViewerEngine()
```

Override `workerSrc` only for a self-hosted CSP or deployment requirement:

```ts
const viewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

## Package entries

| Entry | Purpose |
|---|---|
| `@inklayer-dev/core` | Domain model, validation, repository, shared types |
| `@inklayer-dev/core/capabilities` | `createInkLayer()` and ability plugins |
| `@inklayer-dev/core/viewer` | PDF Viewer and page flow |
| `@inklayer-dev/core/annotation` | Annotation engine and interactions |
| `@inklayer-dev/core/annotation-types` | Built-in and custom type definitions |
| `@inklayer-dev/core/import/pdfjs` | Native PDF.js annotation import |
| `@inklayer-dev/core/export/pdf` | Annotated PDF and print output |
| `@inklayer-dev/core/export/excel` | Annotation workbook output |
| `@inklayer-dev/core/style` | Scoped engine CSS |

## Compatibility

- Browser runtime: current Chromium, Firefox, and WebKit baselines
- Consumer builds: Vite, Webpack browser, and Node SSR import
- Node tooling: `^22.13.0 || >=24.0.0`

See [browser support](https://inklayer-dev.github.io/inklayer-core/browser-support),
[build-tool support](https://inklayer-dev.github.io/inklayer-core/consumer-build-matrix),
and the [public API](https://inklayer-dev.github.io/inklayer-core/api).

## Development

```bash
npm install
npm run dev       # source-backed Vanilla demo
npm run docs:dev  # VitePress documentation
npm run check     # complete release quality gate
```

Released under the [MIT License](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE).
