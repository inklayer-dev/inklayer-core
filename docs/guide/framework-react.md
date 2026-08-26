# React integration

Build a PDF Viewer with React. Start with a small component, then add page navigation, thumbnails, an annotation toolbar, and a sidebar.

## Start with a minimal Viewer

Create and load Core inside an effect, then destroy the instance when the component unmounts:

::: code-group

```tsx [PdfViewer.tsx]
import { useEffect, useRef } from 'react'
import type { InkLayerInstance } from '@inklayer-dev/core'
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

export function PdfViewer({ source }: { source: string }) {
  const root = useRef<HTMLDivElement>(null)
  const pages = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let core: InkLayerInstance | undefined

    async function open() {
      core = await createInkLayer({
        root: root.current!,
        pageFlow: { container: pages.current!, scale: 'page-width' }
      })

      await core.load({ url: source })
    }

    void open()
    return () => { void core?.destroy() }
  }, [source])

  return (
    <div ref={root} style={{ height: '100vh' }}>
      <div ref={pages} style={{ height: '100%', overflow: 'auto' }} />
    </div>
  )
}
```

:::

Import the component in its parent and provide the PDF URL:

::: code-group

```tsx [App.tsx]
import { PdfViewer } from './PdfViewer'

export default function App() {
  return <PdfViewer source="/documents/review.pdf" />
}
```

:::

## Add navigation and thumbnails

Page Flow handles page navigation and zoom. Render thumbnails as blobs, then create image URLs for the sidebar:

::: code-group

```ts [PdfWorkspace.tsx]
core.getPageFlow()?.scrollToPage(pageIndex)
await core.getPageFlow()?.zoomIn()

const thumbnail = await core.viewer.renderThumbnail({ pageIndex, maxWidth: 140 })
const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
```

:::

Keep each thumbnail URL until its image is removed, then release it with `URL.revokeObjectURL(thumbnailUrl)`.

## Build an annotation workspace

This complete component combines navigation, zoom, thumbnails, a rectangle tool, and a live annotation list. React owns the surrounding interface; Core renders into the page container:

::: code-group

```tsx [PdfWorkspace.tsx]
import { useEffect, useRef, useState } from 'react'
import type { Annotation, InkLayerInstance } from '@inklayer-dev/core'
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'
import './PdfWorkspace.css'

export function PdfWorkspace({ source }: { source: string }) {
  const root = useRef<HTMLDivElement>(null)
  const pages = useRef<HTMLDivElement>(null)
  const core = useRef<InkLayerInstance | undefined>(undefined)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [thumbnails, setThumbnails] = useState<Array<{ pageIndex: number; url: string }>>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    let stop: (() => void) | undefined
    const thumbnailUrls: string[] = []

    async function open() {
      const instance = await createInkLayer({
        root: root.current!,
        pageFlow: {
          container: pages.current!,
          scale: 'page-width',
          onCurrentPageChanged: setCurrentPage,
          onScaleChanged: state => setZoom(state.percentage)
        }
      })

      core.current = instance
      const pdf = await instance.load({ url: source })
      setPageCount(pdf.numPages)

      stop = instance.annotations.repository.subscribe(() => {
        setAnnotations([...instance.annotations.repository.getAll()])
      })

      for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
        const thumbnail = await instance.viewer.renderThumbnail({ pageIndex, maxWidth: 140 })
        const url = URL.createObjectURL(thumbnail.blob)
        thumbnailUrls.push(url)
        setThumbnails(items => [...items, { pageIndex, url }])
      }
    }

    void open()

    return () => {
      stop?.()
      for (const url of thumbnailUrls) URL.revokeObjectURL(url)
      void core.current?.destroy()
      core.current = undefined
    }
  }, [source])

  function goTo(pageIndex: number) {
    if (pageIndex >= 0 && pageIndex < pageCount) {
      core.current?.getPageFlow()?.scrollToPage(pageIndex)
    }
  }

  function selectAnnotation(annotation: Annotation) {
    core.current?.annotations.setSelection({ ids: [annotation.id] })
    goTo(annotation.pageIndex)
  }

  return (
    <div ref={root} className="workspace">
      <header className="toolbar">
        <button onClick={() => goTo(currentPage - 1)}>Previous</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button onClick={() => goTo(currentPage + 1)}>Next</button>
        <button onClick={() => core.current?.getPageFlow()?.zoomOut()}>−</button>
        <span>{zoom}%</span>
        <button onClick={() => core.current?.getPageFlow()?.zoomIn()}>+</button>
        <button onClick={() => core.current?.annotations.setTool('select')}>Select</button>
        <button onClick={() => core.current?.annotations.setTool('rectangle')}>Rectangle</button>
      </header>

      <aside className="sidebar">
        {thumbnails.map(thumbnail => (
          <button key={thumbnail.pageIndex} onClick={() => goTo(thumbnail.pageIndex)}>
            <img src={thumbnail.url} alt={`Page ${thumbnail.pageIndex + 1}`} />
          </button>
        ))}
      </aside>

      <div ref={pages} className="pages" />

      <aside className="sidebar">
        {annotations.map(annotation => (
          <button key={annotation.id} onClick={() => selectAnnotation(annotation)}>
            {annotation.type} · Page {annotation.pageIndex + 1}
          </button>
        ))}
      </aside>
    </div>
  )
}
```

```css [PdfWorkspace.css]
.workspace {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 220px;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100vh;
}

.toolbar { grid-column: 1 / -1; }
.pages, .sidebar { overflow: auto; }
.sidebar img { max-width: 100%; }
```

:::

Render the workspace from your application entry point:

::: code-group

```tsx [App.tsx]
import { PdfWorkspace } from './PdfWorkspace'

export default function App() {
  return <PdfWorkspace source="/documents/review.pdf" />
}
```

:::

For text highlights, author permissions, and saving annotations, see [Create your first annotation](./first-annotation) and [Persist annotations](./persistence).
