# React 接入

使用 React 搭建 PDF 查看器：先实现最简单的文档查看，再加入页面导航、缩略图、批注工具栏和侧边栏。

## 搭建最简单的查看器

在 effect 中创建 Core 实例并加载 PDF，组件卸载时销毁实例：

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

在父组件中引入 `PdfViewer`，并传入 PDF 地址：

::: code-group

```tsx [App.tsx]
import { PdfViewer } from './PdfViewer'

export default function App() {
  return <PdfViewer source="/documents/review.pdf" />
}
```

:::

## 添加页面导航和缩略图

通过 Page Flow 控制页面跳转和缩放。缩略图由 Core 渲染成 Blob，然后转换成侧边栏可以使用的图片地址：

::: code-group

```ts [PdfWorkspace.tsx]
core.getPageFlow()?.scrollToPage(pageIndex)
await core.getPageFlow()?.zoomIn()

const thumbnail = await core.viewer.renderThumbnail({ pageIndex, maxWidth: 140 })
const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
```

:::

缩略图显示期间需要保留图片地址，移除图片后再调用 `URL.revokeObjectURL(thumbnailUrl)` 释放。

## 搭建批注工作区

下面是完整组件，包含页面导航、缩放、缩略图、矩形批注工具和批注列表。React 负责工具栏与侧边栏，Core 负责渲染页面容器中的 PDF：

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
        <button onClick={() => goTo(currentPage - 1)}>上一页</button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button onClick={() => goTo(currentPage + 1)}>下一页</button>
        <button onClick={() => core.current?.getPageFlow()?.zoomOut()}>−</button>
        <span>{zoom}%</span>
        <button onClick={() => core.current?.getPageFlow()?.zoomIn()}>+</button>
        <button onClick={() => core.current?.annotations.setTool('select')}>选择</button>
        <button onClick={() => core.current?.annotations.setTool('rectangle')}>矩形</button>
      </header>

      <aside className="sidebar">
        {thumbnails.map(thumbnail => (
          <button key={thumbnail.pageIndex} onClick={() => goTo(thumbnail.pageIndex)}>
            <img src={thumbnail.url} alt={`第 ${thumbnail.pageIndex + 1} 页`} />
          </button>
        ))}
      </aside>

      <div ref={pages} className="pages" />

      <aside className="sidebar">
        {annotations.map(annotation => (
          <button key={annotation.id} onClick={() => selectAnnotation(annotation)}>
            {annotation.type} · 第 {annotation.pageIndex + 1} 页
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

在应用入口中引入并使用 `PdfWorkspace`：

::: code-group

```tsx [App.tsx]
import { PdfWorkspace } from './PdfWorkspace'

export default function App() {
  return <PdfWorkspace source="/documents/review.pdf" />
}
```

:::

文字高亮、作者权限和批注保存请分别参考[创建第一个批注](./first-annotation)与[保存和恢复批注](./persistence)。

## 订阅 Highlighter Controller

React 不需要 InkLayer 框架封装包。直接用已有 Viewer 和 Annotation Engine 端口创建 Controller，然后把稳定的订阅函数交给 `useSyncExternalStore`：

```tsx
const controller = useMemo(
  () => createKeywordHighlighter({ viewer, annotations }),
  [viewer, annotations]
)

useEffect(() => {
  controller.setRules(rules)
}, [controller, rules])
useEffect(() => () => controller.destroy(), [controller])

const snapshot = useSyncExternalStore(
  controller.subscribe,
  controller.getSnapshot,
  controller.getSnapshot
)
```

渲染 `snapshot.matches` 时使用 `match.id` 作为 React key，并在事件处理器中调用 `includeMatch()`、`excludeMatch()`、`activateMatch()` 和 `applyMatches()`。仓库中的 [React 消费 fixture](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/framework-consumers/react-keyword-highlighter.tsx)会经过类型检查和生产构建，同时不会把 React 加入 Core 的运行时依赖。
