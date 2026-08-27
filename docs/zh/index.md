---
layout: home

hero:
  name: InkLayer Core
  text: 面向所有 Web 框架的 PDF 引擎
  tagline: 你负责产品界面，Core 负责 PDF 查看、批注、页面渲染、打印和导出。
  image:
    light: /hero-engine.svg
    dark: /hero-engine-dark.svg
    alt: 带文字高亮和选中手写批注的 PDF 文档。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: API 参考
      link: /zh/api
    - theme: alt
      text: 在线示例
      link: 'https://core.inklayer.dev/demo/'

features:
  - title: 使用你熟悉的 Web 框架
    details: 无论使用 React、Vue、Svelte、Angular、Web Components 还是原生 TypeScript，都调用同一套 Core API。
    link: /zh/guide/framework-integration
  - title: PDF 能力，由 Core 提供
    details: 查看、批注、缩放、搜索、水印、打印和导出都由 Core 处理，界面和操作流程仍由你的应用掌控。
    link: /zh/guide/viewer-and-pages
  - title: 批注内置，也能扩展
    details: 直接使用高亮、文字、图形、签名等十六种批注类型，需要时还可以定义自己的工具。
    link: /zh/guide/plugins
  - title: 从创建到销毁，行为可控
    details: 可以取消正在进行的加载、完整销毁实例，并让多个 Viewer 相互隔离；在 SSR 环境中导入 Core 也同样安全。
    link: /zh/error-recovery
---

## 从 Core 开始

安装 Core，提供两个宿主元素，为滚动容器设置明确尺寸，然后加载 PDF。

```bash
npm install @inklayer-dev/core
```

```html
<div id="pdf-workspace">
  <div id="pages"></div>
</div>
```

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

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})
await core.load({ url: '/documents/review.pdf', range: 'auto' })
```

[快速开始 →](/zh/guide/getting-started)
> [!IMPORTANT] 注意
> InkLayer Core 是无头引擎：它负责 PDF 与批注行为，框架负责工具栏、面板和产品流程。

## 接下来想做什么？

[加载 PDF →](/zh/guide/loading-pdfs) ·
[创建第一个批注 →](/zh/guide/first-annotation) ·
[打印和导出 →](/zh/guide/output-and-security)

## 需要时再扩展

能力插件可以为单个实例接入日志、批注存储、文字输入、打印和下载等应用服务。批注类型定义（Annotation Type Definition）则用于添加带命名空间的绘制工具。无论如何扩展，坐标、数据校验、交互、渲染、输出和清理始终由 Core 管理。

[开发第一个插件 →](/zh/guide/capability-plugin)
