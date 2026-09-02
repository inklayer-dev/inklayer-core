# Public API

This page is a map of the public package entries and the APIs application developers use most often. For step-by-step setup, start with [Quick start](./guide/getting-started) and [framework integration](./guide/framework-integration).

## Package entries

| Entry | Use it for |
| --- | --- |
| `@inklayer-dev/core` | Data model, repositories, low-level Viewer and annotation factories, browser helpers, and shared types |
| `@inklayer-dev/core/capabilities` | Recommended `createInkLayer()` composition API and Capability plugins |
| `@inklayer-dev/core/annotation-types` | Custom annotation definitions and the type registry |
| `@inklayer-dev/core/highlighter` | Headless keyword scanning, review, preview, and permanent highlighting |
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
| `search()` / `searchMany()` | Search one literal query or an ordered batch of literal and regex queries |
| `resolveTextRanges()` | Resolve same-page UTF-16 source ranges to scale-one top-left page rectangles |
| `setTextHighlightLayers()` / `clearTextHighlightLayers()` | Replace or selectively clear ordered, temporary, caller-styled TextLayer highlights |
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

## Keyword Highlighter

The optional `@inklayer-dev/core/highlighter` entry composes Viewer search and preview primitives with Annotation Engine persistence. It owns workflow state, not UI, so React, Vue, and other hosts subscribe to the same immutable snapshots.

```ts
import {
  createKeywordHighlighter,
  type KeywordRule
} from '@inklayer-dev/core/highlighter'

const rules: readonly KeywordRule[] = [
  {
    id: 'risk', label: 'Risk terms',
    terms: ['liability', 'termination'], color: '#ef4444'
  },
  {
    id: 'structured', label: 'Dates and amounts', color: '#8b5cf6',
    patterns: [
      { id: 'date', kind: 'regex', source: '\\b\\d{4}-\\d{2}-\\d{2}\\b', flags: 'u' },
      { id: 'amount', kind: 'regex', source: 'RMB\\s*\\d+(?:,\\d{3})*', flags: 'iu' }
    ]
  }
]

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})

highlighter.setRules(rules)
const unsubscribe = highlighter.subscribe(snapshot => {
  console.log(snapshot.status, snapshot.includedCount)
})

await highlighter.scan()
const firstMatch = highlighter.getSnapshot().matches[0]
if (firstMatch !== undefined) highlighter.excludeMatch(firstMatch.id)

const result = await highlighter.applyMatches()
console.log(result.createdAnnotationIds, result.skippedMatchIds)

unsubscribe()
highlighter.destroy()
```

`terms` are literal matchers; `patterns` are serializable regular expressions.
Regex sources omit `/.../` delimiters and accept only unique `i`, `m`, `s`, and
`u` flags. A match exposes the configured matcher through `pattern` and the
exact PDF source text through `matchedText`.

| Method | Purpose |
| --- | --- |
| `setRules()` | Normalize and replace all keyword rules without scanning automatically |
| `scan()` / `cancelScan()` | Batch-search the ready document with progress and cancellation |
| `getSnapshot()` / `subscribe()` | Read or observe framework-neutral immutable workflow state |
| `activateMatch()` | Mark one match active and navigate the Viewer to its page |
| `includeMatch()` / `excludeMatch()` | Change one match's preview and application eligibility |
| `includeRule()` / `excludeRule()` | Change eligibility for every match produced by one rule |
| `applyMatches()` | Create missing permanent Highlight annotations for included matches |
| `clearPreview()` | Hide only this Controller's temporary layers without discarding review state |
| `reset()` | Clear Controller rules and transient state without deleting permanent annotations |
| `destroy()` | Cancel work and release subscriptions and owned preview layers |

`applyMatches()` uses deterministic annotation IDs, so a repeated pass skips annotations already present in the repository. Application is intentionally not transactional: if a later rule fails, earlier successful annotations remain canonical and are reconciled into the next snapshot. Always call `destroy()` when the owning application scope ends.

Start with the standalone [Keyword Highlighter guide](./guide/highlighter) for the complete integration workflow. Then see the maintained [Vanilla](./guide/framework-integration), [React](./guide/framework-react), and [Vue](./guide/framework-vue) examples for three UI ownership patterns over the same Controller.

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
| `getAnnotations()` | Read every detached canonical annotation in repository order |
| `createTextMarkup()` | Create highlight, underline, or strikeout from text selection |
| `createTextMarkupsFromRanges()` | Batch-create missing stable-ID text markups from resolved ranges |
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
  buildSecureRedactedPdf,
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
| `buildSecureRedactedPdf()` | Browser-generated, image-only PDF with reviewed text ranges irreversibly covered |
| `buildAnnotationWorkbook()` | XLSX bytes containing annotation data |
| `printPdfBlob()` | Open the browser print dialog for generated bytes |
| `downloadBlob()` | Download generated bytes in the browser |

`buildSecureRedactedPdf()` accepts `viewer`, a non-empty `ranges` array, optional `pixelRatio` and `margin`, progress, and cancellation. Its output intentionally contains no selectable page text. Output builders return content; printing, downloading, or uploading it remains an application decision. See [Print, export, and watermarks](./guide/output-and-security).

## Errors

Public feature boundaries throw `InkLayerError`. Its stable `code` is intended for application branching; `operation`, `annotationId`, and zero-based `pageIndex` provide optional context.

Common groups include:

- environment and lifecycle: `ENVIRONMENT_UNSUPPORTED`, `ENGINE_DESTROYED`;
- PDF loading and features: `PDF_LOAD_FAILED`, `PDF_LOAD_CANCELLED`, `PDF_RANGE_FAILED`, `PDF_FEATURE_FAILED`;
- annotations and custom types: `ANNOTATION_INVALID`, `ANNOTATION_TYPE_UNAVAILABLE`;
- conversion: `IMPORT_FAILED`, `EXPORT_FAILED`.

Do not expose `error.cause` directly to users. See [Error recovery](./error-recovery) for retry patterns.
