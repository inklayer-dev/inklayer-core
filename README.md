# InkLayer Core

InkLayer Core is the framework-independent PDF.js and Konva engine shared by
InkLayer's React, Vue, and future browser integrations.

The implementation includes the canonical annotation domain, validation,
collaboration functions, memory repository, verified legacy compatibility, PDF
Viewer Engine with thumbnails, outline, search, and TextLayer selection, Konva
Annotation Engine, native PDF.js import, content-only PDF/Excel exporters, scoped
engine styles, and browser platform helpers.

## Composed instance

`createInkLayer()` is the recommended integration entry. It owns Viewer,
Annotation, optional document Page Flow, instance Capabilities, and deterministic
teardown. The lower-level factories remain available for advanced integrations.

```ts
import {
  createInkLayer,
  createLoggerCapability,
  createTextInputCapability
} from 'inklayer-core/capabilities'

const core = await createInkLayer({
  root: document.querySelector<HTMLElement>('#viewer')!,
  capabilities: [
    createLoggerCapability(appLogger),
    createTextInputCapability(appTextInput)
  ]
})

await core.load({ url: '/documents/example.pdf' })
await core.destroy()
```

Capabilities are ordered and instance-local. Setup runs before engines are
created; `onReady` effects run after both engines exist. Returned disposers and
resources registered on `context.lifecycle` are released automatically.
Existing Port interfaces remain valid both as low-level Engine options and as
Capabilities. Resolution is deterministic: an explicit Engine option wins over
the matching Capability provider, which wins over Core's browser/default
implementation. Stable factories cover Logger, Text Input, Annotation
Repository, Print, Download, Clock, ID Generator, thumbnail surfaces, and Fetch.
Repositories are borrowed unless `ownership: 'owned'` explicitly transfers
their destruction to the Capability lifecycle.

## Custom annotation types

Custom V1 annotations use stable namespaced IDs such as
`custom:acme/measurement` and may persist independently versioned lossless JSON
in `typeData`. Definitions are registered per instance:

```ts
import { createAnnotationTypeRegistry } from 'inklayer-core/annotation-types'

const annotationTypes = createAnnotationTypeRegistry()
const unregister = annotationTypes.register(measurementDefinition)
const annotations = createAnnotationEngine({ root, repository, annotationTypes })
```

The same Registry exposes immutable protected Definitions for all 16 built-ins.
Their defaults, geometry, creation controller, tool lifecycle, transform
capabilities, output policy, and Core-private renderer ownership resolve through
the same instance boundary. External code may inspect but cannot replace,
unregister, or select the private renderer strategy.

Definitions return renderer-neutral controlled scenes; they never receive Konva
nodes. If a Definition is missing or cannot read the payload version, Core keeps
the complete annotation, renders a safe placeholder without parsing its retained
renderer string, permits generic comments/deletion, and rejects type behavior
with `ANNOTATION_TYPE_UNAVAILABLE`. Registering compatible behavior restores the
controlled rendering. The Composition Root exposes the same Registry through
`instance.annotationTypes` and Capability setup context.

Custom pointer tools may provide `creation.initialize()` to convert normalized
Core gesture geometry into canonical `typeData` and content. Pure transform
reducers keep that semantic data synchronized after direct manipulation.
Definitions using the controlled `appearance-stream` PDF strategy are exported
or printed by passing the same instance Registry:

```ts
const bytes = await buildAnnotatedPdf(source, annotations, {
  annotationTypes: instance.annotationTypes
})
```

## Viewer Engine

The Viewer factory is safe to import during Node and SSR builds. PDF.js runtime
modules are loaded only when `load()` is called.

Packed production builds are verified with Vite browser, Webpack browser, and
executable Webpack Node SSR consumers. The pinned support matrix and its limits
are documented in the
[consumer build matrix](https://github.com/Laomai-codefee/inklayer-core/blob/main/docs/consumer-build-matrix.md).
Runtime Viewer and Annotation flows are verified against the declared
[Chromium, Firefox, and WebKit matrix](https://github.com/Laomai-codefee/inklayer-core/blob/main/docs/browser-support.md).

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

```ts
const cspViewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

This override is optional; the zero-argument construction above is the normal
application path.

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

The single-workspace demo exercises thumbnails, outline navigation, search,
same-page and cross-page TextLayer markup, virtual continuous pages, protected
PDF passwords, Range loading and progress, system print, secure raster print,
watermarks, local PDF loading, all annotation tools, tool-specific transforms,
comments, zoom and pinch gestures, reload, PDF/Excel export, error recovery, and
destroy/remount without React or Vue.

Documentation is built with VitePress:

```bash
npm run docs:dev
npm run docs:build
```

Start with the [getting-started guide](./docs/guide/getting-started.md), then read
[framework integration](./docs/guide/framework-integration.md) and the complete
[public API](./docs/api.md). Detailed contracts cover
[architecture](./docs/architecture.md), [data](./docs/data-model.md),
[Core ownership](./docs/core-boundary.md),
[accessibility](./docs/accessibility.md), [CSS](./docs/css-contract.md),
[legacy data](./docs/legacy-data.md), and [browser support](./docs/browser-support.md).

## Local quality gate

```bash
npm install
npm run check
```

No package publication or framework migration is performed by this repository's
implementation workflow.
