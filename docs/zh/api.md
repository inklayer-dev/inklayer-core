# 公开 API

本页覆盖每个公共包入口，以及应用开发者最常使用的合约。如果你正在构建 React、Vue、Svelte、Angular、Web Component 或 Vanilla 适配器，请先阅读[快速开始](./guide/getting-started.md)和[框架接入](./guide/framework-integration.md)。`npm run check:api` 会校验发布的 V1 类型声明。

## 包入口

| 入口 | 用途 | 重型运行时 |
|---|---|---|
| `@inklayer-dev/core` | 领域模型、Repository、协作、Viewer/Annotation factory、浏览器 Port | PDF.js/Konva 仅在使用时加载 |
| `@inklayer-dev/core/capabilities` | Composition Root、Capability 合约、生命周期类型 | 仅在组合时加载 Viewer/Annotation 运行时 |
| `@inklayer-dev/core/annotation-types` | 自定义类型 ID、Definition Registry、受控场景合约 | 挂载 Annotation 页面前无重型运行时 |
| `@inklayer-dev/core/viewer` | PDF.js Viewer facade 与生命周期类型 | PDF.js |
| `@inklayer-dev/core/annotation` | Annotation facade、工具、事件、Port、快照验证器 | 页面挂载后加载 Konva |
| `@inklayer-dev/core/import/pdfjs` | 原生批注解码、可选元数据检查、隐藏原批注 | 仅元数据检查时使用 pdf-lib |
| `@inklayer-dev/core/export/pdf` | 现有 PDF 字节 → 带批注 PDF 字节 | pdf-lib |
| `@inklayer-dev/core/export/excel` | 规范批注 → XLSX 字节 | ExcelJS |
| `@inklayer-dev/core/style` | 生成的实例级作用域引擎 CSS | 仅 CSS |

## Composition Root 与 Capabilities

```ts
import {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  createAnnotationRepositoryCapability,
  createInkLayer,
  createLoggerCapability,
  createPrintCapability,
  createTextInputCapability
} from '@inklayer-dev/core/capabilities'

const instance = await createInkLayer({
  root,
  pageFlow: { container: scrollElement },
  capabilities: [
    createLoggerCapability(logger),
    createTextInputCapability(textInput),
    createAnnotationRepositoryCapability(repository),
    createPrintCapability(printProvider)
  ]
})

await instance.load({ url, range: 'auto' })
const flow = instance.getPageFlow()
await instance.destroy()
```

Capability `setup()` 在 Viewer 和 Annotation Engine 构建前按顺序运行。Capability 可以提供唯一的实例级服务、消费更早 Capability 提供的服务、把自有资源注册到生命周期 Scope，并安排有序 `onReady` effect。初始化是事务性的：任何失败都会回滚已创建的全部资源。Page Flow 属于文档级，只在 `load()` 返回就绪文档后创建。

受保护 Port service key 与 factory 如下：

| Port | Factory | 引擎用途 |
|---|---|---|
| `Logger` | `createLoggerCapability` | Annotation 诊断和 Viewer 监听器 fallback |
| `TextInputProvider` | `createTextInputCapability` | FreeText 创建/编辑会话 |
| `AnnotationRepository` | `createAnnotationRepositoryCapability` | 规范 Annotation 状态 |
| `PrintProvider` | `createPrintCapability` | 生成打印字节后由应用明确调用 |
| `DownloadProvider` | `createDownloadCapability` | 生成导出内容后由应用明确调用 |
| `Clock` | `createClockCapability` | 批注时间戳 |
| `IdGenerator` | `createIdGeneratorCapability` | 引擎和批注 ID |
| `PdfThumbnailSurfaceProvider` | `createThumbnailSurfaceCapability` | Viewer 缩略图 surface 分配 |
| `fetch` | `createFetchCapability` | Viewer Range 探测和字节请求 |

解析优先级始终是：`显式底层 Engine 选项 > Capability Provider > Core 浏览器/默认实现`。被遮蔽的 Capability 仍可检查，但不会混入该 Engine。例如即使安装了 Repository Capability，显式 `annotation.repository` 仍是唯一 Repository。Repository Provider 默认 borrowed；只有 InkLayer 实例必须负责销毁它时才传 `{ ownership: 'owned' }`。

Print 与 Download 不会隐式执行。它们仍是由应用触发的环境副作用，可以通过类型化 key 获取：

```ts
await instance.capabilities
  .get(INKLAYER_CAPABILITY_SERVICE_KEYS.print)
  ?.print({ content: printablePdf })
```

没有 Capability 提供这些副作用时，应用仍可直接使用 `createBrowserPrintProvider()` 和 `createBrowserDownloadProvider()`。现有 Port 接口和全部底层 factory 选项保持公开且不变。

### 延后的可选 Capabilities

V1 有意不公开 Search Index Provider、同步适配器、Command Registry 或遥测 Provider。当前 React/Vue 需求可由规范 Viewer 搜索/高亮/导航 API、Repository 命令与事件、显式引擎/输出方法、现有 Port 和适配器侧 UI 组合表达。

这些接缝不是保留字符串 key，也不能用 no-op Provider 模拟。任一能力进入公共 API 前，必须先有真实使用方，并明确生命周期、取消、结构化错误、隐私边界和可执行测试。未来遥测接口不能接收包含文档或批注内容的原始引擎事件；未来同步接口不能通过修改 Repository 内部状态来定义冲突策略。

规范 Viewer 搜索支持 `matchCase`、`wholeWord`、`matchDiacritics` 和 `maxResults`。默认会折叠音调符号，以保持现有 React/Vue 行为；需要精确匹配重音时设置 `matchDiacritics: true`。该归一化属于 Core，不可由 Capability 替换。

## Annotation Type Definitions

自定义持久化类型使用 `custom:<namespace>/<name>`。每段以小写 ASCII 字母或数字开头，后续允许小写字母、数字、`.`、`_`、`-`。单段最多 120 字符，完整 ID 最多 256 字符；内置 ID 保留。

每个 Registry 初始都包含全部 16 种不可变内置 Definition，因此 `get()` 会返回内置和已安装自定义 Definition，而 `register()` 只允许自定义类型。内置 Definition 是默认 Appearance、准确 Appearance 控件、几何、创建 controller、one-shot/continuous 生命周期、直接操作能力、可打印性、可导出性和 PDF 策略的规范来源。其 `renderer.strategy` 为 `core`，会委托给已验证私有 Konva 快照构建器，外部注册时会被拒绝。

完整 ID、几何、创建模式和 PDF 策略见[内置批注类型表](./guide/annotations.md#内置批注类型)。

```ts
import { createAnnotationTypeRegistry } from '@inklayer-dev/core/annotation-types'

const annotationTypes = createAnnotationTypeRegistry()
const unregister = annotationTypes.register(measurementDefinition)

const engine = createAnnotationEngine({ root, annotationTypes, repository })
unregister()
engine.destroy()
annotationTypes.destroy()
```

`AnnotationTypeDefinition` 只暴露受控元数据和纯回调；不会接收 Konva Node、Stage、Layer、PDF.js 内部对象或 Repository。renderer 返回由 group、rectangle、ellipse、line、path、text 和 image 组成的有界场景，Core 验证后才构建私有渲染器对象。

`AnnotationEngine.setTool()` 同时接受内置 ID 和已安装自定义类型 ID。指针创建通过实例 Registry 解析 controller 与预览几何。移除当前激活的自定义 Definition 会立即让 Engine 回到 `select` 并阻止继续创建。

未知自定义批注仍是有效规范数据。Core 保留 `typeData`、`rendererState` 和 `extensions`，不解析未知 renderer 字符串，只显示基于 bounds 的安全占位符，并用 `ANNOTATION_TYPE_UNAVAILABLE` 拒绝类型专属命令。删除和规范评论操作仍可用。安装兼容 Definition 会重绘保留批注；再次移除则恢复占位符。

`creation.initialize(input)` 是用于自定义指针创建的可选纯回调。它接收已分离、深度冻结的 bounds/content/point，可返回修正后的 bounds、语义 content 和独立版本化 `typeData`。Core 验证后才提交 Repository。已有纯 `interaction.reduceTransform()` 回调可以让直接操作同步更新 `typeData`。

`buildAnnotatedPdf()` 与 `buildPrintablePdf()` 接受实例 Registry 作为 `options.annotationTypes`。兼容自定义 Definition 必须启用对应 `exportable` 或 `printable` 能力，并声明 `pdf.exportStrategy: 'appearance-stream'`。Core 调用同一个受控 renderer、验证场景，并写入可选择 PDF Stamp appearance stream，其中包含稳定自定义 ID、`typeData` 和 Appearance 元数据。V1 appearance-stream 当前接受 rectangle、ellipse 和 line；不支持的场景原语会在修改 PDF 前的预检阶段失败。缺失 Definition 和不支持策略会明确报告，绝不会静默丢弃。

## Viewer

```ts
const viewer = createPdfViewerEngine()
const handle = await viewer.load({ url, range: 'auto' })
// 或：await viewer.load({ data: bytes })
await viewer.cancelLoad()
await viewer.destroy()
```

Core 内置并解析版本匹配的 PDF.js Worker。应用不需要下载或配置；`workerSrc` 只是在自托管或自定义 CSP 时使用的可选覆盖。`load()` 有 generation guard，较新的加载优先。URL Range 支持 `true`、`false`、`'auto'`；自动回退只发生在确认服务器不支持 Range 时，普通网络/HTTP 失败不会回退。根入口和 Viewer 入口在 SSR 中安全，因为 PDF.js 只由 `load()` 动态加载。

```ts
const cspViewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

普通 Vite 或 Webpack 使用方不需要该覆盖。

Viewer 状态提供结构化加载进度：

```ts
const unsubscribe = viewer.subscribe((event) => {
  if (event.type !== 'loadProgress') return
  const { phase, loaded, total, percentage, range } = event.progress
  renderLoadingState({ phase, loaded, total, percentage, range })
})

console.log(viewer.getSnapshot().progress)
```

phase 为 `probing`、`downloading` 或 `parsing`。未知 total 和 percentage 为 `null`。Range 进度统计包括首次 probe 在内的唯一、已验证字节区间，不会重复计算重叠请求。Range 文档可能在全部字节传输完成前 ready，因此 Core 不伪造最终 100% 事件。加载 UI 属于适配器。

密码加载会暂停在 `awaiting-password`，只发出安全请求元数据。适配器调用 `submitPassword(requestId, password)` 或 `cancelPassword(requestId)`；凭据不保留在快照或错误中。加载 handle 暴露规范化的打印、复制、修改、批注和表单权限。

使用 PDF.js Web Viewer 容器构建时，Core 管理页面流命令：

```ts
await viewer.setLayoutMode('continuous')
viewer.setScale('page-width')
viewer.zoomIn()
viewer.zoomOut()
console.log(viewer.getScale().percentage)
viewer.goToPage(4)
```

数值缩放与 `auto`、`page-actual`、`page-fit`、`page-width`、`page-height` 共用一个 `PdfZoomState`。配置 Web Viewer 后，默认发出 `scaleChanged`，并管理保持锚点的双指捏合与 Ctrl/Meta + 滚轮缩放；只有宿主必须禁用手势时才传 `enablePinchZoom: false`。

对于虚拟多页 surface，Core 也可以管理稳定页面壳、预渲染、TextLayer/Annotation 挂载、当前页跟踪和清理：

```ts
const flow = await createPdfPageFlow({
  viewer,
  annotations,
  container: scrollElement,
  onCurrentPageChanged: setCurrentPage,
  onScaleChanged: setZoomState,
  onError: reportCoreError
})
flow.scrollToPage(4, 'smooth')
await flow.setScale('page-fit')
await flow.zoomIn()
console.log(flow.getScale().scale)
flow.destroy()
```

适配器仍负责外围滚动条、工具栏、响应式布局和模式控件。`createPdfPageFlow` 要求 Viewer 已 ready，浏览器支持 `IntersectionObserver` 与 `createImageBitmap`。自适应预设由 `ResizeObserver` 重新计算，工具栏缩放会退出预设模式并以当前解析出的数值比例工作。`PdfPageFlow` 也会在滚动容器挂载双指及 Ctrl/Meta + 滚轮识别器；异步页面重绘时合并手势帧，并保持中点下的文档位置不变。

文档功能按 generation 管理，且要求已加载文档：

```ts
const outline = await viewer.getOutline()
const target = await viewer.resolveDestination(outline[0]?.destination)
const results = await viewer.search('review', {
  matchCase: false,
  wholeWord: true,
  maxResults: 100
})
const thumbnail = await viewer.renderThumbnail({ pageIndex: 0, maxWidth: 160 })
```

Core 提取和解析目录目标、按文档顺序搜索页面，并渲染缓存 PNG 缩略图。使用方负责树/列表/输入 UI，并在展示结束后 revoke 返回缩略图的 object URL。替换或销毁文档会取消 Core 任务并清空缓存。

真实 PDF 文字选择需要把页面 PDF.js TextLayer 挂在 Canvas 上方：

```ts
await viewer.attachTextLayer({
  pageIndex: 0,
  container: textLayerElement,
  scale: 1
})
const unsubscribe = viewer.subscribe((event) => {
  if (event.type === 'textSelectionChanged' && event.selection !== null) {
    // 渲染产品 UI，用户执行操作后再消费保留的选择。
    const selections = event.selection.kind === 'page'
      ? [event.selection.selection]
      : event.selection.selection.fragments
    for (const selection of selections) {
      annotationEngine.createTextMarkup('highlight', selection)
    }
    viewer.clearTextSelection()
  }
})
```

选择优先产品 UI 使用 `textSelectionChanged`。焦点移动到上下文菜单时，`getTextSelection()` 仍保留归一化几何；`clearTextSelection()` 同时清除 Core 状态和浏览器原生 Range。旧 `textSelected` 与 `documentTextSelected` 事件仍可使用。同页选择包含一页，跨页选择包含有序页内 fragment，适配器可为每页创建一条规范文字批注。Core 发出未缩放、左上原点页面矩形；框架负责上下文菜单结构。

`search()` 返回稳定 offset。将其传给 `setSearchHighlights(result.matches, activeIndex)`，即可投影到全部已挂载 TextLayer；之后新挂载页面也会恢复同一临时状态。

水印是表现策略，不是批注：

```ts
viewer.setWatermark({ text: 'Alice · Confidential', targets: {
  viewer: true, print: true, export: false, thumbnails: false
}})
await page.render(renderContext).promise
viewer.drawWatermark({ canvas, pageIndex })
```

PDF 入口导出 `buildPrintablePdf`，为普通输入保留矢量 PDF 内容，同时合成批注和同一水印策略。可选 `watermarkFontBytes` 使用 `@pdf-lib/fontkit` 支持中文和其他非 WinAnsi 文本。`printPdfBlob` 管理用于调起浏览器打印框的临时 iframe 与 object URL。

密码或其他敏感文档在 PDF.js 打开后，使用仅浏览器可用的栅格打印路径：

```ts
const printable = await buildSecureRasterPrintPdf({
  viewer,
  annotations,
  pixelRatio: 2,
  onProgress: (completedPages, totalPages) => updateProgress(completedPages, totalPages)
})
await printPdfBlob(printable)
```

该路径应用打印水印和规范批注，执行 PDF 打印权限（低分辨率权限会把密度限制为 1 倍），并生成临时未加密、仅图片 PDF。它只用于打印框，不是替代下载/导出：文本、链接、表单和矢量保真度都会被扁平化。保留矢量的加密输出仍需可信后端解密/重新加密；把加密源字节交给矢量导出器仍会关闭式失败。

## Annotation Engine

```ts
const engine = createAnnotationEngine({
  root,
  currentUser: { id: 'alice', name: 'Alice' },
  freehandMergeDelayMs: 1000,
  authorLabelVisibility: 'auto',
  creationModes: {
    rectangle: 'once',
    highlight: 'continuous'
  },
  defaultAppearances: {
    highlight: { fill: { color: '#b4fa56', opacity: 0.5 } },
    rectangle: { stroke: { color: '#ff6b6b', width: 2 } }
  }
})

await engine.attachPage({ pageIndex: 0, container, width, height, scale })
engine.setTool('rectangle')
engine.setToolAppearance('rectangle', {
  stroke: { color: '#1677ff', width: 3, dash: [8, 4] },
  fill: { color: '#e6f4ff', opacity: 0.2 }
})
const annotation = engine.createAnnotation({
  type: 'rectangle',
  pageIndex: 0,
  bounds: { x: 10, y: 20, width: 100, height: 50 }
})
engine.setSelection({ ids: [annotation.id], primaryId: annotation.id })
engine.updateAppearance(annotation.id, { stroke: { width: 5 } })
engine.setAuthorLabelVisibility('always')
engine.setImageAsset('signature', {
  image: signaturePngDataUrl,
  width: 180,
  height: 60,
  text: 'Alice signature'
})
engine.setTool('signature') // 下一次点击页面会居中放置图片
engine.destroy()
```

`AnnotationAppearance` 是完整的 V1 持久化值，与 Konva 无关，并把批注整体 opacity 与 `stroke`、`fill`、`text` 分开；禁用组件时值为 `null`。创建和编辑 API 接受深层 partial `AnnotationAppearanceInput`：`undefined` 表示继承，`null` 明确禁用。dash 样式使用 `[8, 4]` 这样的页面单位数组，渲染适配器无需转换 `dashed` 等模糊名称。用 `getAppearanceCapabilities(type)` 只构建对该类型有意义的控件。`hitStrokeWidth` 属于内部交互状态，不进入 appearance 或持久化快照。

作者/引用 Tag 是临时渲染状态。`auto` 显示 hover 或选中批注的 Tag，`always` 显示所有已挂载 Tag，`hidden` 即使 hover/选中也隐藏。Canvas hover 属于 Core；侧边栏可通过 `setHoveredAnnotation(id)` 共享。

全部 16 种持久化类型都受支持。`text-select` 把指针输入交给 PDF TextLayer，`select` 启用已有批注操作。Highlight/Underline/Strikeout 通过 `createTextMarkup` 接收归一化文字选择。FreeText 使用 `requestFreeText` 和配置的 `TextInputProvider`。Signature/Stamp 通过 `setImageAsset` 放置；应用创建或选择 PNG/JPEG data URL，Core 管理页面放置、变换、渲染、打印和导出。图片工具没有资源时，点击会发出 `imageAssetRequired`，适配器可打开选择器。Selection 是临时状态，不会持久化成批注类型。

每次成功用户交互都会选中新建批注，使 `auto` Tag 在形状、文字批注、FreeText、Signature 和 Stamp 间表现一致。随后 Core 应用该类型创建模式：形状、墨迹、文字、图片、路径默认 `once` 并回到 Select；Highlight、Underline、Strikeout 默认 `continuous` 并保持激活。可用 `creationModes` 覆盖。直接 `createAnnotation()` 对导入和批处理不产生这些副作用；`createTextMarkup()` 和 `requestFreeText()` 是交互命令，会应用该生命周期。

评论、工作流状态、更新、变换、删除、导航、hover、selection、权限和类型化事件都是 facade 操作；Repository 仍是唯一事实来源。传入 Repository 归使用方所有，默认 Repository 归引擎所有。

批注只有在 Select 工具激活时可拖动。变换控件按几何类型决定：box 在适用时缩放/旋转；图片和 path 类内容等比缩放；Line/Arrow 编辑端点；Polygon/Polyline 编辑顶点；Note 只能移动；文字批注没有变换手柄。指针反馈连续并限制在页面内。

文档内键盘交互默认启用。方向键将当前选择移动 1 个页面单位，Shift + 方向键移动 10，Delete/Backspace 走规范权限删除路径，Escape 取消绘制或清空选择。通过 `keyboard` 设置受限步长；通过 `accessibility` 本地化 Core 拥有的 root/page/annotation 语义。已有 root ARIA 和 tabindex 属性会保留。焦点所有权、FreeText、TextLayer 菜单交接、减弱动态效果与适配器责任见 `docs/accessibility.md` 对应的[无障碍](./accessibility.md)。

同一挂载页面上的连续 Freehand 笔画会在 `freehandMergeDelayMs` 结束前合并为一个批注；每笔在 Konva state 和 PDF `InkList` 导入/导出中仍保持独立。once 模式的选择/工具切换发生在合并间隔结束后，而不是第一笔结束后。Free-highlight 在松开指针时，会把与水平或垂直方向相差 2 度以内的路径吸附校正。Polygon、Polyline 和 Cloud 收集点时保持开放预览；Polygon 与 Cloud 只在双击/双触提交成功后闭合。

## 原生批注导入

```ts
const decoded = importPdfJsAnnotations(pages)
hideImportedPdfJsAnnotations(storage, decoded.supportedIds, pageById)

const enriched = await importPdfJsAnnotationsWithMetadata(pages, pdfBytes)
```

解码不会修改 PDF.js annotation storage。独立隐藏 helper 只接受确认已解码的 ID，因此 Link、Widget、Form 和畸形条目保持不变。元数据变体只加载一次字节，用于恢复自定义 Arrow/Cloud/FreeText 字典标记。元数据失败会增加 warning，并继续标准解码。

## 导出与下载

```ts
const pdfBytes = await buildAnnotatedPdf(sourcePdf, annotations, {
  strategy: 'strict',
  managedNativeAnnotationIds: importedNativeIds
})
const workbookBytes = await buildAnnotationWorkbook(annotations)

downloadBlob({
  content: pdfBytes,
  filename: 'review.pdf',
  mimeType: 'application/pdf'
})
```

Exporter 只返回内容。PDF strict 模式在返回字节前拒绝无效批注；lenient 模式跳过单个无效值并发出 warning。不支持的现有 PDF 字典会保留。Workbook sheet/header 标签可以本地化，但规范 type/status/reference 值不能翻译。

编辑从源 PDF 导入的批注时，把应用拥有的每个 native ID（包括导入后已删除的 ID）传给 `managedNativeAnnotationIds`。导出按 `/NM` 对账可替换字典：当前 Core 批注替换匹配原项，已删除的 managed 项被移除，无关或不支持字典保持不变。当前批注和回复 ID 会自动包含。

`downloadBlob` 是可选浏览器动作边界，负责创建和释放临时 anchor 与 object URL。

## 错误

所有功能边界使用 `InkLayerError`，具有稳定 `code`，以及可选 `operation`、`annotationId`、`pageIndex` 和保留的 `cause`。错误消息不包含 PDF 内容或评论文字。

Viewer 恢复会区分 `PDF_LOAD_FAILED`、`PDF_LOAD_CANCELLED`、`PDF_PASSWORD_CANCELLED`、`PDF_RANGE_FAILED`、`PDF_RANGE_UNSUPPORTED` 和 `PDF_FEATURE_FAILED`。密码错误是可恢复的 `passwordRequired` 事件而不是抛出错误，因为同一个 PDF.js loading task 仍在运行。应用根据 code/event 分支并维护自己的重试策略；参阅[错误恢复](./error-recovery.md)。
