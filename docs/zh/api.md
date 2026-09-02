# 公开 API

本页用于快速查找公共包入口和应用开发中最常用的 API。需要按步骤完成接入时，请先阅读[快速开始](./guide/getting-started)和[框架接入](./guide/framework-integration)。

## 包入口

| 入口 | 用途 |
| --- | --- |
| `@inklayer-dev/core` | 数据模型、数据仓库、底层查看器与批注引擎、浏览器辅助函数和公共类型 |
| `@inklayer-dev/core/capabilities` | 推荐使用的 `createInkLayer()` 组合 API 和能力插件 |
| `@inklayer-dev/core/annotation-types` | 自定义批注类型定义和类型注册表 |
| `@inklayer-dev/core/highlighter` | 无头关键词扫描、审核、预览和永久高亮 |
| `@inklayer-dev/core/viewer` | 底层 PDF 查看器 API |
| `@inklayer-dev/core/annotation` | 底层批注引擎 API |
| `@inklayer-dev/core/import/pdfjs` | 导入 PDF.js 读取的原生批注 |
| `@inklayer-dev/core/export/pdf` | 生成带批注或用于打印的 PDF |
| `@inklayer-dev/core/export/excel` | 生成批注工作簿 |
| `@inklayer-dev/core/style` | 浏览器端必须导入的样式 |

应用中的 PDF 查看器应优先使用 `createInkLayer()`。只有需要自行组合生命周期时，才直接使用底层查看器和批注引擎。

## Core 实例

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

const pdf = await core.load({ url: '/documents/review.pdf' })
console.log(pdf.numPages)

await core.destroy()
```

### `InkLayerInstance`

| 成员 | 用途 |
| --- | --- |
| `viewer` | PDF 加载、搜索、文字选择、缩略图、目录、水印和查看器事件 |
| `annotations` | 工具、创建、编辑、评论、选中、权限和批注事件 |
| `annotationTypes` | 内置和自定义批注类型注册表 |
| `capabilities` | 读取已安装的能力插件 ID 和服务 |
| `load(source)` | 加载或替换 PDF，并挂载已配置的 Page Flow |
| `cancelLoad()` | 取消当前加载并释放对应的文档显示层 |
| `getPageFlow()` | 返回当前 Page Flow；文档尚未就绪时返回 `null` |
| `destroy()` | 取消任务并释放整个实例 |

`load()` 接受 `{ url, range?, headers?, credentials? }` 或 `{ data }`。URL Range 策略可以是 `true`、`false` 或 `'auto'`；自动模式只在确认服务器不支持 Range 请求时回退。

### PDF.js Worker

Core 已包含版本匹配的 PDF.js Worker，应用不需要另外下载或配置。

只有需要自行托管或满足严格的内容安全策略时，才覆盖 `workerSrc`：

```ts
const viewer = createPdfViewerEngine({
  workerSrc: '/assets/pdf.worker.min.mjs'
})
```

## 查看器

推荐使用 `core.viewer`；也可以通过 `createPdfViewerEngine()` 创建底层查看器。

```ts
const viewer = createPdfViewerEngine()
```

| 方法 | 用途 |
| --- | --- |
| `load(source)` / `cancelLoad()` | 使用底层查看器时加载、替换或取消文档 |
| `submitPassword()` / `cancelPassword()` | 处理当前 `passwordRequired` 请求 |
| `getSnapshot()` | 读取独立的加载与文档状态 |
| `subscribe(listener)` | 订阅进度、密码、加载、选择、缩放和错误事件 |
| `setLayoutMode()` | 为已配置的 Web Viewer 设置 `single`、`continuous`、`facing` 或 `continuous-facing` 布局 |
| `setScale()` / `getScale()` | 设置或读取数值及预设缩放比例 |
| `zoomIn()` / `zoomOut()` / `goToPage()` | 控制已配置的 Web Viewer |
| `getOutline()` / `resolveDestination()` | 读取文档目录与跳转目标 |
| `search()` / `searchMany()` | 搜索单个普通文字，或按顺序批量搜索普通文字与正则查询 |
| `resolveTextRanges()` | 将同页 UTF-16 原文范围解析为 scale-one、左上角原点的页面矩形 |
| `setTextHighlightLayers()` / `clearTextHighlightLayers()` | 替换或按 ID 清除有序、临时、由调用方设定颜色的 TextLayer 高亮 |
| `setSearchHighlights()` / `clearSearchHighlights()` | 在已挂载文字层中显示临时搜索结果 |
| `getTextSelection()` / `clearTextSelection()` | 读取或清除经过规范化的浏览器文字选择 |
| `renderThumbnail()` | 返回编码为 PNG 的缩略图 Blob |
| `renderPageRaster()` | 返回完整页面栅格图 |
| `attachTextLayer()` / `detachTextLayer()` | 自行挂载页面时管理可选择的 PDF 文字 |
| `setWatermark()` / `getWatermark()` / `drawWatermark()` | 管理查看器水印策略 |
| `destroy()` | 释放底层查看器 |

所有页码索引都从 0 开始。缩略图对象 URL 由应用管理，图片离开界面后必须调用 `URL.revokeObjectURL()` 释放。

### Page Flow

`createInkLayer({ pageFlow: ... })` 会在 `load()` 成功后创建带虚拟渲染的连续页面区域，通过 `core.getPageFlow()` 获取：

```ts
const pageFlow = core.getPageFlow()

pageFlow?.scrollToPage(4, 'smooth')
await pageFlow?.setScale('page-fit')
await pageFlow?.zoomIn()
console.log(pageFlow?.getCurrentPage())
```

控制器提供 `scrollToPage()`、`setScale()`、`getScale()`、`zoomIn()`、`zoomOut()`、`getCurrentPage()` 和 `destroy()`。替换文档时，旧控制器会被销毁，并为新文档创建新的控制器。

## 关键词 Highlighter

可选的 `@inklayer-dev/core/highlighter` 入口把 Viewer 的搜索与预览能力和 Annotation Engine 的持久化能力组合起来。它负责工作流状态而不提供 UI，因此 React、Vue 和其他宿主可以订阅同一套不可变快照。

```ts
import {
  createKeywordHighlighter,
  type KeywordRule
} from '@inklayer-dev/core/highlighter'

const rules: readonly KeywordRule[] = [
  {
    id: 'risk', label: 'Risk terms',
    terms: ['liability', 'termination'], color: '#ef4444'
  },
  {
    id: 'structured', label: 'Dates and amounts', color: '#8b5cf6',
    patterns: [
      { id: 'date', kind: 'regex', source: '\\b\\d{4}-\\d{2}-\\d{2}\\b', flags: 'u' },
      { id: 'amount', kind: 'regex', source: 'RMB\\s*\\d+(?:,\\d{3})*', flags: 'iu' }
    ]
  }
]

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})

highlighter.setRules(rules)
const unsubscribe = highlighter.subscribe(snapshot => {
  console.log(snapshot.status, snapshot.includedCount)
})

await highlighter.scan()
const firstMatch = highlighter.getSnapshot().matches[0]
if (firstMatch !== undefined) highlighter.excludeMatch(firstMatch.id)

const result = await highlighter.applyMatches()
console.log(result.createdAnnotationIds, result.skippedMatchIds)

unsubscribe()
highlighter.destroy()
```

`terms` 是普通文字匹配器，`patterns` 是可序列化的正则表达式。正则 source 不带 `/.../` 分隔符，只接受互不重复的 `i`、`m`、`s`、`u` flags。命中结果通过 `pattern` 提供配置的匹配器，并通过 `matchedText` 提供 PDF 中的精确原文。

| 方法 | 用途 |
| --- | --- |
| `setRules()` | 规范化并替换全部关键词规则，但不自动扫描 |
| `scan()` / `cancelScan()` | 批量搜索已就绪文档，并支持进度和取消 |
| `getSnapshot()` / `subscribe()` | 读取或监听与框架无关的不可变工作流状态 |
| `activateMatch()` | 激活一个命中，并让 Viewer 跳转到对应页面 |
| `includeMatch()` / `excludeMatch()` | 修改单个命中的预览和应用资格 |
| `includeRule()` / `excludeRule()` | 修改一条规则产生的全部命中的资格 |
| `applyMatches()` | 为包含的命中创建尚不存在的永久 Highlight 批注 |
| `clearPreview()` | 只隐藏当前 Controller 的临时层，不丢弃审核状态 |
| `reset()` | 清除 Controller 规则和临时状态，但不删除永久批注 |
| `destroy()` | 取消任务，并释放订阅和当前 Controller 拥有的预览层 |

`applyMatches()` 使用确定性的批注 ID，因此重复执行会跳过仓库中已经存在的批注。应用过程有意不提供事务性：如果后续规则失败，前面已经成功的批注仍是规范仓库状态，并会同步回下一份快照。应用作用域结束时必须调用 `destroy()`。

完整接入流程请先阅读独立的[关键词高亮指南](./guide/highlighter)。同一个 Controller 的三种 UI 所有权写法，可参考仓库维护的 [Vanilla](./guide/framework-integration)、[React](./guide/framework-react)和 [Vue](./guide/framework-vue)示例。

## 批注引擎

推荐使用 `core.annotations`；也可以通过 `createAnnotationEngine()` 创建底层批注引擎。

| 方法或属性 | 用途 |
| --- | --- |
| `repository` | 规范批注数据和当前选中状态 |
| `annotationTypes` | 当前引擎可用的批注类型定义 |
| `setTool()` / `getTool()` | 选择或读取当前交互工具 |
| `setToolAppearance()` / `getToolAppearance()` | 设置新建批注使用的外观 |
| `getAppearanceCapabilities()` | 判断某种类型支持哪些外观控件 |
| `setImageAsset()` / `getImageAsset()` | 为签名或盖章准备待放置图片 |
| `createAnnotation()` | 根据规范输入创建批注 |
| `getAnnotations()` | 按仓库顺序读取全部已脱离的规范批注 |
| `createTextMarkup()` | 根据文字选择创建高亮、下划线或删除线 |
| `createTextMarkupsFromRanges()` | 根据已解析范围批量创建尚不存在的稳定 ID 文字批注 |
| `requestFreeText()` / `requestEditText()` | 打开已配置的文字输入界面 |
| `updateContent()` / `updateAppearance()` / `transformAnnotation()` | 编辑已有批注 |
| `addComment()` / `updateComment()` / `deleteComment()` | 管理评论和回复 |
| `deleteAnnotation()` / `undoLastDeletion()` | 删除批注或恢复最近一次删除 |
| `setSelection()` / `setHoveredAnnotation()` | 同步应用界面与画布状态 |
| `setCurrentUser()` / `setPermissions()` | 更改后续操作使用的身份和权限策略 |
| `subscribe(listener)` | 订阅类型化的批注引擎事件 |
| `destroy()` | 释放底层批注引擎 |

全部 16 种内置批注类型见[批注工具与外观](./guide/annotations)。注册兼容的类型定义后，也可以使用自定义类型 ID。

## 批注数据仓库

`core.annotations.repository` 是批注数据的唯一来源。

| 方法 | 用途 |
| --- | --- |
| `getAll()` / `getById()` / `getByPage()` | 读取独立的批注数据 |
| `add()` / `update()` / `remove()` | 执行单条变更 |
| `replaceAll()` | 校验并一次性替换全部批注 |
| `getSelection()` / `setSelection()` | 读取或替换临时选中 ID |
| `subscribe(listener)` | 观察新增、更新、移除、整体替换、选择和销毁事件 |
| `destroy()` | 释放数据和监听器 |

数据仓库事件只是当前实例的状态通知，并非网络同步协议。相关说明见[保存和恢复批注](./guide/persistence)与[批注数据模型](./data-model)。

## 能力插件与自定义类型

能力插件的创建函数由 `@inklayer-dev/core/capabilities` 导出：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [
    createLoggerCapability(logger),
    createAnnotationRepositoryCapability(repository),
    createTextInputCapability(textInput)
  ],
  annotationTypes: [reviewArea]
})
```

能力插件会在引擎创建前安装当前实例使用的服务；自定义批注定义用于增加带命名空间的绘制类型。相关说明见[创建能力插件](./guide/capability-plugin)、[创建自定义批注类型](./guide/custom-annotation-type)和[插件生命周期与服务](./guide/plugin-lifecycle)。

## 导入与输出

每种转换使用对应的包入口：

```ts
import {
  importPdfJsAnnotations,
  importPdfJsAnnotationsWithMetadata
} from '@inklayer-dev/core/import/pdfjs'
import {
  buildSecureRedactedPdf,
  buildSecureRasterPrintPdf,
  downloadBlob,
  printPdfBlob
} from '@inklayer-dev/core'
import {
  buildAnnotatedPdf,
  buildPrintablePdf
} from '@inklayer-dev/core/export/pdf'
import { buildAnnotationWorkbook } from '@inklayer-dev/core/export/excel'
```

| 函数 | 返回结果 |
| --- | --- |
| `importPdfJsAnnotations()` | 从 PDF.js 页面批注数据转换出的规范批注和警告 |
| `importPdfJsAnnotationsWithMetadata()` | 在上述结果基础上，从源 PDF 字节补充元数据 |
| `buildAnnotatedPdf()` | 包含规范批注的 PDF 字节 |
| `buildPrintablePdf()` | 用于打印的 PDF 字节 |
| `buildSecureRasterPrintPdf()` | 根据查看器中已打开的文档生成仅含图片的打印 PDF |
| `buildSecureRedactedPdf()` | 根据审核后的文字范围生成不可恢复覆盖、仅含页面图片的 PDF |
| `buildAnnotationWorkbook()` | 包含批注数据的 XLSX 字节 |
| `printPdfBlob()` | 使用生成的字节打开浏览器打印对话框 |
| `downloadBlob()` | 在浏览器中下载生成的字节 |

`buildSecureRedactedPdf()` 接收 `viewer`、非空 `ranges`、可选的 `pixelRatio`、`margin`、进度和取消信号。它生成的文件不会保留可选择的页面文字。输出函数只负责返回内容；是否打印、下载或上传由应用决定。详见[打印、导出与水印](./guide/output-and-security)。

## 错误

公共功能通过 `InkLayerError` 返回错误。稳定的 `code` 用于程序判断；`operation`、`annotationId` 和从 0 开始的 `pageIndex` 提供可选上下文。

常见错误分组如下：

- 环境与生命周期：`ENVIRONMENT_UNSUPPORTED`、`ENGINE_DESTROYED`；
- PDF 加载与功能：`PDF_LOAD_FAILED`、`PDF_LOAD_CANCELLED`、`PDF_RANGE_FAILED`、`PDF_FEATURE_FAILED`；
- 批注与自定义类型：`ANNOTATION_INVALID`、`ANNOTATION_TYPE_UNAVAILABLE`；
- 格式转换：`IMPORT_FAILED`、`EXPORT_FAILED`。

不要把 `error.cause` 直接显示给用户。重试方式见[错误恢复](./error-recovery)。
