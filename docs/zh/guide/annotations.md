# 批注工具与外观

## 内置批注类型

所有内置类型都支持打印和导出。PDF 策略属于受保护的 Core Definition：`native` 写入标准 PDF 批注字典；没有对应标准 PDF 类型的行为使用 `appearance-stream`，写入可选择的 Stamp 外观。

| 类型 ID | 用途 | 几何 | 创建方式 | PDF 策略 |
|---|---|---|---|---|
| `highlight` | 文字高亮 | `text-markup` | `text-selection` · 连续 | `native` |
| `strikeout` | 文字删除线 | `text-markup` | `text-selection` · 连续 | `native` |
| `underline` | 文字下划线 | `text-markup` | `text-selection` · 连续 | `native` |
| `free-text` | 定位文字框 | `text-box` | `text-input` · 单次 | `native` |
| `rectangle` | 矩形 | `box` | `drag-box` · 单次 | `native` |
| `circle` | 圆形或椭圆 | `box` | `drag-box` · 单次 | `native` |
| `freehand` | 多笔手写墨迹 | `path` | `freehand` · 单次 | `native` |
| `free-highlight` | 自动修正的自由高亮 | `path` | `freehand` · 单次 | `appearance-stream` |
| `signature` | 图片或手写签名 | `image` | `image-placement` · 单次 | `appearance-stream` |
| `stamp` | 图片图章 | `image` | `image-placement` · 单次 | `native` |
| `note` | 点状便笺 | `point` | `point` · 单次 | `native` |
| `line` | 可编辑端点的直线 | `line` | `line` · 单次 | `native` |
| `arrow` | 可编辑端点的箭头 | `line` | `line` · 单次 | `appearance-stream` |
| `polygon` | 闭合多边形 | `polyline` | `polyline` · 单次 | `native` |
| `polyline` | 开放折线 | `polyline` | `polyline` · 单次 | `native` |
| `cloud` | 闭合云线 | `polyline` | `polyline` · 单次 | `appearance-stream` |

## 工具与创建模式

```ts
core.annotations.setTool('rectangle')
core.annotations.setTool('highlight')
core.annotations.setTool('select')
```

形状、墨迹、图片、文字和路径工具默认创建一次后回到 Select；Highlight、Underline、
Strikeout 默认连续创建。可通过 `creationModes` 覆盖；工具栏只反映最终发出的 `toolChanged` 事件。

文字类批注遵循“先选文字，再创建批注”：

```ts
const selection = core.viewer.getTextSelection()
if (selection?.kind === 'page') {
  core.annotations.createTextMarkup('highlight', selection.selection)
  core.viewer.clearTextSelection()
}
```

## 外观

`AnnotationAppearanceInput` 是深层 partial；`undefined` 表示继承，`null` 表示禁用描边或填充。

```ts
core.annotations.setToolAppearance('highlight', {
  stroke: null,
  fill: { color: '#74d13d', opacity: 0.45 }
})

core.annotations.setToolAppearance('rectangle', {
  stroke: { color: '#175cd3', width: 2, dash: [] },
  fill: null
})
```

使用 `getAppearanceCapabilities(type)` 决定属性面板显示哪些控件。命中区域宽度和
变形器属于 Core 内部交互，不写入外观数据。

## FreeText、签名和图章

FreeText 使用配置的 `TextInputProvider`。浏览器默认实现会创建并管理页面内 textarea；产品也可以通过 Capability 提供另一种实现，而不改变批注语义。

Signature 和 Stamp 是图片批注。产品 UI 创建或选择 PNG/JPEG data URL，再把放置资源交给 Core：

```ts
core.annotations.setImageAsset('signature', {
  image: signatureDataUrl,
  width: 180,
  height: 60,
  text: 'Ada signature'
})
core.annotations.setTool('signature')
```

Core 负责光标预览、放置、选择、变换、渲染和 PDF 输出。没有准备资源时，点击 Canvas 会发出 `imageAssetRequired`，应用可以据此打开选择器。

## Repository 与协作

`AnnotationRepository` 是批注、选择、评论、引用和权限的唯一事实来源。只持久化经过
校验的规范 `Annotation`。需要让状态比引擎实例存活更久时，传入自己的 Repository，或通过 `createAnnotationRepositoryCapability()` 安装。

只持久化规范 `Annotation` 值，插入前验证不可信输入。框架 UI 可以单独保存面板状态和乐观网络状态，但不能创建第二套批注模型。完整流程见[保存和恢复批注](./persistence.md)。

## 自定义批注类型

通过 `@inklayer-dev/core/annotation-types` 注册带命名空间的 Definition。Definition 接收已验证数据并返回受控、与渲染器无关的场景值；不会接触 Konva 节点或 PDF.js 内部对象。完整 Definition 和生命周期示例见[自定义批注类型教程](./custom-annotation-type.md)，注册、Definition 缺失、transform reducer 与 PDF appearance stream 见[公开 API](../api.md#annotation-type-definitions)。

## 手动挂载页面

Page Flow 会自动完成挂载。如果适配器自行管理页面布局，应在页面尺寸确定后挂载批注层：

```ts
await core.annotations.attachPage({
  pageIndex: 0,
  container: pageElement,
  width: unscaledPageWidth,
  height: unscaledPageHeight,
  scale: currentScale
})
```

缩放变化时更新或重新挂载，页面卸载时 detach。规范坐标始终保持未缩放页面单位。
