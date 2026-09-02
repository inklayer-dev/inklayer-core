# 页面、缩放与导航

打开 [Viewer 示例](https://core.inklayer.dev/demo/#viewer)，可以在默认 Continuous 布局中体验本页 API。

本页介绍 PDF 加载完成后的页面跳转和缩放。首先使用[快速开始](./getting-started.md)中由 Core 管理的连续多页视图，然后介绍另一条渲染路径：PDF.js web Viewer 提供的单页和对页模式。

## 使用连续多页视图

快速开始中配置的 `pageFlow` 会为整份文档创建一个虚拟化的垂直滚动区域。`core.load()` 完成后，可以从同一个 `core` 实例取得控制器：

```ts
const flow = core.getPageFlow()
if (!flow) throw new Error('请先加载 PDF，再访问 Page Flow。')
```

Page Flow 会为所有页面创建轻量占位，只渲染视口附近的页面。页面顺序、页面画布、文字层、批注层、当前页判断和离屏清理由 Core 负责；工具栏和滚动条样式由应用负责。

### 跳转到指定页面

向用户显示的页码通常从 1 开始，而 Core API 使用从 0 开始的页面索引：

```ts
const pageNumber = 8
flow.scrollToPage(pageNumber - 1, 'smooth')
```

如果需要让页码输入框跟随滚动更新，请在创建 `core` 时为 `pageFlow` 添加 `onCurrentPageChanged`：

```ts
pageFlow: {
  container: pages,
  scale: 'page-width',
  onCurrentPageChanged(pageIndex) {
    pageNumberOutput.textContent = String(pageIndex + 1)
  }
}
```

### 调整缩放比例

```ts
await flow.setScale('page-width')
await flow.setScale('page-fit')
await flow.setScale(1.25)

zoomInButton.onclick = () => { void flow.zoomIn() }
zoomOutButton.onclick = () => { void flow.zoomOut() }
```

可用预设包括 `auto`、`page-actual`、`page-fit`、`page-width` 和 `page-height`。Core 还会处理 Ctrl/Meta + 滚轮和双指捏合缩放，并保持手势中心对应的文档位置不变。只有应用明确需要禁用这些手势时，才在 `pageFlow` 选项中设置 `enablePinchZoom: false`。

## 切换单页、连续和对页布局

`setLayoutMode()` 属于 PDF.js web Viewer 渲染路径，需要配置 `viewer.container`，不会改变上面由 Core 管理的 Page Flow。不要把两种渲染器挂载到同一个 DOM 区域。

| 模式 | 显示效果 |
|---|---|
| `single` | 每次显示一页。 |
| `continuous` | 垂直连续滚动所有页面。 |
| `facing` | 每次显示一个双页对开。 |
| `continuous-facing` | 连续滚动多个双页对开。 |

如果适配器使用 PDF.js web Viewer，可以把布局控件连接到用户选择的模式：

```ts
import type { PdfViewerLayoutMode } from '@inklayer-dev/core'

async function changeLayout(mode: PdfViewerLayoutMode) {
  await core.viewer.setLayoutMode(mode)
}

await changeLayout('facing')
```

在同一条 Viewer 渲染路径中，缩放使用 `core.viewer.setScale()`、`zoomIn()` 和 `zoomOut()`。跳转页面时传入从 0 开始的页面索引：

```ts
core.viewer.setScale('page-width')
core.viewer.goToPage(7)
```

除非产品明确需要单页或对页模式，否则建议从连续多页 Page Flow 开始。

## 展示文档目录

`getOutline()` 返回由应用渲染的目录树。PDF 内部目标已经解析到 `item.target`：

```ts
const outline = await core.viewer.getOutline()
const firstItem = outline[0]

if (firstItem?.target) {
  const flow = core.getPageFlow()
  if (flow) {
    flow.scrollToPage(firstItem.target.pageIndex, 'smooth')
  } else {
    core.viewer.goToPage(firstItem.target.pageIndex)
  }
}
```

目录项也可能包含外部 `url`。是否打开以及如何打开外部链接，由应用决定。

## 展示缩略图

缩略图进入界面时，为它创建一个对象 URL（object URL）：

```ts
const thumbnail = await core.viewer.renderThumbnail({
  pageIndex: 0,
  maxWidth: 160
})

const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
thumbnailImage.src = thumbnailUrl
```

只有缩略图被移除或文档被替换时，才释放这个 URL：

```ts
function removeThumbnail() {
  thumbnailImage.removeAttribute('src')
  URL.revokeObjectURL(thumbnailUrl)
}
```

应用需要管理自己创建的所有对象 URL，并在替换文档或卸载组件时释放仍然存在的缩略图 URL。

## 自行挂载页面

只有适配器确实需要完全控制页面布局时才省略 `pageFlow`。此时适配器还必须自行渲染页面并挂载文字层和批注层。文字层的挂载和卸载方式见[搜索与文字选择](./search-and-selection.md#自行挂载页面时)。没有这一要求时，优先使用由 Core 管理的 Page Flow。

文档来源和密码见[加载 PDF](./loading-pdfs.md)，文档文字见[搜索与文字选择](./search-and-selection.md)。
