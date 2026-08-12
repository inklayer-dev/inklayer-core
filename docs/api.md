# Public API

## Package entries

| Entry | Purpose | Heavy runtime |
|---|---|---|
| `inklayer-core` | Domain, repository, collaboration, Viewer/Annotation factories, browser ports | PDF.js/Konva loaded only when used |
| `inklayer-core/viewer` | PDF.js Viewer facade and lifecycle types | PDF.js |
| `inklayer-core/annotation` | Annotation facade, tools, events, ports, snapshot validator | Konva after page attach |
| `inklayer-core/import/pdfjs` | Native decoding, optional metadata inspection, storage hiding | pdf-lib only during metadata inspection |
| `inklayer-core/export/pdf` | Existing PDF bytes → annotated PDF bytes | pdf-lib |
| `inklayer-core/export/excel` | Canonical annotations → XLSX bytes | ExcelJS |
| `inklayer-core/style` | Generated instance-scoped engine CSS | CSS only |

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
`requestFreeText` and the configured `TextInputProvider`. Stamp creation requires
image content. Selection is transient and never persisted as an annotation type.

Comments, workflow status, updates, transforms, deletes, navigation, hover,
selection, permissions, and typed events are facade operations. The repository
remains the sole source of truth. Supplied repositories are consumer-owned;
default repositories are engine-owned.

Annotations are draggable only while the Select tool is active. Transform
affordances are geometry-specific: box resize/rotation where valid, proportional
resize for image/path-like content, endpoint editing for Line/Arrow, vertex
editing for Polygon/Polyline, move-only Note, and no transform handles for text
markup. Pointer feedback is continuous and constrained to the page.

Successive Freehand strokes on the same attached page are merged into one
annotation until `freehandMergeDelayMs` elapses; each stroke remains independent
in Konva state and PDF `InkList` import/export. Free-highlight snaps paths within
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
  strategy: 'strict'
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

`downloadBlob` is an optional browser action boundary; it owns and releases its
temporary anchor and object URL.

## Errors

All feature boundaries use `InkLayerError` with a stable `code`, optional
`operation`, `annotationId`, `pageIndex`, and retained `cause`. Error messages do
not include PDF contents or comment text.
