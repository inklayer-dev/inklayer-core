# 打印、导出与水印

本页介绍如何导出带批注的 PDF 和 Excel，打印普通或受密码保护的 PDF，以及控制水印出现的位置。

> [!TIP] 说明
> Core 负责生成输出内容；下载、上传和打开系统打印对话框由应用决定。

## 导出带批注的 PDF

```ts
import { downloadBlob } from '@inklayer-dev/core'
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

const annotations = core.annotations.repository.getAll()
const watermark = core.viewer.getWatermark()

const pdfBytes = await buildAnnotatedPdf(sourceBytes, annotations, {
  strategy: 'strict',
  annotationTypes: core.annotationTypes,
  ...(watermark === null ? {} : { watermark })
})

downloadBlob({
  content: pdfBytes,
  filename: 'review.pdf',
  mimeType: 'application/pdf'
})
```

`sourceBytes` 是原始 PDF 的字节数据，需要由应用自行保留，或在导出时重新获取。导出器会把当前批注写入新的 PDF，同时保留原始文档的矢量内容。传入 `core.annotationTypes` 后，自定义批注类型也可以参与导出。

其他 PDF 软件会显示批注的 `/T` 标题。有 `referenceNumber` 时，Core 默认将它写成“`作者 · #编号`”；用于关联的稳定批注 ID 仍保存在 `/NM` 中。如果产品需要另一种显示方式，可以只修改标题：

```ts
const pdfBytes = await buildAnnotatedPdf(sourceBytes, annotations, {
  annotationTitle: annotation => `审阅 ${annotation.referenceNumber ?? '—'}`
})
```

InkLayer 还会在导出的 PDF 中保留原始作者、引用编号和结构化引用，供再次导入时恢复。修改 `annotationTitle` 不会改变权限归属或引用目标。

`buildAnnotatedPdf()` 只返回 PDF 字节，不负责命名、下载或上传。默认的 `strict` 策略遇到无效或不支持的批注会直接报错；`lenient` 会跳过该批注，并通过可选的 `onWarning` 回调报告问题。受密码保护的原始 PDF 字节不能通过这条客户端矢量路径导出。

## 打印普通 PDF

对于未加密的 PDF，使用 `buildPrintablePdf()` 可以保留文字、链接、表单和矢量内容：

```ts
import { printPdfBlob } from '@inklayer-dev/core'
import { buildPrintablePdf } from '@inklayer-dev/core/export/pdf'

const watermark = core.viewer.getWatermark()

const printable = await buildPrintablePdf(
  sourceBytes,
  core.annotations.repository.getAll(),
  {
    annotationTypes: core.annotationTypes,
    ...(watermark === null ? {} : { watermark })
  }
)

await printPdfBlob({ content: printable })
```

`buildPrintablePdf()` 使用水印的 `print` 配置，`buildAnnotatedPdf()` 使用 `export` 配置。`printPdfBlob()` 接收包含 PDF 字节的对象，并负责创建和清理打开浏览器打印对话框所需的临时 iframe 与对象 URL。

## 打印受密码保护的 PDF

PDF.js 成功打开受密码保护的文档后，可以根据当前 Viewer 生成一份临时的栅格化 PDF：

```ts
import { buildSecureRasterPrintPdf, printPdfBlob } from '@inklayer-dev/core'

const printable = await buildSecureRasterPrintPdf({
  viewer: core.viewer,
  annotations: core.annotations,
  pixelRatio: 2,
  onProgress: (completed, total) => updateProgress(completed, total)
})

await printPdfBlob({ content: printable })
```

这条路径只能在浏览器中使用，会合并当前批注和打印水印。如果文档禁止打印，Core 会拒绝生成；如果文档只允许低分辨率打印，像素倍率最多为 `1`。

生成的 PDF 仅用于临时打印，不再加密，而且每一页都被转换成图片，原有的可选文字、链接、表单和矢量细节也会随之丢失。只能用它打开打印对话框，不能把它当作受保护文档的替代下载或导出文件。如果必须导出保留矢量内容的受保护 PDF，应由可信后端完成解密、处理和重新加密。

## 配置水印

```ts
import type { PdfWatermarkSpec } from '@inklayer-dev/core'

const watermark: PdfWatermarkSpec = {
  text: `${currentUser.name} · ${documentId}`,
  layout: 'repeated',
  opacity: 0.12,
  rotation: -28,
  targets: {
    viewer: true,
    print: true,
    export: true,
    thumbnails: false
  }
}

core.viewer.setWatermark(watermark)
```

建议在加载文档前配置水印，这样 Page Flow 首次渲染页面时就能显示出来。`viewer`、`print` 和 `export` 分别控制浏览页面、打印 PDF 和导出 PDF 时是否显示水印。默认情况下，页面和打印水印开启，导出和缩略图水印关闭。

虽然水印配置中包含 `targets.thumbnails`，但当前的 `renderThumbnail()` 实现不会添加水印；即使设为 `true`，生成的缩略图也不会出现水印。

如果水印包含中文，或其他默认 PDF 字体不支持的字符，生成矢量 PDF 时还需要提供 TrueType 或 OpenType 字体文件：

```ts
const response = await fetch('/fonts/NotoSansSC-Regular.ttf')
const watermarkFontBytes = new Uint8Array(await response.arrayBuffer())

const pdfBytes = await buildAnnotatedPdf(sourceBytes, annotations, {
  watermark,
  watermarkFontBytes,
  annotationTypes: core.annotationTypes
})
```

`buildPrintablePdf()` 同样支持 `watermarkFontBytes`。页面水印和栅格打印水印由浏览器绘制，使用浏览器可用的字体。水印只能降低文档被随意传播的风险，不能代替防篡改或访问控制；敏感文档的权限策略仍应由可信后端执行。

## 将批注导出为 Excel

```ts
import { downloadBlob } from '@inklayer-dev/core'
import { buildAnnotationWorkbook } from '@inklayer-dev/core/export/excel'

const workbook = await buildAnnotationWorkbook(
  core.annotations.repository.getAll()
)

downloadBlob({
  content: workbook,
  filename: 'annotations.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
})
```

生成的工作簿包含两张工作表，分别保存批注和评论。可以通过 `buildAnnotationWorkbook()` 的配置本地化工作表名称和列标题；批注类型、审核状态和引用标识仍保留原始值。

`printPdfBlob()` 和 `downloadBlob()` 都依赖浏览器环境。在 Electron、移动端 WebView、服务端渲染或自定义文件服务中，可以通过 `createPrintCapability()` 或 `createDownloadCapability()` 接入自己的打印和下载实现。
