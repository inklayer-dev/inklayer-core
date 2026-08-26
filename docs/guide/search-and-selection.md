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
