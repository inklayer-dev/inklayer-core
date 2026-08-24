# Public API

This reference covers every public package entry and the contracts application
developers use most often. Start with the [getting-started guide](./guide/getting-started.md)
and [framework integration](./guide/framework-integration.md) if you are building
a React, Vue, Svelte, Angular, Web Component, or Vanilla adapter. Emitted V1
declaration signatures are enforced by `npm run check:api`.

## Package entries

| Entry | Purpose | Heavy runtime |
|---|---|---|
| `@inklayer-dev/core` | Domain, repository, collaboration, Viewer/Annotation factories, browser ports | PDF.js/Konva loaded only when used |
| `@inklayer-dev/core/capabilities` | Composition Root, Capability contracts, lifecycle types | Viewer/Annotation runtimes only when composed |
| `@inklayer-dev/core/annotation-types` | Custom type IDs, Definition Registry, controlled scene contracts | None until an Annotation page is attached |
| `@inklayer-dev/core/viewer` | PDF.js Viewer facade and lifecycle types | PDF.js |
| `@inklayer-dev/core/annotation` | Annotation facade, tools, events, ports, snapshot validator | Konva after page attach |
| `@inklayer-dev/core/import/pdfjs` | Native decoding, optional metadata inspection, storage hiding | pdf-lib only during metadata inspection |
| `@inklayer-dev/core/export/pdf` | Existing PDF bytes → annotated PDF bytes | pdf-lib |
| `@inklayer-dev/core/export/excel` | Canonical annotations → XLSX bytes | ExcelJS |
| `@inklayer-dev/core/style` | Generated instance-scoped engine CSS | CSS only |

## Composition Root and Capabilities

```ts
import {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  createAnnotationRepositoryCapability,
  createInkLayer,
  createLoggerCapability,
  createPrintCapability,
  createTextInputCapability
} from '@inklayer-dev/core/capabilities'

const instance = await createInkLayer({
  root,
  pageFlow: { container: scrollElement },
  capabilities: [
    createLoggerCapability(logger),
    createTextInputCapability(textInput),
    createAnnotationRepositoryCapability(repository),
    createPrintCapability(printProvider)
  ]
})

await instance.load({ url, range: 'auto' })
const flow = instance.getPageFlow()
await instance.destroy()
```

Capability `setup()` calls run sequentially before Viewer and Annotation engine
construction. A Capability can provide a unique instance-local service, consume
services from earlier Capabilities, register owned resources on its lifecycle
scope, and schedule ordered `onReady` effects. Initialization is transactional:
any failure rolls back all resources already created. Page Flow is
document-scoped and is created only after `load()` returns a ready document.

The protected Port service keys and factories are:

| Port | Factory | Engine consumption |
|---|---|---|
| `Logger` | `createLoggerCapability` | Annotation diagnostics and Viewer listener fallback |
| `TextInputProvider` | `createTextInputCapability` | FreeText create/edit sessions |
| `AnnotationRepository` | `createAnnotationRepositoryCapability` | Canonical Annotation state |
| `PrintProvider` | `createPrintCapability` | Explicit application invocation after print-byte generation |
| `DownloadProvider` | `createDownloadCapability` | Explicit application invocation after export generation |
| `Clock` | `createClockCapability` | Annotation timestamps |
| `IdGenerator` | `createIdGeneratorCapability` | Engine and annotation identities |
| `PdfThumbnailSurfaceProvider` | `createThumbnailSurfaceCapability` | Viewer thumbnail allocation |
| `fetch` | `createFetchCapability` | Viewer Range probing and byte requests |

Resolution always follows `explicit low-level Engine option > Capability
provider > Core browser/default implementation`. A shadowed Capability remains
inspectable but is not mixed into that Engine. For example, an explicit
`annotation.repository` is the sole repository even if a Repository Capability
is installed. Repository providers default to borrowed ownership; pass
`{ ownership: 'owned' }` only when the InkLayer instance must destroy it.

Print and Download do not run implicitly. They remain application-triggered
environment effects and can be retrieved with their typed keys:

```ts
await instance.capabilities
  .get(INKLAYER_CAPABILITY_SERVICE_KEYS.print)
  ?.print({ content: printablePdf })
```

When no Capability supplies these side effects, applications may continue to
use `createBrowserPrintProvider()` and `createBrowserDownloadProvider()`
directly. The existing Port interfaces and all low-level factory options remain
public and unchanged.

### Deferred optional Capabilities

V1 intentionally does not expose a Search Index Provider, synchronization
adapter, Command Registry, or telemetry provider. Current React/Vue requirements
are expressible through the canonical Viewer search/highlight/navigation APIs,
Repository commands and events, explicit engine/output methods, existing Ports,
and adapter-owned UI composition.

These seams are not reserved string keys and must not be simulated with no-op
providers. Before any one of them enters the public API, it needs a real
consumer plus defined lifecycle, cancellation, structured-error, privacy, and
executable-test contracts. In particular, a future telemetry interface cannot
receive raw engine events containing document or annotation content, and a
future synchronization interface cannot define conflict policy by mutating
Repository internals.

Canonical Viewer search supports `matchCase`, `wholeWord`,
`matchDiacritics`, and `maxResults`. Diacritics are folded by default to retain
current React/Vue behavior; set `matchDiacritics: true` when accents must match
exactly. This normalization remains Core-owned and cannot be replaced by a
Capability.

## Annotation Type Definitions

Custom persisted identities use `custom:<namespace>/<name>`. Each segment starts
with a lowercase ASCII letter or digit, then uses lowercase letters, digits,
`.`, `_`, or `-`. A segment is at most 120 characters and the complete ID at
most 256 characters. Built-in IDs are reserved.

Every Registry starts with immutable Definitions for all 16 built-ins. `get()`
therefore returns both built-in and installed custom Definitions, while
`register()` remains custom-only. Built-in Definitions are the canonical source
for default Appearance, exact Appearance controls, geometry, creation
controller, one-shot/continuous lifecycle, direct-manipulation capabilities,
printability, exportability, and PDF strategy. Their `renderer.strategy` is
`core`: this delegates to verified private Konva snapshot builders and is
rejected on external registration.

See the [built-in annotation type table](./guide/annotations.md#built-in-annotation-types)
for the complete IDs, geometry, creation modes, and PDF strategies.

```ts
import { createAnnotationTypeRegistry } from '@inklayer-dev/core/annotation-types'

const annotationTypes = createAnnotationTypeRegistry()
const unregister = annotationTypes.register(measurementDefinition)

const engine = createAnnotationEngine({ root, annotationTypes, repository })
unregister()
engine.destroy()
annotationTypes.destroy()
```

`AnnotationTypeDefinition` exposes controlled metadata and pure callbacks only;
it never receives Konva nodes, Stages, Layers, PDF.js internals, or a Repository.
Its renderer returns a bounded scene made from groups, rectangles, ellipses,
lines, paths, text, and images. Core validates that scene before constructing
private renderer objects.

`AnnotationEngine.setTool()` accepts an installed custom type ID as well as a
built-in. Pointer creation resolves its controller and preview geometry through
the instance Registry. Removing an active custom Definition immediately returns
the Engine to `select` and prevents further creation.

Unknown custom annotations remain valid canonical data. Core preserves their
`typeData`, `rendererState`, and `extensions`, renders a safe bounds-based
placeholder without parsing the unknown renderer string, and rejects
type-specific commands with `ANNOTATION_TYPE_UNAVAILABLE`. Delete and canonical
comment operations remain available. Installing a compatible Definition redraws
retained annotations; removing it restores the placeholder.

`creation.initialize(input)` is an optional pure callback for custom pointer
creation. It receives detached, deeply frozen bounds/content/point data and may
return refined bounds, semantic content, and independently versioned `typeData`.
Core validates the result before committing it to the Repository. The existing
pure `interaction.reduceTransform()` callback may then synchronize `typeData`
with direct manipulation.

`buildAnnotatedPdf()` and `buildPrintablePdf()` accept the instance Registry as
`options.annotationTypes`. A compatible custom Definition must enable the
relevant `exportable` or `printable` capability and declare
`pdf.exportStrategy: 'appearance-stream'`. Core invokes the same controlled
renderer, validates the scene, and writes a selectable PDF Stamp appearance
stream containing the stable custom ID, `typeData`, and Appearance metadata.
V1 appearance-stream export currently accepts rectangle, ellipse, and line
primitives; unsupported scene primitives fail during preflight before PDF
mutation. Missing Definitions and unsupported policies are reported explicitly,
never silently dropped.

## Viewer

```ts
const viewer = createPdfViewerEngine()
const handle = await viewer.load({ url, range: 'auto' })
// or: await viewer.load({ data: bytes })
await viewer.cancelLoad()
await viewer.destroy()
```

Core ships and resolves a version-matched PDF.js Worker. Applications do not need
to download or configure it; `workerSrc` is an optional override for self-hosting
or a custom Content Security Policy. `load()` is generation-guarded; a newer load
wins. URL Range supports `true`, `false`, and `'auto'`. Automatic fallback occurs
only for confirmed lack of range support, not ordinary network/HTTP failures.
Root and Viewer imports are SSR-safe because PDF.js is dynamically loaded by
`load()`.

```ts
const cspViewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

The override is not required for ordinary Vite or Webpack consumers.

Viewer state exposes structured loading progress:

```ts
const unsubscribe = viewer.subscribe((event) => {
  if (event.type !== 'loadProgress') return
  const { phase, loaded, total, percentage, range } = event.progress
  renderLoadingState({ phase, loaded, total, percentage, range })
})

console.log(viewer.getSnapshot().progress)
```

The phase is `probing`, `downloading`, or `parsing`. Unknown totals and
percentages are `null`. Range progress counts unique validated byte intervals,
including the initial probe, without double-counting overlapping requests. A
Range-backed document may become ready before every byte is transferred, so Core
does not fabricate a final 100 percent event. Loading UI remains adapter-owned.

Password-gated loading pauses in `awaiting-password` and emits only safe request
metadata. Adapters call `submitPassword(requestId, password)` or
`cancelPassword(requestId)`; credentials are not retained in snapshots or
errors. The loaded handle exposes normalized print/copy/modify/annotation/form
permissions.

When constructed with PDF.js web Viewer containers, Core owns page-flow commands:

```ts
await viewer.setLayoutMode('continuous')
viewer.setScale('page-width')
viewer.zoomIn()
viewer.zoomOut()
console.log(viewer.getScale().percentage)
viewer.goToPage(4)
```

Numeric zoom and `auto`, `page-actual`, `page-fit`, `page-width`, and
`page-height` presets share one `PdfZoomState`. A configured web Viewer emits
`scaleChanged` and owns anchor-preserving two-touch plus Ctrl/Meta+wheel zoom by
default; pass `enablePinchZoom: false` only when a host must disable gestures.

For a virtualized multi-page surface, Core can instead own stable page shells,
render-ahead, TextLayer/Annotation attachment, current-page tracking, and cleanup:

```ts
const flow = await createPdfPageFlow({
  viewer,
  annotations,
  container: scrollElement,
  onCurrentPageChanged: setCurrentPage,
  onScaleChanged: setZoomState,
  onError: reportCoreError
})
flow.scrollToPage(4, 'smooth')
await flow.setScale('page-fit')
await flow.zoomIn()
console.log(flow.getScale().scale)
flow.destroy()
```

The adapter still owns the surrounding scrollbar, toolbar, responsive layout,
and mode controls. `createPdfPageFlow` requires a ready Viewer and a browser with
`IntersectionObserver` and `createImageBitmap`.
Adaptive page-flow presets are re-resolved by `ResizeObserver`, while toolbar
steps leave preset mode and operate on the current resolved numeric scale.
`PdfPageFlow` also attaches Core's two-touch and Ctrl/Meta+wheel recognizer to
its scroll container. Gesture frames are coalesced during asynchronous page
rerendering, and the document point under the midpoint remains anchored.

Document features are generation-scoped and require a loaded document:

```ts
const outline = await viewer.getOutline()
const target = await viewer.resolveDestination(outline[0]?.destination)
const results = await viewer.search('review', {
  matchCase: false,
  wholeWord: true,
  maxResults: 100
})
const thumbnail = await viewer.renderThumbnail({ pageIndex: 0, maxWidth: 160 })
```

Core extracts and resolves outline destinations, searches pages in document
order, and renders cached PNG thumbnails. Consumers own the tree/list/input UI
and must revoke any object URL after they finish presenting a returned thumbnail.
Replacing or destroying the document cancels Core-owned tasks and clears caches.

For real PDF text selection, attach the page's PDF.js TextLayer above the canvas:

```ts
await viewer.attachTextLayer({
  pageIndex: 0,
  container: textLayerElement,
  scale: 1
})
const unsubscribe = viewer.subscribe((event) => {
  if (event.type === 'textSelectionChanged' && event.selection !== null) {
    // Render product UI, then consume the retained selection after the user acts.
    const selections = event.selection.kind === 'page'
      ? [event.selection.selection]
      : event.selection.selection.fragments
    for (const selection of selections) {
      annotationEngine.createTextMarkup('highlight', selection)
    }
    viewer.clearTextSelection()
  }
})
```

Use `textSelectionChanged` for selection-first product UI. `getTextSelection()`
retains normalized geometry while focus moves to a contextual menu, and
`clearTextSelection()` clears both Core state and the native browser Range. Legacy
`textSelected` and `documentTextSelected` events remain available. Same-page
selection carries one page; cross-page selection carries ordered page-local
fragments so adapters can create one canonical markup per page. Core emits
unscaled top-left page rectangles; the framework owns contextual menu markup.

`search()` returns stable offsets. Pass them to
`setSearchHighlights(result.matches, activeIndex)` to project matches into every
attached TextLayer; newly attached pages restore the same transient state.

Watermarks are presentation policy, not annotations:

```ts
viewer.setWatermark({ text: 'Alice · Confidential', targets: {
  viewer: true, print: true, export: false, thumbnails: false
}})
await page.render(renderContext).promise
viewer.drawWatermark({ canvas, pageIndex })
```

The PDF entry exports `buildPrintablePdf`, which preserves vector PDF content
while composing annotations and the same watermark policy for ordinary input.
Optional `watermarkFontBytes` uses `@pdf-lib/fontkit` for Chinese and other
non-WinAnsi text. `printPdfBlob` owns the temporary iframe and object URL used to
invoke the browser dialog.

For password-protected or otherwise sensitive documents, use the browser-only
raster print path after PDF.js has opened the document:

```ts
const printable = await buildSecureRasterPrintPdf({
  viewer,
  annotations,
  pixelRatio: 2,
  onProgress: (completedPages, totalPages) => updateProgress(completedPages, totalPages)
})
await printPdfBlob(printable)
```

This path applies the print watermark and canonical annotations, enforces PDF
print permission (including a one-times density cap for low-resolution access),
and creates a transient unencrypted image-only PDF. It is intentionally for the
print dialog, not a replacement download/export: selectable text, links, forms,
and vector fidelity are flattened. Vector-preserving encrypted output still
requires a trusted decrypt/re-encrypt backend. Passing encrypted source bytes to
the vector PDF exporter continues to fail closed.

## Annotation Engine

```ts
const engine = createAnnotationEngine({
  root,
  currentUser: { id: 'alice', name: 'Alice' },
  freehandMergeDelayMs: 1000,
  authorLabelVisibility: 'auto',
  creationModes: {
    rectangle: 'once',
    highlight: 'continuous'
  },
  defaultAppearances: {
    highlight: { fill: { color: '#b4fa56', opacity: 0.5 } },
    rectangle: { stroke: { color: '#ff6b6b', width: 2 } }
  }
})

await engine.attachPage({ pageIndex: 0, container, width, height, scale })
engine.setTool('rectangle')
engine.setToolAppearance('rectangle', {
  stroke: { color: '#1677ff', width: 3, dash: [8, 4] },
  fill: { color: '#e6f4ff', opacity: 0.2 }
})
const annotation = engine.createAnnotation({
  type: 'rectangle',
  pageIndex: 0,
  bounds: { x: 10, y: 20, width: 100, height: 50 }
})
engine.setSelection({ ids: [annotation.id], primaryId: annotation.id })
engine.updateAppearance(annotation.id, { stroke: { width: 5 } })
engine.setAuthorLabelVisibility('always')
engine.setImageAsset('signature', {
  image: signaturePngDataUrl,
  width: 180,
  height: 60,
  text: 'Alice signature'
})
engine.setTool('signature') // the next page click centers and places the image
engine.destroy()
```

`AnnotationAppearance` is the complete persisted V1 value. It is independent
from Konva and separates whole-annotation opacity from `stroke`, `fill`, and
`text`; a component is `null` when disabled. Creation and editing APIs accept
`AnnotationAppearanceInput`, a deep partial where `undefined` inherits and
`null` explicitly disables a component. Dash styles use page-unit arrays such
as `[8, 4]`, so render adapters do not translate vague names like `dashed`.
Use `getAppearanceCapabilities(type)` to build only controls meaningful for the
selected type. `hitStrokeWidth` is internal interaction state and is never part
of appearance or persisted snapshots.

Author/reference Tags are transient renderer state. `auto` displays a Tag for
the hovered or selected annotation, `always` displays every attached Tag, and
`hidden` suppresses Tags even during hover and selection. Canvas hover is owned
by Core; sidebars can share it through `setHoveredAnnotation(id)`.

All 16 persisted types are supported. `text-select` routes pointer input to the
PDF TextLayer while `select` enables existing-annotation manipulation.
Highlight/underline/strikeout accept
normalized text selection through `createTextMarkup`. FreeText uses
`requestFreeText` and the configured `TextInputProvider`. Signature and Stamp
pointer placement use `setImageAsset`; application UI creates/selects the PNG or
JPEG data URL, while Core owns page placement, transforms, rendering, print and
export. If an image tool has no prepared asset, clicking emits
`imageAssetRequired` so an adapter can open its picker. Selection is transient
and never persisted as an annotation type.

Every successful user interaction selects its newly created annotation, so an
`auto` author Tag behaves consistently across shapes, text markup, FreeText,
Signature and Stamp. Core then applies the type's creation mode: shape, ink,
text, image and path tools default to `once` and return to Select; Highlight,
Underline and Strikeout default to `continuous` and remain active. Override a
default through `creationModes`. Direct `createAnnotation()` calls remain
side-effect free for imports and batch work; `createTextMarkup()` and
`requestFreeText()` are interaction commands and therefore apply this lifecycle.

Comments, workflow status, updates, transforms, deletes, navigation, hover,
selection, permissions, and typed events are facade operations. The repository
remains the sole source of truth. Supplied repositories are consumer-owned;
default repositories are engine-owned.

Annotations are draggable only while the Select tool is active. Transform
affordances are geometry-specific: box resize/rotation where valid, proportional
resize for image/path-like content, endpoint editing for Line/Arrow, vertex
editing for Polygon/Polyline, move-only Note, and no transform handles for text
markup. Pointer feedback is continuous and constrained to the page.

Direct-document keyboard interaction is enabled by default. Arrow keys move the
current selection by one page unit, Shift+arrow moves by ten, Delete/Backspace
uses the canonical permission-aware delete path, and Escape cancels drawing or
clears selection. Configure bounded steps through `keyboard`; localize Core-owned
root/page/annotation semantics through `accessibility`. Existing root ARIA and
tabindex attributes are preserved. See
[`docs/accessibility.md`](./accessibility.md) for focus ownership, FreeText,
TextLayer menu handoff, reduced motion, and adapter responsibilities.

Successive Freehand strokes on the same attached page are merged into one
annotation until `freehandMergeDelayMs` elapses; each stroke remains independent
in Konva state and PDF `InkList` import/export. Its once-only selection/tool
transition happens after that merge interval, not after the first stroke.
Free-highlight snaps paths within
two degrees of horizontal or vertical on pointer release. Polygon, Polyline, and
Cloud previews remain open while points are collected; Polygon and Cloud close
only when the double-click/double-tap commit succeeds.

## Native import

```ts
const decoded = importPdfJsAnnotations(pages)
hideImportedPdfJsAnnotations(storage, decoded.supportedIds, pageById)

const enriched = await importPdfJsAnnotationsWithMetadata(pages, pdfBytes)
```

Decoding never mutates PDF.js annotation storage. The separate hiding helper
accepts only confirmed decoded IDs, so Link, Widget, Form, and malformed entries
remain untouched. The metadata variant loads bytes once to recover custom
Arrow/Cloud/FreeText dictionary markers. Metadata failure adds a warning and
continues standard decoding.

## Export and download

```ts
const pdfBytes = await buildAnnotatedPdf(sourcePdf, annotations, {
  strategy: 'strict',
  managedNativeAnnotationIds: importedNativeIds
})
const workbookBytes = await buildAnnotationWorkbook(annotations)

downloadBlob({
  content: pdfBytes,
  filename: 'review.pdf',
  mimeType: 'application/pdf'
})
```

Exporters return content only. PDF strict mode rejects invalid annotations before
returning bytes; lenient mode skips individual invalid values and emits warnings.
Unsupported existing PDF dictionaries are retained. Workbook sheet/header labels
may be localized, but canonical type/status/reference values are not translated.

When editing annotations imported from the source PDF, pass every native ID that
the application owns through `managedNativeAnnotationIds`, including IDs deleted
after import. Export reconciles replaceable dictionaries by `/NM`: current Core
annotations replace matching originals, deleted managed entries are removed, and
unrelated or unsupported PDF dictionaries remain intact. Current annotation and
reply IDs are included automatically.

`downloadBlob` is an optional browser action boundary; it owns and releases its
temporary anchor and object URL.

## Errors

All feature boundaries use `InkLayerError` with a stable `code`, optional
`operation`, `annotationId`, `pageIndex`, and retained `cause`. Error messages do
not include PDF contents or comment text.

Viewer recovery distinguishes `PDF_LOAD_FAILED`, `PDF_LOAD_CANCELLED`,
`PDF_PASSWORD_CANCELLED`, `PDF_RANGE_FAILED`, `PDF_RANGE_UNSUPPORTED`, and
`PDF_FEATURE_FAILED`. An incorrect credential is a recoverable
`passwordRequired` event rather than a thrown error because the same PDF.js
loading task remains active. Applications branch on the code/event and retain
their own retry policy; see [Error recovery](./error-recovery.md).
