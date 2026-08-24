# 5 分钟构建 Viewer

完成本页后，浏览器会显示一个支持连续滚动、文字选择、批注和内置缩放手势的 PDF。你只需提供两个 DOM 元素和一个 PDF URL；Core 负责创建并清理文档区域。

> InkLayer Core 是无头引擎，不附带固定工具栏或侧边栏。你在自己的框架中实现控件，再调用本文展示的相同方法。

## 环境要求

- Node.js `^22.13.0` 或 `>=24.0.0`
- Vite 或 Webpack 浏览器应用
- 由应用服务器提供的 PDF URL

## 安装

```bash
npm install @inklayer-dev/core
```

## 添加 Viewer 宿主

```html
<div id="pdf-workspace">
  <div id="pages"></div>
</div>
```

滚动容器必须具有实际尺寸，其余应用布局仍由你控制：

```css
html, body, #pdf-workspace {
  height: 100%;
  margin: 0;
}

#pages {
  height: 100%;
  overflow: auto;
  background: #f2f4f7;
}
```

## 加载并显示 PDF

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: {
    container: pages,
    scale: 'page-width'
  }
})

const documentHandle = await core.load({
  url: '/documents/review.pdf',
  range: 'auto'
})

console.log(`Opened ${documentHandle.numPages} pages`)
```

现在应该能看到连续滚动的 PDF。`pageFlow` 会在 `#pages` 中挂载并虚拟化页面 Canvas、TextLayer 和批注层。服务器支持时，`range: 'auto'` 会用 HTTP 字节分块加载大型文件。

Core 已经内置版本匹配的 PDF.js Worker。普通 Vite 和 Webpack 应用不需要下载、复制或配置 `pdf.worker`。

只有自托管 CSP 或部署方式要求时才覆盖 Worker URL：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  viewer: { workerSrc: '/assets/pdf.worker.min.mjs' }
})
```

## 展示加载和密码界面

Core 报告状态，应用决定如何展示：

```ts
const stopViewer = core.viewer.subscribe(event => {
  if (event.type === 'loadProgress') {
    updateLoadingUI(event.progress)
  }
  if (event.type === 'passwordRequired') {
    openPasswordDialog(event.request)
  }
  if (event.type === 'error') {
    showDocumentError(event.error)
  }
})
```

本地文件、请求头、密码提交、进度、取消和重试见[加载 PDF](./loading-pdfs.md)。

## 卸载时清理

```ts
async function unmount() {
  stopViewer()
  await core.destroy()
}
```

条件允许时，应在复用宿主前等待 `destroy()` 完成。它会释放文档、Worker lease、页面 surface、监听器、插件和未完成任务。

## 接下来做什么

| 我想要…… | 继续阅读 |
|---|---|
| 绘制矩形或从文字创建高亮 | [创建第一个批注](./first-annotation.md) |
| 加载文件、密码、鉴权 URL 或大型 PDF | [加载 PDF](./loading-pdfs.md) |
| 增加缩放、页码导航、缩略图或目录 | [页面、缩放与导航](./viewer-and-pages.md) |
| 搜索或选择 PDF 文字 | [搜索与文字选择](./search-and-selection.md) |
| 把批注保存到后端 | [保存和恢复批注](./persistence.md) |
| 在 React、Vue 或其他框架中管理生命周期 | [框架接入](./framework-integration.md) |
| 增加产品服务或自定义绘制工具 | [插件概览](./plugins.md) |

## 后续会遇到的术语

- `createInkLayer()` 会以一个实例创建 Viewer、批注引擎、可选 Page Flow 和已安装插件。
- Page Flow 是 Core 可选的单页/连续/对页布局和虚拟化。
- Repository 是可保存批注的唯一数据来源。
- Capability 是实例级能力插件，例如日志、持久化、文字输入、打印或下载。

完成普通教程并不需要先理解这些架构术语；开发适配器或插件时再深入即可。
