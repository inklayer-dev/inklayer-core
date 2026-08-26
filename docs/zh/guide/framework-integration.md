# 原生 JavaScript 接入

不依赖 UI 框架搭建 PDF 查看器：先完成最简单的文档查看，再加入页面导航、缩略图、批注工具栏和侧边栏。Vue 和 React 的实现请分别参考 [Vue 接入](./framework-vue)与 [React 接入](./framework-react)。

> [!NOTE] 提示
> Core 负责渲染 PDF 页面和批注图层；工具栏、侧边栏和整体布局由应用自行实现。

## 搭建最简单的查看器

先创建根元素和一个空的页面容器：

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <title>PDF 查看器</title>
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

为页面容器设置高度，并开启滚动：

::: code-group

```css [src/style.css]
html, body, #pdf-workspace { height: 100%; margin: 0; }
#pages { height: 100%; overflow: auto; }
```

:::

创建 Core 实例并加载 PDF：

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

Core 会在 `#pages` 中渲染 PDF 页面，并提供连续滚动。

## 添加页面导航和缩略图

在基础布局中加入工具栏和左右侧边栏，并保持 `#pages` 为空，交给 Core 渲染页面：

::: code-group

```html [index.html]
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <title>PDF 批注工作区</title>
  </head>
  <body>
    <main id="pdf-workspace" class="workspace">
      <header class="toolbar">
        <button id="previous">上一页</button>
        <span id="page-number">1</span>
        <button id="next">下一页</button>
        <button id="zoom-out">−</button>
        <span id="zoom">100%</span>
        <button id="zoom-in">+</button>
        <button id="select">选择</button>
        <button id="rectangle">矩形</button>
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

## 搭建批注工作区

接下来绑定工具栏按钮、生成缩略图，并订阅批注变化。点击批注列表中的条目时，会选中对应批注并跳转到所在页面：

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
  image.alt = `第 ${pageIndex + 1} 页`
  button.append(image)
  button.onclick = () => pageFlow.scrollToPage(pageIndex)
  thumbnailList.append(button)
}

function updateAnnotations(): void {
  annotationList.replaceChildren()

  for (const annotation of core.annotations.repository.getAll()) {
    const button = document.createElement('button')
    button.textContent = `${annotation.type} · 第 ${annotation.pageIndex + 1} 页`
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

移除工作区时调用 `destroyPdfWorkspace()`。文字高亮、作者权限和批注保存请分别参考[创建第一个批注](./first-annotation)与[保存和恢复批注](./persistence)。
