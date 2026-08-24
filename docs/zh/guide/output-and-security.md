# 打印、导出与水印

## 矢量 PDF 导出

```ts
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

const output = await buildAnnotatedPdf(sourceBytes, annotations, {
  strategy: 'strict',
  watermark: core.viewer.getWatermark(),
  annotationTypes: core.annotationTypes
})
```

矢量导出器只返回字节，不决定文件名、不下载文件、不上传数据，也不打开 UI。严格模式会在返回部分结果前失败；宽松模式跳过无效条目并返回警告。

## 打印

普通文档使用矢量打印准备。已经由 PDF.js 打开的密码或敏感文档使用安全栅格准备：

```ts
import { buildSecureRasterPrintPdf, printPdfBlob } from '@inklayer-dev/core'

const printable = await buildSecureRasterPrintPdf({
  viewer: core.viewer,
  annotations: core.annotations,
  pixelRatio: 2
})

await printPdfBlob(printable)
```

安全路径为打印对话框生成临时、未加密、仅图片 PDF。它执行规范化 PDF 权限并合并批注和打印水印，但会有意丢失可选择文本、链接、表单和矢量保真度。不要把它作为替代文档提供下载。

## 水印

```ts
core.viewer.setWatermark({
  text: `${currentUser.name} · ${documentId}`,
  layout: 'repeated',
  opacity: 0.12,
  rotation: -28,
  targets: { viewer: true, print: true, export: true, thumbnails: false }
})
```

前端水印只能阻止普通复用，并非防篡改 DRM。高价值策略也应在可信后端执行。

## 下载与 Excel

```ts
import { buildAnnotationWorkbook } from '@inklayer-dev/core/export/excel'
import { downloadBlob } from '@inklayer-dev/core'

const workbook = await buildAnnotationWorkbook(annotations)
downloadBlob({
  content: workbook,
  filename: 'annotations.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
})
```

浏览器 Print 和 Download Provider 是可选副作用边界。在 Electron、移动 WebView、服务端渲染或自定义文件服务中，应提供自己的 Port Capability，而不是模拟浏览器点击。
