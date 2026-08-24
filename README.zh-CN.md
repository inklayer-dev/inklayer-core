# InkLayer Core

> 面向所有 Web 框架的 PDF 内核。

[![npm](https://img.shields.io/npm/v/%40inklayer-dev%2Fcore)](https://www.npmjs.com/package/@inklayer-dev/core)
[![downloads](https://img.shields.io/npm/dm/%40inklayer-dev%2Fcore)](https://www.npmjs.com/package/@inklayer-dev/core)
[![Core CI](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml/badge.svg)](https://github.com/inklayer-dev/inklayer-core/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40inklayer-dev%2Fcore)](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE)

在 React、Vue、Svelte、Angular、Web Components 或原生 TypeScript 中构建 PDF
查看和批注产品，无需为每个框架重写文档行为。

[快速开始](https://inklayer-dev.github.io/inklayer-core/zh/guide/getting-started) ·
[在线示例](https://inklayer-dev.github.io/inklayer-core/demo/) ·
[文档](https://inklayer-dev.github.io/inklayer-core/zh/) ·
[English](./README.md)

## 显示 PDF

```bash
npm install @inklayer-dev/core
```

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const core = await createInkLayer({
  root: document.querySelector<HTMLElement>('#pdf-workspace')!,
  pageFlow: {
    container: document.querySelector<HTMLElement>('#pages')!,
    scale: 'page-width'
  }
})

await core.load({ url: '/documents/review.pdf', range: 'auto' })

// 框架组件卸载
await core.destroy()
```

`pageFlow` 会显示虚拟化连续滚动 PDF。Core 内置版本匹配的 PDF.js Worker，普通
Vite 和 Webpack 应用不需要下载、复制或配置 `pdf.worker`。

完整 DOM/CSS、加载界面、密码处理和清理见[5 分钟 Viewer 教程](https://inklayer-dev.github.io/inklayer-core/zh/guide/getting-started)。

## 可以构建什么

- URL、本地文件、密码和 HTTP Range 分块加载，以及进度、取消、重试、请求头和权限；
- 单页、连续和对页布局，以及虚拟页面流；
- 缩放预设、页码导航、缩略图、目录、搜索和真实 PDF 文字选择；
- 16 种内置批注，以及绘制、命中测试、变换、键盘行为、评论和 Tag；
- 图片签名和图章、FreeText、多笔 Freehand、自动修正 Free Highlight、Polygon、Polyline 和 Cloud；
- 水印、浏览器打印、安全栅格打印、带批注 PDF 和 Excel 输出；
- 实例级能力插件和带命名空间的自定义批注类型；
- 结构化错误、确定性清理、多 Viewer 隔离和 SSR 安全导入。

[浏览任务教程 →](https://inklayer-dev.github.io/inklayer-core/zh/guide/first-annotation)

## Core 管文档，应用管界面

InkLayer Core 是无头引擎，不提供固定工具栏、侧边栏、密码框、搜索面板或产品流程。

| InkLayer Core | 应用或框架适配器 |
|---|---|
| PDF 加载、Worker、页面、缩放、导航 | 布局、工具栏、路由状态 |
| 搜索、TextLayer 选择、页面坐标 | 搜索框、结果列表、选择菜单 |
| 批注手势、变换、命中测试 | 工具面板、外观控件、业务面板 |
| 批注数据和类型化事件 | 服务端持久化、鉴权、同步策略 |
| 水印、打印和导出合成 | 按钮、文件名、上传和下载策略 |

这条边界让 React、Vue 和未来适配器共享相同行为，而不强迫它们共享界面。

## 扩展一个实例

使用能力插件安装产品服务：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [
    createLoggerCapability(appLogger),
    createAnnotationRepositoryCapability(repository)
  ]
})
```

使用 Annotation Type Definition 增加命名空间绘制工具：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotationTypes: [reviewArea]
})

core.annotations.setTool('custom:acme/review-area')
```

手势、验证、受控渲染、持久化、打印、PDF 导出和清理仍由 Core 负责。插件不会得到
Konva 或 PDF.js 私有对象。

[插件概览](https://inklayer-dev.github.io/inklayer-core/zh/guide/plugins) ·
[第一个能力插件](https://inklayer-dev.github.io/inklayer-core/zh/guide/capability-plugin) ·
[自定义批注类型](https://inklayer-dev.github.io/inklayer-core/zh/guide/custom-annotation-type)

## 底层 Viewer

需要自行挂载页面的应用可以直接创建 Viewer，Worker 仍然自动配置：

```ts
import { createPdfViewerEngine } from '@inklayer-dev/core/viewer'

const viewer = createPdfViewerEngine()
```

只有自托管 CSP 或部署策略要求时才覆盖 `workerSrc`：

```ts
const viewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

## 包入口

| 入口 | 用途 |
|---|---|
| `@inklayer-dev/core` | 领域模型、验证、Repository 和共享类型 |
| `@inklayer-dev/core/capabilities` | `createInkLayer()` 和能力插件 |
| `@inklayer-dev/core/viewer` | PDF Viewer 和页面流 |
| `@inklayer-dev/core/annotation` | 批注引擎和交互 |
| `@inklayer-dev/core/annotation-types` | 内置和自定义类型 Definition |
| `@inklayer-dev/core/import/pdfjs` | 原生 PDF.js 批注导入 |
| `@inklayer-dev/core/export/pdf` | 带批注 PDF 和打印输出 |
| `@inklayer-dev/core/export/excel` | 批注 Excel 输出 |
| `@inklayer-dev/core/style` | 作用域引擎 CSS |

## 兼容性

- 浏览器运行时：当前 Chromium、Firefox 和 WebKit 基线
- 使用方构建：Vite、Webpack 浏览器构建和 Node SSR import
- Node 工具链：`^22.13.0 || >=24.0.0`

参阅[浏览器支持](https://inklayer-dev.github.io/inklayer-core/zh/browser-support)、
[构建工具支持](https://inklayer-dev.github.io/inklayer-core/zh/consumer-build-matrix)和
[公开 API](https://inklayer-dev.github.io/inklayer-core/zh/api)。

## 本地开发

```bash
npm install
npm run dev       # 基于源码的 Vanilla 示例
npm run docs:dev  # VitePress 文档
npm run check     # 完整发布质量检查
```

基于 [MIT License](https://github.com/inklayer-dev/inklayer-core/blob/main/LICENSE) 发布。
