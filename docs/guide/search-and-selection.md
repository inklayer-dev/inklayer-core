# Search and text selection

Core extracts PDF text, finds matches in document order, projects highlights into attached TextLayers, and converts browser selections into page coordinates. Your application owns the search field, results list, and contextual action menu.

## Search a document

```ts
const result = await core.viewer.search(query, {
  matchCase: false,
  wholeWord: false,
  matchDiacritics: false,
  maxResults: 500
})

core.viewer.setSearchHighlights(result.matches, 0)
```

Render `result.matches` in your result list. To activate one result:

```ts
const match = result.matches[index]
core.viewer.setSearchHighlights(result.matches, index)
core.viewer.goToPage(match.pageIndex)
```

Clear transient highlights when the search panel closes:

```ts
core.viewer.clearSearchHighlights()
```

## Let users select PDF text

Page Flow attaches TextLayers automatically. If you mount pages yourself, call `viewer.attachTextLayer()` for each page. Then route pointer input to text:

```ts
core.annotations.setTool('text-select')
```

Listen for retained selection state to position your menu:

```ts
const stop = core.viewer.subscribe(event => {
  if (event.type === 'textSelectionChanged' && event.selection) {
    openSelectionMenu(event.selection)
  }
})
```

## Create text markup

```ts
const active = core.viewer.getTextSelection()
if (active?.kind === 'page') {
  core.annotations.createTextMarkup('highlight', active.selection)
} else if (active?.kind === 'document') {
  for (const fragment of active.selection.fragments) {
    core.annotations.createTextMarkup('highlight', fragment)
  }
}
core.viewer.clearTextSelection()
```

Use `underline` or `strikeout` for the other text markup types. Core keeps every persisted annotation page-scoped even when the browser selection crosses pages.

## Preserve focus correctly

Pointer selection opens the product menu without moving focus. Keyboard selection should move focus to the first menu action. After an action or Escape, clear the selection and restore the previous document focus target. See [Accessibility](../accessibility.md).
