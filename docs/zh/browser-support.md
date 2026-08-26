# 浏览器支持

InkLayer Core 面向现代浏览器，运行时行为会在 Chromium、Firefox 和 WebKit 三种浏览器引擎中验证。应用布局和框架组件仍由接入 InkLayer 的应用负责。

## 支持的浏览器引擎

| 浏览器系列 | 支持情况 |
| --- | --- |
| Chromium 系浏览器 | 通过 Chromium 验证 |
| Firefox | 通过 Firefox 验证 |
| Safari | 通过 WebKit 验证 |
| 内嵌 WebView | 不作统一保证，需要根据宿主 WebView 和操作系统版本单独验证 |

自动化测试使用当前 Playwright 提供的浏览器版本。这可以确认三种浏览器引擎中的行为，但不代表支持所有历史版本或厂商定制的 WebView。

## 使用的浏览器能力

完整的查看器和批注工作区会使用以下现代浏览器 API：

- ES 模块和动态 `import()`；
- `fetch`、`AbortController`、`Blob` 和对象 URL；
- Canvas 2D 和浏览器图片解码；
- 用于虚拟页面的 `IntersectionObserver` 和 `createImageBitmap`；
- 浏览器支持时，使用 `ResizeObserver` 自动重新计算自适应页面缩放；
- 用于绘制和触摸手势的 Pointer Events；
- 用于选择 PDF 文字的 Selection 和 Range API。

如果应用运行在能力受限的 WebView 中，应在创建查看器前确认这些 API 是否可用。缺少必要能力时，Core 会通过 `InkLayerError` 报错，常见错误码为 `ENVIRONMENT_UNSUPPORTED` 或 `PDF_FEATURE_FAILED`。

## 已验证的功能

浏览器测试覆盖文档加载、HTTP Range 请求、密码、虚拟页面、搜索、文字选择、批注、键盘操作、触摸缩放、打印、导出、多查看器实例和资源清理。

响应式工具栏、侧边栏、对话框和布局断点属于应用界面，并非 Core 提供的功能。请根据自己产品支持的浏览器和设备测试这些组件。

## 服务端渲染

在服务端导入 InkLayer 包是安全的，因为 PDF.js 的浏览器运行时只会在打开文档时加载。PDF 渲染、DOM 挂载、打印和下载仍然依赖浏览器，应放在客户端生命周期中执行。

浏览器错误与重试方式见[错误恢复](./error-recovery)。
