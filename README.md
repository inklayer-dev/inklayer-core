# InkLayer Core

InkLayer Core is the framework-independent PDF.js and Konva engine shared by
InkLayer's React, Vue, and future browser integrations.

The implementation includes the canonical annotation domain, validation,
collaboration functions, memory repository, verified legacy compatibility, PDF
Viewer Engine with thumbnails, outline, search, and TextLayer selection, Konva
Annotation Engine, native PDF.js import, content-only PDF/Excel exporters, scoped
engine styles, and browser platform helpers.

## Viewer Engine

The Viewer factory is safe to import during Node and SSR builds. PDF.js runtime
modules are loaded only when `load()` is called.

```ts
import { createPdfViewerEngine } from 'inklayer-core/viewer'

const viewer = createPdfViewerEngine()

const document = await viewer.load({ url: '/documents/example.pdf' })
console.log(document.numPages)
const outline = await viewer.getOutline()
const results = await viewer.search('contract')
const thumbnail = await viewer.renderThumbnail({ pageIndex: 0, maxWidth: 160 })
await viewer.destroy()
```

Password-protected documents pause with a typed `passwordRequired` event and
resume through `submitPassword`. Core also exposes PDF permission flags,
single/continuous/facing layout commands, TextLayer search highlighting,
retained same/cross-page selection geometry, and a transient Canvas/PDF watermark
policy. Use `text-select` for selection-first menus and `select` for direct
annotation manipulation.
`createPdfPageFlow` supplies a Core-owned virtual continuous surface with lazy
PDF Canvas, TextLayer, and Annotation page attachment.
Viewer and PageFlow scaling supports numeric percentages plus automatic, actual,
page-fit, page-width, and page-height modes. Web Viewer containers also receive
Core-owned midpoint-preserving touch and Ctrl/Meta+wheel pinch zoom.

Core includes a version-matched PDF.js worker in its package, so applications do
not need to download, copy, or configure one. Advanced deployments may override
`workerSrc` for self-hosting or a custom Content Security Policy. Active Viewer
instances must share the same resolved worker URL; conflicting overrides fail
with `PDF_WORKER_CONFLICT`.

URL sources accept `range: true`, `false`, or `'auto'`. Automatic mode falls
back only when the server explicitly lacks byte-range support; HTTP and network
failures remain structured `PDF_RANGE_FAILED` errors.
Viewer snapshots expose the current `progress`, and `loadProgress` events report
`probing`, `downloading`, and `parsing` phases. Range progress counts unique
validated bytes, so overlapping requests are not double-counted; a Range-backed
document may become ready before the entire file is transferred.

## Annotation import and export

Annotation rendering and pointer gestures are owned by Core rather than by a
React or Vue adapter:

```ts
import { createAnnotationEngine } from 'inklayer-core/annotation'
import { importPdfJsAnnotations } from 'inklayer-core/import/pdfjs'
import { buildAnnotatedPdf } from 'inklayer-core/export/pdf'
import { buildAnnotationWorkbook } from 'inklayer-core/export/excel'
import 'inklayer-core/style'
```

The PDF and Excel functions return bytes only. Framework adapters and browser
applications decide how to name, download, upload, or persist those bytes. Heavy
PDF/Excel libraries remain outside the Viewer bundle through separate package
entries.

Core also exports `downloadBlob` and `createBrowserDownloadProvider` as the
optional browser action boundary. See [`docs/css-contract.md`](./docs/css-contract.md)
for every instance-scoped `--inklayer-*` variable and its fallback.

Printing has two explicit paths: `buildPrintablePdf` preserves vector content
for ordinary PDFs, while browser-only `buildSecureRasterPrintPdf` prints an
already opened encrypted document by flattening pages, annotations, and the
print watermark into a transient image-only PDF after enforcing permissions.

## Vanilla browser demo

```bash
npm run dev
```

This starts the source-backed Vite development server at
`http://127.0.0.1:5173` and opens it in the browser. Changes below `src/` or
`examples/vanilla/src/` trigger an automatic browser refresh; a library build is
not required. The HTML file must not be opened through `file://`, because the
demo relies on the development server for TypeScript modules, package aliases,
and the PDF.js worker.

For a server without automatic browser opening, use `npm run dev:example`. The
demo imports normal `inklayer-core/*` package specifiers, while its dedicated
Vite configuration resolves those specifiers directly to the current source for
fast debugging.

The demo renders two independent PDF.js/Konva instances and exercises thumbnails,
outline navigation, search, real/cross-page TextLayer markup, virtual continuous
pages, an interactive protected-PDF password dialog, real system print command,
secure raster print preparation, local PDF loading, all annotation tools,
tool-specific transforms, comments, zoom, reload, PDF/Excel export, and
destroy/remount without React or Vue.

See [`docs/implementation-progress.md`](./docs/implementation-progress.md) for
completed implementation history and [`docs/roadmap.md`](./docs/roadmap.md) for
the current ordered work and acceptance criteria.

Detailed contracts: [architecture](./docs/architecture.md),
[public API](./docs/api.md), [data model](./docs/data-model.md),
[Core boundary](./docs/core-boundary.md),
[CSS](./docs/css-contract.md), [legacy data](./docs/legacy-data.md),
[framework integration](./docs/future-framework-integration.md), and
[performance baseline](./docs/performance-baseline.md).

## Local quality gate

```bash
npm install
npm run check
```

No package publication or framework migration is performed by this repository's
implementation workflow.
