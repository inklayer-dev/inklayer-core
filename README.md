# InkLayer Core

Framework-independent PDF viewing and annotation engine for browser applications.
InkLayer Core owns the PDF.js viewer, text selection, annotations, page flow,
printing, and export. React, Vue, and other adapters only need to provide their
application UI and state integration.

[Documentation](https://inklayer-dev.github.io/inklayer-core/) ·
[Live demo](https://inklayer-dev.github.io/inklayer-core/demo/) ·
[API reference](https://inklayer-dev.github.io/inklayer-core/api)

## Install

```bash
npm install @inklayer-dev/core
```

InkLayer Core includes a version-matched PDF.js worker. Applications do not need
to download, copy, or configure one.

## Quick start

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const core = await createInkLayer({
  root: document.querySelector<HTMLElement>('#viewer')!
})

await core.load({ url: '/documents/example.pdf' })

// Release the viewer, annotation engine, capabilities, and DOM resources.
await core.destroy()
```

`createInkLayer()` is the recommended Composition Root. Lower-level viewer and
annotation factories remain available when an adapter needs to own composition.

## What Core owns

| InkLayer Core | Application or framework adapter |
| --- | --- |
| PDF loading, passwords, range requests, progress | Toolbar, dialogs, routing |
| Pages, zoom, layouts, thumbnails, outline, search | Visual layout and product styling |
| Text selection and selection geometry | Selection menu UI |
| Annotation gestures, transforms, hit testing, tags | Tool palette and appearance controls |
| Canonical annotation data and typed events | Persistence, collaboration transport, auth |
| Watermarks, print, PDF and Excel output | File naming, upload and download policy |

Core includes all 16 built-in annotation types and supports instance-scoped
custom annotation definitions. Signature and Stamp accept PNG or JPEG data URLs
prepared by the application; Core owns placement, rendering, transforms, print,
and PDF export.

## Viewer

```ts
import { createPdfViewerEngine } from '@inklayer-dev/core/viewer'

const viewer = createPdfViewerEngine()
const pdf = await viewer.load({ url: '/documents/example.pdf' })

console.log(pdf.numPages)
console.log(await viewer.getOutline())
console.log(await viewer.search('contract'))

await viewer.destroy()
```

The packaged worker is the normal path. A self-hosted worker is still available
for restrictive deployment or Content Security Policy requirements:

```ts
const viewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

Viewer features include single, continuous, and facing layouts; virtualized page
flow; numeric and fit zoom modes; touch pinch zoom; thumbnails; outline; search
highlighting; same-page and cross-page text selection; encrypted PDFs; byte-range
loading; structured progress; permissions; and screen/print watermark policies.

## Annotations and output

```ts
import { createAnnotationEngine } from '@inklayer-dev/core/annotation'
import { importPdfJsAnnotations } from '@inklayer-dev/core/import/pdfjs'
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'
import { buildAnnotationWorkbook } from '@inklayer-dev/core/export/excel'
```

PDF and workbook exporters return bytes. Applications decide whether to save,
upload, or download them. Existing native PDF annotations can be imported and
reconciled by their native IDs during export, while unrelated PDF dictionaries
are preserved.

## Package entries

| Entry | Purpose |
| --- | --- |
| `@inklayer-dev/core` | Domain model, validation, repository, shared types |
| `@inklayer-dev/core/capabilities` | Composition Root and optional capabilities |
| `@inklayer-dev/core/viewer` | PDF viewer and page flow |
| `@inklayer-dev/core/annotation` | Annotation engine and interactions |
| `@inklayer-dev/core/annotation-types` | Built-in and custom annotation definitions |
| `@inklayer-dev/core/import/pdfjs` | Native PDF.js annotation import |
| `@inklayer-dev/core/export/pdf` | Annotated PDF and print output |
| `@inklayer-dev/core/export/excel` | Annotation workbook output |
| `@inklayer-dev/core/style` | Scoped engine CSS contract |

For complete options, events, lifecycle rules, and framework integration
examples, use the [public API reference](https://inklayer-dev.github.io/inklayer-core/api)
and [framework integration guide](https://inklayer-dev.github.io/inklayer-core/guide/framework-integration).

## Compatibility

- Browser runtime: current Chromium, Firefox, WebKit, and Safari releases
- Consumer builds: Vite, Webpack browser, and Node SSR import
- Node tooling: `^22.13.0 || >=24.0.0`

See the maintained [browser support matrix](https://inklayer-dev.github.io/inklayer-core/browser-support)
and [consumer build matrix](https://inklayer-dev.github.io/inklayer-core/consumer-build-matrix).

## Development

```bash
npm install
npm run dev       # source-backed Vanilla demo
npm run docs:dev  # VitePress documentation
npm run check     # complete release quality gate
```

Released under the MIT License.
