# 快速开始

本页会显示一个支持连续滚动和内置缩放手势的 PDF。完成后，可以继续尝试[创建第一个批注](./first-annotation.md)、[创建第一个关键词高亮](./first-keyword-highlight.md)或[创建第一个自定义批注](./first-custom-annotation.md)。需要根据审核结果生成安全输出时，从[关键词脱敏](./first-keyword-redaction.md)开始。

开始编写下面的代码前，可以先打开 [Viewer 示例](https://core.inklayer.dev/demo/#viewer)查看完成后的最小 Viewer。

提供两个 DOM 元素和一个 PDF URL，Core 会负责创建和清理文档区域。

## 环境要求

- Node.js `^22.13.0` 或 `>=24.0.0`
- Vite 或 Webpack 浏览器应用
- 浏览器可以访问的 PDF URL

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

现在应该能看到连续滚动的 PDF。`pageFlow` 会在 `#pages` 中挂载并虚拟化页面画布、文字层和批注层。服务器支持时，`range: 'auto'` 会通过 HTTP Range 分块加载大型文件。

Core 已经内置版本匹配的 PDF.js Worker。通常情况下，Vite 和 Webpack 应用不需要下载、复制或配置 `pdf.worker`。

仅当 CSP 或部署环境要求自行托管 Worker 时，才需要覆盖 Worker URL：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  viewer: { workerSrc: '/assets/pdf.worker.min.mjs' }
})
```

## 展示加载进度和密码界面

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

重新使用由 Core 管理的宿主元素前，应尽量等待 `destroy()` 完成。它会释放当前文档、Worker 资源、页面渲染层、事件监听器、插件和未完成的任务。
