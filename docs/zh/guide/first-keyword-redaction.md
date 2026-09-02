# 创建第一个关键词脱敏

继续使用[创建第一个关键词高亮](./first-keyword-highlight.md)中的 `core` 和 `highlighter`。本页会把审核后的关键词命中转换成一份新的图片型 PDF，其中不再保留可复制或可提取的页面文字。

打开[关键词脱敏示例](https://core.inklayer.dev/demo/#redaction)，可以审核命中并下载这套流程生成的安全输出。

> [!WARNING] 安全说明
> 在原 PDF 上盖一个黑色矩形不等于脱敏。被遮住的文字仍可能被搜索、复制或恢复。需要本文描述的安全保证时，请使用栅格脱敏构建器。

## 审核命中结果

扫描应用已经准备好的规则，再由产品界面排除误匹配：

```ts
await highlighter.scan()

const included = highlighter.getSnapshot().matches
  .filter(match => match.reviewState === 'included')
```

无论界面使用原生 JavaScript、React 还是 Vue，都可以通过 `includeMatch()`、`excludeMatch()`、`includeRule()` 和 `excludeRule()` 修改审核状态。

审核阶段继续使用每条 Highlighter 规则原本的颜色。彩色预览可以让用户读到命中文字、区分规则并排除误匹配；它只是临时界面状态。只有在打印或点击“导出脱敏版”时，Core 才会把确认保留的范围转换成不透明黑块。

## 生成脱敏 PDF

只把确认保留的文字范围传给 Core：

```ts
import {
  buildSecureRedactedPdf,
  downloadBlob
} from '@inklayer-dev/core'

const pdfBytes = await buildSecureRedactedPdf({
  viewer: core.viewer,
  ranges: included.map(match => match.range),
  pixelRatio: 2,
  margin: 1
})

downloadBlob({
  content: pdfBytes,
  filename: 'contract-redacted.pdf',
  mimeType: 'application/pdf'
})
```

Core 会解析文字范围，把每一页渲染为图片，在目标位置绘制黑块，再生成只包含页面图片的新 PDF。结果中无论是脱敏文字还是其他页面文字，都不再支持搜索、选择和复制。

范围为空、Viewer 尚未就绪或文档权限禁止栅格输出时，构建器会拒绝生成。它使用 Viewer 的打印水印，并遵守低分辨率打印限制。

## 理解取舍

第一版安全路径会主动移除完整文字层，因此链接、表单、矢量细节、文字选择、搜索和无障碍文字也会被扁平化。Core 不会修改原文件，不会自动识别图片里的敏感信息，也不会删除其他位置保存的副本。

打开[关键词脱敏示例](https://core.inklayer.dev/demo/#redaction)可以审核命中并导出真实文件。需要实现审核面板、打印、进度、取消和错误处理时，继续阅读[安全关键词脱敏](./keyword-redaction.md)；更广泛的输出安全边界见[打印、导出与水印](./output-and-security.md#导出安全脱敏-pdf)。
