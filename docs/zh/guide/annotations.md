# 批注工具与外观

本页是批注工具和外观设置的参考，汇总全部内置类型、工具切换方式、创建模式和外观能力。想先完成一次实际操作，请阅读[创建第一个批注](./first-annotation.md)；需要增加新的批注类型，请先阅读[创建第一个自定义批注](./first-custom-annotation.md)，再继续查看[自定义批注类型](./custom-annotation-type.md)。独立的[自定义批注示例](https://core.inklayer.dev/demo/#custom-annotations)不会混入内置绘图工具。

需要体验完整内置工具、外观控制、Repository 列表、打印和导出流程时，打开[批注示例](https://core.inklayer.dev/demo/#annotations)。

## 内置批注类型

所有内置类型都支持打印和 PDF 导出。`native` 会写入标准 PDF 批注字典；没有对应标准 PDF 类型的效果，则由 `appearance-stream` 通过 Stamp 外观流保留下来。

“几何”“创建方式”和“PDF 策略”来自批注类型定义，主要供扩展批注类型时参考。普通使用只需关注“类型 ID”和“用途”。

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
core.annotations.setTool('text-select')
core.annotations.setTool('select')
```

`rectangle` 用来绘制矩形，`text-select` 用来选择 PDF 文字，`select` 用来编辑已有批注。

大多数创建工具在完成一个批注后会切回 `select`。`highlight`、`underline` 和 `strikeout` 默认保持激活，方便连续添加文字批注。创建 Core 实例时可以修改这一行为：

```ts
const core = await createInkLayer({
  root,
  annotation: {
    creationModes: { rectangle: 'continuous' }
  }
})
```

工具栏应根据 `toolChanged` 事件更新状态，因为单次创建完成后，工具可能自动切回 `select`。文字类批注遵循“先选文字，再创建批注”的规则，完整的按钮交互见[创建第一个批注](./first-annotation.md)。

## 外观

`AnnotationAppearanceInput` 只需提供想修改的字段。省略的字段会保留当前值；将 `stroke`、`fill` 或 `text` 设为 `null`，会关闭对应的外观。

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

FreeText 使用配置的 `TextInputProvider`。浏览器默认实现会创建并管理页面内的 textarea；应用也可以通过 Capability 提供另一种实现，而不改变批注语义。

Signature 和 Stamp 是图片批注。应用创建或选择 PNG/JPEG 数据 URL（data URL），再把待放置的图片交给 Core：

```ts
core.annotations.setImageAsset('signature', {
  image: signatureDataUrl,
  width: 180,
  height: 60,
  text: 'Ada signature'
})
core.annotations.setTool('signature')
```

Core 负责光标预览、放置、选择、变换、渲染和 PDF 输出。如果还没有设置图片，点击页面会发出 `imageAssetRequired`，应用可以据此打开选择器。

## 批注数据与协作

`core.annotations.repository` 是当前实例的批注数据仓库，也是批注、选择、评论、引用和权限的唯一数据来源。需要让这些状态在 Core 实例销毁后继续保留时，可以传入自己的 Repository，或通过 `createAnnotationRepositoryCapability()` 安装。

只持久化经过校验的 `Annotation` 数据，并在写入前验证不可信输入。应用界面可以单独保存面板状态和网络请求的临时状态，但不要再维护第二套批注数据。完整流程见[保存和恢复批注](./persistence.md)。

## 自定义批注类型

通过 `@inklayer-dev/core/annotation-types` 注册带命名空间的批注类型定义（Definition）。定义接收已验证的数据，返回受控且与渲染器无关的场景数据，不会接触 Konva 节点或 PDF.js 内部对象。完整定义和生命周期示例见[自定义批注类型](./custom-annotation-type.md)；注册方式、定义缺失、变换处理和 PDF 外观流见[公开 API](../api.md#annotation-type-definitions)。

## 手动挂载页面

Page Flow 会自动完成挂载。如果适配器自行管理页面布局，需要在每页画布上方放置一个空白批注层，并在页面尺寸确定后将它挂载到 Core：

```ts
await core.annotations.attachPage({
  pageIndex: 0,
  container: annotationLayer,
  width: unscaledPageWidth,
  height: unscaledPageHeight,
  scale: currentScale
})
```

缩放变化时更新或重新挂载批注层。页面卸载时调用 `core.annotations.detachPage(pageIndex)`。批注坐标始终使用未缩放的页面单位。
