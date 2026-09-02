# Search and text selection

Core extracts and searches PDF text, then converts browser text selections into page coordinates. Your application owns the search field, results list, and the action menu shown after a selection. Both search highlights and selectable text depend on a TextLayer positioned above each page canvas.

## Understand how TextLayers are mounted

### With Page Flow

The `pageFlow` from [Getting started](./getting-started.md) handles TextLayers automatically. It creates a page shell containing three stacked layers: the page canvas, the TextLayer, and the annotation layer. When a page approaches the viewport, Page Flow renders the canvas and attaches the other two layers. When the page moves far offscreen, it detaches them and keeps only the lightweight shell.

Search state is retained by the Viewer. If a page is attached after a search starts, its TextLayer receives the same highlights automatically. Applications using Page Flow do not call `attachTextLayer()` themselves.

### When mounting pages yourself

If you omit `pageFlow`, your adapter owns the page DOM. After rendering a page canvas, create an empty overlay aligned with that canvas and attach its TextLayer with the same page index, scale, and rotation:

```ts
const textLayer = document.createElement('div')
textLayer.style.position = 'absolute'
textLayer.style.inset = '0'
pageElement.append(textLayer)

await core.viewer.attachTextLayer({
  pageIndex,
  container: textLayer,
  scale,
  rotation
})
```

The page element must be positioned so the TextLayer sits directly above its canvas. Import `@inklayer-dev/core/style` so the generated text spans receive the required selection styles.

Detach the TextLayer before removing or reusing that page host:

```ts
core.viewer.detachTextLayer(pageIndex)
textLayer.remove()
```

## Search a document

Run the search, choose the first result only when one exists, and render your application-owned results list:

```ts
const flow = core.getPageFlow()
if (!flow) throw new Error('Load a PDF before searching Page Flow.')

const result = await core.viewer.search(query, {
  matchCase: false,
  wholeWord: false,
  matchDiacritics: false,
  maxResults: 500
})

const activeIndex = result.matches.length > 0 ? 0 : null
core.viewer.setSearchHighlights(result.matches, activeIndex)
renderSearchResults(result.matches)
```

When the user chooses an item in the results list, make it the active highlight and scroll to its page:

```ts
function activateSearchResult(index: number) {
  const match = result.matches[index]
  if (!match) return

  core.viewer.setSearchHighlights(result.matches, index)
  flow.scrollToPage(match.pageIndex, 'smooth')
}
```

Search highlights are temporary Viewer state. Remove them when the search interface closes:

```ts
core.viewer.clearSearchHighlights()
```

If your adapter uses the separately configured PDF.js web Viewer instead of Page Flow, navigate with `core.viewer.goToPage(match.pageIndex)`.

## Search multiple terms in one pass

Use `searchMany()` when a product needs several keywords. Core extracts each page once for the batch, retains input query order, and reports matches in page and source-offset order within each query:

```ts
const searchController = new AbortController()
const batch = await core.viewer.searchMany([
  { id: 'risk', query: 'automatic renewal', options: { wholeWord: true } },
  { id: 'payment', query: 'payment term' },
  { id: 'liability', query: 'liability', options: { maxResults: 200 } }
], {
  signal: searchController.signal,
  maxTotalResults: 2_000,
  onProgress: ({ completedPages, totalPages }) => {
    updateSearchProgress(completedPages, totalPages)
  }
})

for (const query of batch.queries) {
  renderKeywordMatches(query.id, query.matches, query.truncated)
}
```

Query IDs must be unique. Each query accepts ordinary `PdfSearchOptions`; its default result limit is 1,000. The batch-wide default limit is 100,000. `truncated` on a query means its own limit was reached, while top-level `truncated` means the batch-wide limit stopped further scanning.

Progress starts at zero and advances after each completed page. An empty batch, or a batch containing only empty normalized queries, returns immediately without progress callbacks. Calling `searchController.abort()` rejects with `PDF_FEATURE_CANCELLED` and leaves the loaded document ready for another operation.

## Resolve source ranges to page geometry

Search matches identify text with a zero-based page index and UTF-16 source offsets. Resolve those offsets before creating text-markup annotations or another geometry-based feature:

```ts
const search = await core.viewer.search('termination clause')
const ranges = await core.viewer.resolveTextRanges(search.matches, {
  signal: geometryController.signal
})

for (const range of ranges) {
  console.log(range.text, range.rects)
}
```

Results retain caller order. Each result contains the exact source substring and one or more rectangles in scale-one page coordinates with a top-left origin. Geometry already reflects the PDF page rotation and does not depend on Viewer zoom or an attached TextLayer. A range may span multiple PDF.js text items and line endings, but it must stay on one page.

Invalid offsets, surrogate-pair splits, newline-only ranges, and text items without usable geometry reject with `PDF_FEATURE_FAILED` instead of returning an imprecise whole-line rectangle. Caller cancellation and document replacement reject with `PDF_FEATURE_CANCELLED`. Page text extracted by `search()`, `searchMany()`, and `resolveTextRanges()` shares the same generation-scoped cache.

## Layer temporary text highlights

Use temporary layers when several rule groups need independent colors or review state. This state belongs to the Viewer and does not create annotations:

```ts
core.viewer.setTextHighlightLayers([
  {
    id: 'risk',
    ranges: riskMatches,
    style: { color: '#ef4444', activeColor: '#b91c1c' },
    activeRangeIndex: 2
  },
  {
    id: 'dates',
    ranges: dateMatches,
    style: { color: '#f59e0b' },
    visible: true
  }
])
```

Every call atomically replaces the complete ordered layer collection. Earlier layers are below later layers when ranges overlap. `activeRangeIndex` refers to the original `ranges` order. Setting `visible: false` retains a layer without projecting marks.

```ts
core.viewer.clearTextHighlightLayers(['dates']) // retain every other layer
core.viewer.clearTextHighlightLayers()          // clear all temporary layers
```

Core detaches the supplied objects, validates the whole replacement before changing state, and restores retained layers when a virtualized TextLayer is mounted again. Replacing the PDF document clears the old generation with its TextLayer controller. Legacy `setSearchHighlights()` decoration can coexist with these caller-owned layers.

Projected marks expose `data-inklayer-highlight-layer`, `data-inklayer-highlight-range`, and `data-inklayer-highlight-state` for functional testing and application selectors. Their engine-owned classes and custom properties are implementation details; applications should set colors through the public layer style.

These Viewer methods are the low-level primitives. To build the complete rules → scan → preview → review → permanent annotation workflow, follow the standalone [Keyword Highlighter guide](./highlighter.md).

## Create permanent text markups from ranges

After review, convert resolved ranges to ordinary Annotation Engine records. Supply deterministic document-level IDs so a repeated application skips annotations that already exist:

```ts
const created = core.annotations.createTextMarkupsFromRanges(
  'highlight',
  ranges.map((range, index) => ({
    id: deterministicAnnotationId(documentFingerprint, ruleId, index),
    range,
    extensions: {
      highlighter: { ruleId, matchId: `${ruleId}:${index}` }
    }
  })),
  { appearance: { fill: { color: '#f59e0b' } } }
)
```

Each multi-line range becomes one annotation with multiple text rectangles. Input order determines repository and reference-number order. Existing IDs, including duplicates earlier in the same call, are skipped and omitted from the return value. New entries use the engine's current identity, clock, appearance, permission policy, and repository behavior; application metadata is bounded, validated, and detached before storage.

P0 commits entries sequentially rather than as one repository transaction. If permission or validation fails, the call throws and stops, while earlier successful entries remain canonical. Creation does not enter deletion undo history and does not select annotations or change the active tool. Deleting or undoing one later remains an explicit Annotation Engine operation.

PDF export writes the stable annotation ID as `/NM`, and the metadata-aware PDF.js importer restores it after reload so the same deterministic ID still prevents duplication. Arbitrary `extensions` remain canonical repository metadata; only the stable ID is currently guaranteed through PDF export and re-import.

## Let users select PDF text

Add an application button that switches pointer input to text selection:

```ts
selectTextButton.onclick = () => {
  core.annotations.setTool('text-select')
}
```

Listen for retained selection state to open or close your contextual action menu:

```ts
const stopSelection = core.viewer.subscribe(event => {
  if (event.type !== 'textSelectionChanged') return

  if (event.selection) {
    openSelectionMenu(event.selection)
  } else {
    closeSelectionMenu()
  }
})
```

Call `stopSelection()` during component cleanup. Core keeps the normalized selection after focus moves to your menu, so an action can read it with `core.viewer.getTextSelection()`. Clear it with `core.viewer.clearTextSelection()` after the action or when the user presses Escape.

To turn the retained selection into Highlight, Underline, or Strikeout annotations, follow [Create your first annotation](./first-annotation.md). That guide includes the same-page and cross-page creation flow, so it is not repeated here.

## Preserve focus correctly

A menu opened from pointer selection should not take focus automatically. A menu opened from keyboard selection should move focus to its first action. After an action or Escape, clear the selection and restore the previous document focus target. See [Accessibility](../accessibility.md).
