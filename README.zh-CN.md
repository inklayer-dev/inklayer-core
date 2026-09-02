# InkLayer Core

> 面向所有 Web 框架的 PDF 引擎。

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/%40inklayer-dev%2Fcore)](https://www.npmjs.com/package/@inklayer-dev/core) [![Core CI](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml/badge.svg)](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/%40inklayer-dev%2Fcore)](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE)

InkLayer Core 是面向 Web 的无头、框架无关 PDF 交互引擎。你可以用它在 React、Vue、其他任意框架或原生 TypeScript 中构建自定义文档查看器、批注系统、规则驱动的关键词审阅与安全脱敏工作流，同时由应用完整掌控界面与产品流程。

[快速开始](https://core.inklayer.dev/zh/guide/getting-started) · [在线示例](https://core.inklayer.dev/demo/#viewer) · [文档](https://core.inklayer.dev/zh/)

## 最简单的查看器

安装：

```bash
npm install @inklayer-dev/core
```

提供根元素和滚动容器：

```html
<div id="pdf-workspace">
  <div id="pages"></div>
</div>
```

为滚动容器设置明确尺寸：

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

创建 Core 并加载 PDF：

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

await core.load({ url: '/documents/review.pdf', range: 'auto' })
```

这段代码会创建一个支持虚拟渲染、连续滚动和内置缩放手势的查看器。页面或框架组件卸载时，调用 `await core.destroy()` 释放资源。文字选择、批注工具、搜索控件等产品功能可以由应用按需启用。

Core 已包含版本匹配的 PDF.js Worker。普通 Vite 和 Webpack 应用不需要下载、复制或配置 `pdf.worker`。

[继续阅读完整教程 →](https://core.inklayer.dev/zh/guide/getting-started)

## Core 提供哪些能力

- 从 URL 或本地字节加载 PDF，支持 HTTP Range 分段请求、密码、进度、取消和重试。
- 使用单页、连续或对页布局显示文档，并提供虚拟渲染、缩放、导航、缩略图和目录能力。
- 搜索 PDF 文字，并把真实的文字选择转换成文字批注。
- 一次扫描预设的普通文字和正则规则，按规则分色预览、逐条复核命中，并把确认结果批量转换成永久高亮。
- 审阅时保留敏感词的彩色可读预览，仅在打印或导出时生成安全脱敏的图片型 PDF，使源文字无法被选择或复制。
- 创建和编辑 16 种内置批注，包括文字标记、图形、手写、便签、图章和签名。
- 管理可序列化的批注数据，包括作者、评论、引用、外观和客户端权限规则。
- 添加水印，并生成打印 PDF、带批注 PDF、用于安全打印的栅格 PDF 或批注工作簿。
- 运行多个相互隔离的实例，报告结构化错误，可靠释放资源，并在 SSR 环境中安全导入。

[创建第一个批注 →](https://core.inklayer.dev/zh/guide/first-annotation)

## 从关键词规则到安全输出

[关键词高亮](https://core.inklayer.dev/zh/guide/highlighter)直接接收应用准备好的文字和正则规则，例如合同条款、禁用词、账号或日期。Core 会统一扫描、按规则生成临时高亮，并提供不可变的审核状态；结果列表、筛选方式和操作控件仍由你的应用决定。确认后的命中还可以转成标准 PDF Highlight 批注，无需自行处理文字几何定位。

[安全关键词脱敏](https://core.inklayer.dev/zh/guide/keyword-redaction)复用审核后的命中，但把页面预览和最终输出分开。审阅时仍显示普通的 Highlighter 颜色；只有打印或导出时，才在新的图片型 PDF 中生成不透明遮挡。输出文件不包含源文字对象，因此无法通过选中黑块并复制来恢复下方内容。作为安全性的取舍，导出版中的全部文字、链接、表单和矢量内容都会被扁平化。

[体验关键词高亮](https://core.inklayer.dev/demo/#highlighter) · [体验安全脱敏](https://core.inklayer.dev/demo/#redaction)

## Core 负责文档能力，应用负责界面

InkLayer Core 是无头引擎：它提供文档引擎和交互接口，但不提供完整的工具栏或应用外壳。

| InkLayer Core | 应用或框架组件 |
| --- | --- |
| PDF 加载、页面、布局、缩放和导航 | 查看器布局、控件、路由和加载状态 |
| 搜索、目录、缩略图和文字选择数据 | 搜索框、结果列表、侧边栏和文字选择菜单 |
| 批注工具、手势、变换和规范数据 | 工具栏、外观控件、评论面板和对话框 |
| 客户端作者与权限判断 | 可信用户身份和服务端最终权限校验 |
| 数据仓库操作和变更事件 | 服务端持久化、同步和冲突处理 |
| 水印、打印、PDF 和 Excel 生成接口 | 按钮、文件名、上传、下载和调用时机 |

完整的职责划分见 [Core 边界](https://core.inklayer.dev/zh/core-boundary)。

## 选择接入方式

- [原生 JavaScript](https://core.inklayer.dev/zh/guide/framework-integration)：构建包含导航、缩略图、工具栏和批注列表的查看器。
- [Vue](https://core.inklayer.dev/zh/guide/framework-vue)：在组件中保留一个 Core 实例，并接入 Vue 状态与生命周期。
- [React](https://core.inklayer.dev/zh/guide/framework-react)：用 ref 保存一个 Core 实例，并接入 React 状态与副作用。

Svelte、Angular、Web Components 或其他客户端框架同样可以使用这些 Core API。

## 需要时再扩展 Core

[能力插件](https://core.inklayer.dev/zh/guide/capability-plugin)用于为单个实例接入日志、带鉴权的 PDF 请求、文字输入、批注数据仓库、打印和下载等应用服务。其中一部分服务由 Core 自动调用；打印和下载服务则由应用主动调用。

[自定义批注类型](https://core.inklayer.dev/zh/guide/custom-annotation-type)可以添加带命名空间的工具，并定义自己的数据校验、创建行为、渲染器和输出支持。扩展功能只使用公开接口，不会得到可变的 Konva 节点或 PDF.js 私有状态。

## 底层查看器

如果应用要自行挂载页面，可以直接创建查看器。Worker 仍然会自动配置：

```ts
import { createPdfViewerEngine } from '@inklayer-dev/core/viewer'

const viewer = createPdfViewerEngine()
```

只有自托管 CSP 或部署策略有要求时，才需要覆盖 `workerSrc`：

```ts
const viewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

## 包入口

| 入口 | 用途 |
| --- | --- |
| `@inklayer-dev/core` | 批注数据、校验、数据仓库、浏览器辅助函数和共享类型 |
| `@inklayer-dev/core/capabilities` | `createInkLayer()` 和能力插件 |
| `@inklayer-dev/core/viewer` | PDF 查看器和 Page Flow |
| `@inklayer-dev/core/annotation` | 批注引擎和交互 |
| `@inklayer-dev/core/annotation-types` | 内置和自定义批注类型定义 |
| `@inklayer-dev/core/highlighter` | 无头普通文字/正则扫描、审核、预览和永久高亮工作流 |
| `@inklayer-dev/core/import/pdfjs` | 通过 PDF.js 导入 PDF 原生批注 |
| `@inklayer-dev/core/export/pdf` | 生成带批注 PDF 和打印 PDF |
| `@inklayer-dev/core/export/excel` | 生成批注工作簿 |
| `@inklayer-dev/core/style` | 仅作用于 Core 的 CSS |

## 兼容性

- 浏览器引擎：通过 Playwright 当前版本的 Chromium、Firefox 和 WebKit 验证
- 构建环境：Vite、Webpack 浏览器构建和 Node SSR 导入
- Node 工具链：`^22.13.0 || >=24.0.0`

内嵌 WebView 需要单独验证。具体见[浏览器支持](https://core.inklayer.dev/zh/browser-support)和[公开 API](https://core.inklayer.dev/zh/api)。

## 本地开发

```bash
npm install
npm run dev       # 基于源码的原生 JavaScript 示例
npm run docs:dev  # VitePress 文档
npm run check     # 完整发布质量检查
```

基于 [MIT License](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE) 发布。
