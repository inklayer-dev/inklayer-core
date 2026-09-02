# 盖章与可视签名

打开 [Stamp & Sign 示例](https://core.inklayer.dev/demo/#stamp-sign)，可以使用内置示例章和签名完成手动放置、批量盖章、透明度调整与 PDF 导出。

> [!WARNING] 可视签名不是数字签名
> `signature` 表示图片或手写轨迹形式的可视签名。它不包含数字证书、签名校验、防篡改或签署人身份认证能力。

## 准备一个章或签名

图片由应用获取，可以来自上传、签名板、模板库或后端。Core 接收自包含的 PNG/JPEG Data URL，并负责后续放置和导出：

```ts
core.annotations.setImageAsset('stamp', {
  image: approvedStampDataUrl,
  width: 140,
  height: 60,
  text: 'Approved stamp'
})

core.annotations.setImageAsset('signature', {
  image: signatureDataUrl,
  width: 180,
  height: 60,
  text: 'Ada signature'
})
```

图片采集、裁剪、背景去除和资产权限属于应用界面。Core 不提供固定的章库或签名采集弹窗。

## 手动放置

先设置未来创建项的透明度，再启用对应工具：

```ts
core.annotations.setToolAppearance('stamp', { opacity: 0.8 })
core.annotations.setTool('stamp')
```

下一次点击 PDF 页面会创建一个 Stamp。图片签名使用 `setTool('signature')`。创建完成后，Core 会回到选择工具；用户可以移动、缩放、旋转或删除刚放置的内容。

如果尚未调用 `setImageAsset()`，页面点击不会创建空图片，而是发出 `imageAssetRequired` 事件，让应用打开自己的资源选择器。

## 调整已经放置的透明度

选中一个 Stamp 或 Signature 后，使用批注 ID 更新整体透明度：

```ts
const selectedId = core.annotations.repository.getSelection().primaryId

if (selectedId !== undefined) {
  core.annotations.updateAppearance(selectedId, { opacity: 0.55 })
}
```

`opacity` 范围为 `0` 到 `1`。Demo 将用户输入限制为 `0.05` 到 `1`，避免生成几乎不可见、难以再次选择的内容。

## 批量放置到多个页面

页面范围输入、位置预设和重复确认属于应用工作流。Core 只需要接收每个页面上最终确定的批注数据：

```ts
const pageIndexes = [0, 1, 2] // 用户选择的第 1-3 页

for (const pageIndex of pageIndexes) {
  const page = await handle.document.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const width = 140
  const height = 60
  const margin = 24

  core.annotations.createAnnotation({
    type: 'stamp',
    pageIndex,
    bounds: {
      x: viewport.width - width - margin,
      y: viewport.height - height - margin,
      width,
      height
    },
    content: { text: 'Approved stamp', image: approvedStampDataUrl },
    appearance: { opacity: 0.65 }
  })
}
```

不要把第一页坐标原样复制到所有页面。横向页、旋转页和不同 CropBox 可能具有不同尺寸；应逐页读取 `getViewport({ scale: 1 })`，再计算左上、右上、左下、右下或居中位置。

公开 Demo 支持 `all`、`current`、`odd`、`even`、`1-3` 和 `1-3, 5`。这些字符串是 Demo 的产品协议，不是 Core API。创建过程中发生错误时，Demo 会删除本批次已经创建的项，避免留下半完成结果。

## 导出带章 PDF

Stamp 和图片 Signature 都会作为 PDF Stamp 外观导出：

```ts
import { downloadBlob } from '@inklayer-dev/core'
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

const bytes = await buildAnnotatedPdf(
  sourceBytes,
  core.annotations.repository.getAll(),
  { annotationTypes: core.annotationTypes }
)

downloadBlob({
  content: bytes,
  filename: 'contract-stamped.pdf',
  mimeType: 'application/pdf'
})
```

导出结果会保留位置、大小、旋转和整体透明度。它表达的是一个可见的 PDF 标记，不能替代证书数字签名。更完整的导出、打印和水印限制见[打印、导出与水印](./output-and-security.md)。
