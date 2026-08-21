# Viewer and page flow

## Load bytes or a URL

```ts
await core.load({ data: pdfBytes })

await core.load({
  url: '/documents/large.pdf',
  range: 'auto',
  rangeChunkSize: 256 * 1024
})
```

`range: 'auto'` probes the server and falls back only when byte ranges are not
supported. Progress events distinguish probing, downloading, and parsing.

## Passwords and cancellation

Handle `passwordRequired` in application UI. Return credentials only through
the matching request ID; Core never stores the password in snapshots or errors.

```ts
core.viewer.subscribe(event => {
  if (event.type !== 'passwordRequired') return
  showPasswordDialog({
    reason: event.request.reason,
    submit: password => core.viewer.submitPassword(event.request.id, password),
    cancel: () => core.viewer.cancelPassword(event.request.id)
  })
})

await core.cancelLoad()
```

## Scale and navigation

Core accepts numeric scales and adaptive presets: `auto`, `page-actual`,
`page-fit`, `page-width`, and `page-height`. It also owns bounded zoom steps,
touch pinch, and Ctrl/Meta+wheel zoom when configured with Viewer containers.

```ts
core.viewer.setScale('page-width')
core.viewer.zoomIn()
core.viewer.goToPage(7)
```

## Single page and continuous flow

Use `pageFlow: false` when your application mounts individual pages manually.
For a Core-owned continuous/facing layout, provide a stable scroll container:

```ts
const core = await createInkLayer({
  root,
  viewer: { container: viewerContainer, viewerElement },
  pageFlow: { container: flowContainer, scale: 'page-width' }
})

await core.load(source)
const flow = core.getPageFlow()
```

Page Flow virtualizes long documents and owns attached Canvas, TextLayer, and
annotation surfaces. Product code styles the surrounding container and consumes
visible-page state; it does not recycle Core-owned page elements.

## Outline, thumbnails, and search

The Viewer returns data and image resources; your framework chooses how to
display them.

```ts
const outline = await core.viewer.getOutline()
const result = await core.viewer.search(query, {
  matchCase: false,
  wholeWord: false,
  matchDiacritics: false
})

core.viewer.setSearchHighlights(result.matches, 0)
core.viewer.goToPage(result.matches[0].pageIndex)

const thumbnail = await core.viewer.renderThumbnail({ pageIndex: 0, scale: 0.2 })
```

Release thumbnail resources according to their documented ownership and clear
transient highlights when the search UI closes.

## Text selection

Attach Core TextLayers when not using Page Flow. Same-page and cross-page
selections are normalized to page-local rectangles. The framework renders the
context menu and calls `createTextMarkup()` for Highlight, Underline, or
Strikeout. Selection itself is not persisted.
