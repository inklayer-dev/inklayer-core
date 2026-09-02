# Vanilla JavaScript integration

Build a PDF Viewer without a UI framework. Start with the smallest working example, then add page navigation, thumbnails, an annotation toolbar, and a sidebar. For framework-specific examples, see [Vue integration](./framework-vue) and [React integration](./framework-react).

> [!NOTE] NOTE
> Core renders PDF pages and their annotation layers. Your application provides the toolbar, sidebars, and layout.

## Start with a minimal Viewer

Create a root element and an empty page container:

::: code-group

```html [index.html]
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>PDF Viewer</title>
  </head>
  <body>
    <main id="pdf-workspace">
      <div id="pages"></div>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

:::

Give the page container a height and enable scrolling:

::: code-group

```css [src/style.css]
html, body, #pdf-workspace { height: 100%; margin: 0; }
#pages { height: 100%; overflow: auto; }
```

:::

Create Core and load the PDF:

::: code-group

```ts [src/main.ts]
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'
import './style.css'

const core = await createInkLayer({
  root: document.querySelector<HTMLElement>('#pdf-workspace')!,
  pageFlow: {
    container: document.querySelector<HTMLDivElement>('#pages')!,
    scale: 'page-width'
  }
})

await core.load({ url: '/documents/review.pdf' })
```

:::

Core renders the PDF pages inside `#pages` and handles continuous scrolling.

## Add navigation and thumbnails

Replace the minimal layout with a toolbar and two sidebars. Keep `#pages` empty so Core can render into it:

::: code-group

```html [index.html]
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>PDF annotation workspace</title>
  </head>
  <body>
    <main id="pdf-workspace" class="workspace">
      <header class="toolbar">
        <button id="previous">Previous</button>
        <span id="page-number">1</span>
        <button id="next">Next</button>
        <button id="zoom-out">−</button>
        <span id="zoom">100%</span>
        <button id="zoom-in">+</button>
        <button id="select">Select</button>
        <button id="rectangle">Rectangle</button>
      </header>

      <aside id="thumbnails" class="sidebar"></aside>
      <div id="pages" class="pages"></div>
      <aside id="annotations" class="sidebar"></aside>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```css [src/style.css]
html, body, #pdf-workspace { height: 100%; margin: 0; }

.workspace {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 220px;
  grid-template-rows: auto minmax(0, 1fr);
}

.toolbar { grid-column: 1 / -1; }
.pages, .sidebar { overflow: auto; }
.sidebar img { max-width: 100%; }
```

:::

## Build an annotation workspace

Connect the buttons, generate thumbnails, and subscribe to annotation changes. Clicking an annotation selects it and opens its page:

::: code-group

```ts [src/main.ts]
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'
import './style.css'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!
const thumbnailList = document.querySelector<HTMLElement>('#thumbnails')!
const annotationList = document.querySelector<HTMLElement>('#annotations')!
const pageNumber = document.querySelector<HTMLElement>('#page-number')!
const zoom = document.querySelector<HTMLElement>('#zoom')!
const thumbnailUrls: string[] = []
let currentPage = 0

const core = await createInkLayer({
  root,
  pageFlow: {
    container: pages,
    scale: 'page-width',
    onCurrentPageChanged(pageIndex) {
      currentPage = pageIndex
      pageNumber.textContent = String(pageIndex + 1)
    },
    onScaleChanged(state) {
      zoom.textContent = `${state.percentage}%`
    }
  }
})

const pdf = await core.load({ url: '/documents/review.pdf' })
const pageFlow = core.getPageFlow()!

document.querySelector<HTMLButtonElement>('#previous')!.onclick = () => {
  pageFlow.scrollToPage(Math.max(0, currentPage - 1))
}
document.querySelector<HTMLButtonElement>('#next')!.onclick = () => {
  pageFlow.scrollToPage(Math.min(pdf.numPages - 1, currentPage + 1))
}
document.querySelector<HTMLButtonElement>('#zoom-out')!.onclick = () => {
  void pageFlow.zoomOut()
}
document.querySelector<HTMLButtonElement>('#zoom-in')!.onclick = () => {
  void pageFlow.zoomIn()
}
document.querySelector<HTMLButtonElement>('#select')!.onclick = () => {
  core.annotations.setTool('select')
}
document.querySelector<HTMLButtonElement>('#rectangle')!.onclick = () => {
  core.annotations.setTool('rectangle')
}

for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
  const thumbnail = await core.viewer.renderThumbnail({ pageIndex, maxWidth: 140 })
  const url = URL.createObjectURL(thumbnail.blob)
  thumbnailUrls.push(url)

  const button = document.createElement('button')
  const image = document.createElement('img')
  image.src = url
  image.alt = `Page ${pageIndex + 1}`
  button.append(image)
  button.onclick = () => pageFlow.scrollToPage(pageIndex)
  thumbnailList.append(button)
}

function updateAnnotations(): void {
  annotationList.replaceChildren()

  for (const annotation of core.annotations.repository.getAll()) {
    const button = document.createElement('button')
    button.textContent = `${annotation.type} · Page ${annotation.pageIndex + 1}`
    button.onclick = () => {
      core.annotations.setSelection({ ids: [annotation.id] })
      pageFlow.scrollToPage(annotation.pageIndex)
    }
    annotationList.append(button)
  }
}

const stop = core.annotations.repository.subscribe(updateAnnotations)

export async function destroyPdfWorkspace(): Promise<void> {
  stop()
  for (const url of thumbnailUrls) URL.revokeObjectURL(url)
  await core.destroy()
}
```

:::

Call `destroyPdfWorkspace()` when the workspace is removed. For text highlights, author permissions, and saving annotations, see [Create your first annotation](./first-annotation) and [Persist annotations](./persistence).

## Add the keyword review workflow

Read the standalone [Keyword Highlighter guide](./highlighter.md) first for the complete Controller contract, rule model, review states, permanent application, errors, limits, and lifecycle.

The maintained Vanilla application now includes a complete product-owned Highlighter panel: editable colored rules, scan progress and cancellation, grouped match review, active-match navigation, permanent application, duplicate reporting, preview clearing, and reset. Its UI lives in [`HighlighterPanel`](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/vanilla/src/ui/highlighter-panel.ts); the reusable workflow remains entirely inside `@inklayer-dev/core/highlighter`.

Use the same ownership order as the example: construct the Controller after Viewer and Annotation Engine, subscribe the panel, then unsubscribe and call `highlighter.destroy()` before destroying the injected engines. No DOM elements or framework state cross into Core.
