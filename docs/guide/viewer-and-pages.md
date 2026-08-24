# Pages, zoom, and navigation

This guide controls a document after it has loaded. Page Flow can render a long document as a virtualized scrolling surface; your toolbar calls simple navigation and scale methods.

## Choose a page layout

```ts
await core.viewer.setLayoutMode('single')
await core.viewer.setLayoutMode('continuous')
await core.viewer.setLayoutMode('facing')
```

The product owns the layout buttons and surrounding scrollbar style. Core owns page order, visible-page state, attached Canvas/TextLayer/annotation surfaces, and offscreen cleanup.

## Set a useful scale

```ts
core.viewer.setScale('page-width')
core.viewer.setScale('page-fit')
core.viewer.setScale('page-actual')
core.viewer.setScale(1.25)
```

Available adaptive presets are `auto`, `page-actual`, `page-fit`, `page-width`, and `page-height`. All presets and numeric values produce one `PdfZoomState`, so the toolbar does not need separate zoom models.

## Add zoom buttons

```ts
zoomInButton.onclick = () => core.viewer.zoomIn()
zoomOutButton.onclick = () => core.viewer.zoomOut()
```

Core also handles bounded Ctrl/Meta+wheel zoom and two-touch pinch input. Both keep the gesture midpoint anchored. Set `enablePinchZoom: false` only when the host intentionally disables these gestures.

## Go to a page

```ts
core.viewer.goToPage(7) // zero-based page index
```

If you need Page Flow scrolling behavior directly:

```ts
const flow = core.getPageFlow()
flow?.scrollToPage(7, 'smooth')
```

Subscribe to Viewer or Page Flow state to update the visible page number instead of guessing from scroll position in framework code.

## Show an outline and thumbnails

```ts
const outline = await core.viewer.getOutline()
const destination = await core.viewer.resolveDestination(outline[0]?.destination)

const thumbnail = await core.viewer.renderThumbnail({
  pageIndex: 0,
  maxWidth: 160
})

const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
thumbnailImage.src = thumbnailUrl
```

Your framework renders the outline tree and thumbnail grid. Revoke every object URL it creates after the UI no longer needs it:

```ts
URL.revokeObjectURL(thumbnailUrl)
```

## Mount pages yourself

Omit `pageFlow` only when your adapter needs complete ownership of page layout. It must then render pages and attach TextLayer and annotation surfaces itself. Start with Core-managed Page Flow unless you have that requirement.

For source loading and passwords, see [Load PDFs](./loading-pdfs.md). For document text, see [Search and text selection](./search-and-selection.md).
