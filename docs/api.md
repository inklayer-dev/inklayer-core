# Public API

This page is a map of the public package entries and the APIs application developers use most often. For step-by-step setup, start with [Quick start](./guide/getting-started) and [framework integration](./guide/framework-integration).

## Package entries

| Entry | Use it for |
| --- | --- |
| `@inklayer-dev/core` | Data model, repositories, low-level Viewer and annotation factories, browser helpers, and shared types |
| `@inklayer-dev/core/capabilities` | Recommended `createInkLayer()` composition API and Capability plugins |
| `@inklayer-dev/core/annotation-types` | Custom annotation definitions and the type registry |
| `@inklayer-dev/core/viewer` | Low-level PDF Viewer APIs |
| `@inklayer-dev/core/annotation` | Low-level annotation-engine APIs |
| `@inklayer-dev/core/import/pdfjs` | Importing native PDF.js annotation data |
| `@inklayer-dev/core/export/pdf` | Annotated and printable PDF generation |
| `@inklayer-dev/core/export/excel` | Annotation workbook generation |
| `@inklayer-dev/core/style` | Required browser stylesheet |

Prefer `createInkLayer()` for an application Viewer. Use the low-level Viewer and annotation entries only when you need to compose their lifecycle yourself.

## Core instance

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

const pdf = await core.load({ url: '/documents/review.pdf' })
console.log(pdf.numPages)

await core.destroy()
```

### `InkLayerInstance`

| Member | Purpose |
| --- | --- |
| `viewer` | PDF loading, search, text selection, thumbnails, outline, watermark, and Viewer events |
| `annotations` | Tools, creation, editing, comments, selection, permissions, and annotation events |
| `annotationTypes` | Built-in and custom annotation type registry |
| `capabilities` | Read-only access to installed Capability IDs and services |
| `load(source)` | Load or replace the current PDF and mount the configured Page Flow |
| `cancelLoad()` | Cancel the current load and release its document presentation |
| `getPageFlow()` | Return the current Page Flow controller, or `null` before a document is ready |
| `destroy()` | Cancel work and release the complete instance |

`load()` accepts `{ url, range?, headers?, credentials? }` or `{ data }`. URL Range policy is `true`, `false`, or `'auto'`; automatic mode falls back only when the server is confirmed not to support Range requests.

### PDF.js Worker

Core ships a version-matched PDF.js Worker. Applications do not need to download or configure it.

`workerSrc` is an optional override for self-hosting or a restrictive Content Security Policy:

```ts
const viewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

## Viewer

Use `core.viewer`, or create the low-level engine with `createPdfViewerEngine()`.

```ts
const viewer = createPdfViewerEngine()
```

| Method | Purpose |
| --- | --- |
| `load(source)` / `cancelLoad()` | Load, replace, or cancel a document when using the low-level Viewer |
| `submitPassword()` / `cancelPassword()` | Answer the active `passwordRequired` request |
| `getSnapshot()` | Read detached loading and document state |
| `subscribe(listener)` | Subscribe to progress, password, load, selection, scale, and error events |
| `setLayoutMode()` | Select `single`, `continuous`, `facing`, or `continuous-facing` layout for a configured web Viewer |
| `setScale()` / `getScale()` | Set or read numeric and named scale values |
| `zoomIn()` / `zoomOut()` / `goToPage()` | Control a configured web Viewer |
| `getOutline()` / `resolveDestination()` | Read document navigation data |
| `search()` | Search normalized PDF text |
| `setSearchHighlights()` / `clearSearchHighlights()` | Display temporary search results in attached text layers |
| `getTextSelection()` / `clearTextSelection()` | Read or clear normalized browser text selection |
| `renderThumbnail()` | Return an encoded PNG thumbnail Blob |
| `renderPageRaster()` | Return a complete page raster |
| `attachTextLayer()` / `detachTextLayer()` | Manage selectable PDF text when pages are mounted manually |
| `setWatermark()` / `getWatermark()` / `drawWatermark()` | Manage the Viewer watermark policy |
| `destroy()` | Release the low-level Viewer |

Page indexes are zero-based. Thumbnail object URLs belong to the application and must be released with `URL.revokeObjectURL()` after their images leave the UI.

### Page Flow

`createInkLayer({ pageFlow: ... })` creates a virtualized, continuous page surface after `load()` succeeds. Access it through `core.getPageFlow()`:

```ts
const pageFlow = core.getPageFlow()

pageFlow?.scrollToPage(4, 'smooth')
await pageFlow?.setScale('page-fit')
await pageFlow?.zoomIn()
console.log(pageFlow?.getCurrentPage())
```

The controller exposes `scrollToPage()`, `setScale()`, `getScale()`, `zoomIn()`, `zoomOut()`, `getCurrentPage()`, and `destroy()`. Replacing the document destroys the old controller and creates a new one.

## Annotation engine

Use `core.annotations`, or create the low-level engine with `createAnnotationEngine()`.

| Method or property | Purpose |
| --- | --- |
| `repository` | Canonical annotation data and current selection |
| `annotationTypes` | Type definitions available to this engine |
| `setTool()` / `getTool()` | Select or inspect the active interaction tool |
| `setToolAppearance()` / `getToolAppearance()` | Configure the appearance used by future annotations |
| `getAppearanceCapabilities()` | Determine which appearance controls a type supports |
| `setImageAsset()` / `getImageAsset()` | Prepare a signature or stamp image for placement |
| `createAnnotation()` | Create an annotation from canonical input |
| `createTextMarkup()` | Create highlight, underline, or strikeout from text selection |
| `requestFreeText()` / `requestEditText()` | Open the configured text input provider |
| `updateContent()` / `updateAppearance()` / `transformAnnotation()` | Edit an existing annotation |
| `addComment()` / `updateComment()` / `deleteComment()` | Manage comments and replies |
| `deleteAnnotation()` / `undoLastDeletion()` | Delete or restore the most recent deletion |
| `setSelection()` / `setHoveredAnnotation()` | Synchronize application UI with Canvas state |
| `setCurrentUser()` / `setPermissions()` | Change the identity and permission policy used for subsequent operations |
| `subscribe(listener)` | Subscribe to typed annotation-engine events |
| `destroy()` | Release the low-level annotation engine |

All 16 built-in annotation types are listed in [Annotation tools and appearance](./guide/annotations). Custom type IDs are accepted after a compatible definition is registered.

## Annotation repository

`core.annotations.repository` is the single source of annotation data.

| Method | Purpose |
| --- | --- |
| `getAll()` / `getById()` / `getByPage()` | Read detached annotation values |
| `add()` / `update()` / `remove()` | Apply individual changes |
| `replaceAll()` | Validate and atomically replace the complete annotation collection |
| `getSelection()` / `setSelection()` | Read or replace transient selection IDs |
| `subscribe(listener)` | Observe add, update, remove, replacement, selection, and destroy events |
| `destroy()` | Release repository state and listeners |

Repository events are local state notifications, not a network synchronization protocol. See [Persist annotations](./guide/persistence) and [Annotation data model](./data-model).

## Capabilities and custom types

Capability factories are exported from `@inklayer-dev/core/capabilities`:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [
    createLoggerCapability(logger),
    createAnnotationRepositoryCapability(repository),
    createTextInputCapability(textInput)
  ],
  annotationTypes: [reviewArea]
})
```

Capabilities install instance-specific services before the engines are created. Custom annotation definitions add namespaced drawing types. See [Create a Capability plugin](./guide/capability-plugin), [Create a custom annotation type](./guide/custom-annotation-type), and [Plugin lifecycle and services](./guide/plugin-lifecycle).

## Import and output

Use the dedicated package entry for each conversion:

```ts
import {
  importPdfJsAnnotations,
  importPdfJsAnnotationsWithMetadata
} from '@inklayer-dev/core/import/pdfjs'
import {
  buildSecureRasterPrintPdf,
  downloadBlob,
  printPdfBlob
} from '@inklayer-dev/core'
import {
  buildAnnotatedPdf,
  buildPrintablePdf
} from '@inklayer-dev/core/export/pdf'
import { buildAnnotationWorkbook } from '@inklayer-dev/core/export/excel'
```

| Function | Result |
| --- | --- |
| `importPdfJsAnnotations()` | Canonical annotations and warnings decoded from PDF.js page annotation data |
| `importPdfJsAnnotationsWithMetadata()` | The same result enriched from source PDF bytes |
| `buildAnnotatedPdf()` | PDF bytes containing canonical annotations |
| `buildPrintablePdf()` | PDF bytes composed for printing |
| `buildSecureRasterPrintPdf()` | Browser-generated, image-only print PDF for a document already opened by the Viewer |
| `buildAnnotationWorkbook()` | XLSX bytes containing annotation data |
| `printPdfBlob()` | Open the browser print dialog for generated bytes |
| `downloadBlob()` | Download generated bytes in the browser |

Output builders return content; printing, downloading, or uploading it remains an application decision. See [Print, export, and watermarks](./guide/output-and-security).

## Errors

Public feature boundaries throw `InkLayerError`. Its stable `code` is intended for application branching; `operation`, `annotationId`, and zero-based `pageIndex` provide optional context.

Common groups include:

- environment and lifecycle: `ENVIRONMENT_UNSUPPORTED`, `ENGINE_DESTROYED`;
- PDF loading and features: `PDF_LOAD_FAILED`, `PDF_LOAD_CANCELLED`, `PDF_RANGE_FAILED`, `PDF_FEATURE_FAILED`;
- annotations and custom types: `ANNOTATION_INVALID`, `ANNOTATION_TYPE_UNAVAILABLE`;
- conversion: `IMPORT_FAILED`, `EXPORT_FAILED`.

Do not expose `error.cause` directly to users. See [Error recovery](./error-recovery) for retry patterns.
