---
layout: home

hero:
  name: InkLayer Core
  text: 面向所有 Web 框架的 PDF 内核
  tagline: 你负责产品界面，Core 负责 PDF 查看、批注、页面流、打印和导出。
  image:
    src: /hero-engine.svg
    alt: 带文字高亮和选中手写批注的 PDF 文档。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 阅读 API
      link: /zh/api
    - theme: alt
      text: 示例
      link: 'https://inklayer-dev.github.io/inklayer-core/demo/'

features:
  - title: 与框架无关
    details: React、Vue、Svelte、Angular、Web Components 和原生 TypeScript 共用同一套命令式内核。
    link: /zh/guide/framework-integration
  - title: 完整能力
    details: 加载、Range、密码、搜索、选择、页面流、缩放、水印、打印和导出都由 Core 负责。
    link: /zh/guide/viewer-and-pages
  - title: 可扩展批注
    details: 使用十六种内置工具，或注册支持保存、打印和 PDF 导出的自定义绘制类型。
    link: /zh/guide/plugins
  - title: 生产级生命周期
    details: 安全取消与清理、结构化错误、Viewer 隔离、SSR 安全导入和内置 PDF.js Worker。
    link: /zh/error-recovery
---

## 先让 Viewer 跑起来

安装包、给 Core 一个滚动容器，然后加载 PDF：

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const core = await createInkLayer({
  root: workspaceElement,
  pageFlow: { container: pagesElement }
})
await core.load({ url: '/documents/review.pdf', range: 'auto' })
```

[5 分钟教程](/zh/guide/getting-started)会补上完整 DOM/CSS、加载状态、密码处理和清理。InkLayer Core 是无头引擎：它负责 PDF 与批注行为，框架负责工具栏、面板和产品流程。

## 你想做什么？

| 我想要…… | 去这里 |
|---|---|
| 写代码前体验全部能力 | [体验在线示例](/zh/guide/try-demo) |
| 显示可滚动、可缩放的 PDF | [5 分钟构建 Viewer](/zh/guide/getting-started) |
| 绘制矩形或从文字创建高亮 | [创建第一个批注](/zh/guide/first-annotation) |
| 加载文件、密码、鉴权 URL 或大型 PDF | [加载 PDF](/zh/guide/loading-pdfs) |
| 增加页码导航、缩放、缩略图或目录 | [页面、缩放与导航](/zh/guide/viewer-and-pages) |
| 搜索和选择真实 PDF 文字 | [搜索与文字选择](/zh/guide/search-and-selection) |
| 把批注保存到后端并恢复 | [保存和恢复批注](/zh/guide/persistence) |
| 打印、导出或添加水印 | [打印、导出与水印](/zh/guide/output-and-security) |
| 把 Core 接入 React、Vue 或其他框架 | [框架接入](/zh/guide/framework-integration) |
| 增加产品服务或自定义绘制工具 | [插件概览](/zh/guide/plugins) |

## 需要时再扩展

能力插件用于接入日志、持久化、文字输入、打印、下载等产品服务；Annotation Type Definition 用于增加命名空间绘制工具。它们都只作用于一个实例，验证、交互、持久化、打印、导出和清理仍由 Core 负责。

[开发第一个插件 →](/zh/guide/capability-plugin)
