# 安全关键词脱敏

第一次接入？请先完成[创建第一个关键词脱敏](./first-keyword-redaction.md)，或直接打开[关键词脱敏示例](https://core.inklayer.dev/demo/#redaction)。本页说明如何把关键词规则、人工审核和安全输出组合成一个可扩展的产品流程。

关键词脱敏不是一种永久批注。它复用 Highlighter 查找和审核文字范围，但最终生成一份新的图片型 PDF：

```text
应用规则 → 彩色预览 → 人工审核 → 不透明遮挡 → 图片型 PDF
```

## 预览与脱敏输出必须分离

页面预览应该继续使用每条规则的普通 Highlighter 颜色。用户需要读到命中文字、区分规则并排除误匹配；不要在审核阶段提前把文字涂黑。

只有打印或导出脱敏版时，才把确认保留的文字范围交给 `buildSecureRedactedPdf()`。Core 会重新渲染所有页面、绘制不透明黑块，并创建一份不含源文字对象的新 PDF。预览颜色不会进入脱敏输出。

| 阶段 | 应用展示 | Core 数据 |
| --- | --- | --- |
| 扫描 | 按规则分色的临时高亮 | `KeywordMatch[]` |
| 审核 | 包含、排除、跳转和计数 | `reviewState` |
| 打印或导出 | 进度、取消和完成状态 | `PdfTextRange[]` |
| 结果 | 新的图片型 PDF | `Uint8Array` |

## 审核关键词命中

Controller 默认把扫描命中标记为 `included`。产品界面可以逐条或按规则修改审核状态：

```ts
highlighter.excludeMatch(matchId)
highlighter.includeMatch(matchId)
highlighter.excludeRule('internal-identifiers')
highlighter.includeRule('internal-identifiers')
```

通过 Snapshot 驱动结果列表和输出按钮，不要在组件中维护第二份审核状态：

```ts
const unsubscribe = highlighter.subscribe(snapshot => {
  const canOutput = snapshot.status === 'ready'
    && snapshot.includedCount > 0

  exportButton.disabled = !canOutput
  printButton.disabled = !canOutput
  includedCount.textContent = String(snapshot.includedCount)
})
```

调用 `activateMatch(id)` 可以跳转到命中页并更新活动预览。`clearPreview()` 只隐藏 Controller 拥有的临时层，不会清除规则和审核结果；`reset()` 才会清空整个工作流。

## 构建一次可复用的脱敏任务

打印和下载应该调用同一个构建函数，避免两条输出路径产生不同结果：

```ts
import { buildSecureRedactedPdf } from '@inklayer-dev/core'

async function buildReviewedRedaction(signal?: AbortSignal) {
  const snapshot = highlighter.getSnapshot()
  if (snapshot.status !== 'ready') {
    throw new Error('Keyword review is not ready.')
  }

  const ranges = snapshot.matches
    .filter(match => match.reviewState === 'included')
    .map(match => match.range)

  return await buildSecureRedactedPdf({
    viewer: core.viewer,
    ranges,
    pixelRatio: 2,
    margin: 1,
    signal,
    onProgress: (completed, total) => {
      progress.textContent = `${completed}/${total}`
    }
  })
}
```

`pixelRatio` 默认为 `2`，可设置为大于 `0` 且不超过 `4` 的有限数值。更高倍率会增加清晰度、内存占用、处理时间和文件体积。文档只允许低分辨率打印时，Core 会自动把倍率限制为 `1`。

`margin` 默认为 `1` 个 PDF 页面单位，用来盖住字形边缘。它可以设为 `0` 到 `20`，但过大会遮住相邻内容，因此应使用固定、经过验证的产品值，不要让普通用户随意调整。

## 下载脱敏版

下载按钮只负责命名和交付构建结果：

```ts
import { downloadBlob } from '@inklayer-dev/core'

const controller = new AbortController()

try {
  exportButton.disabled = true
  const bytes = await buildReviewedRedaction(controller.signal)
  downloadBlob({
    content: bytes,
    filename: 'contract-redacted.pdf',
    mimeType: 'application/pdf'
  })
} finally {
  exportButton.disabled = highlighter.getSnapshot().includedCount === 0
}
```

当用户关闭对话框、切换文档或取消任务时，调用 `controller.abort()`。不要同时启动多个脱敏构建任务；在任务结束前禁用冲突操作。

## 打印脱敏版

打印必须复用同一份安全构建结果，而不是打印当前带彩色预览的 DOM：

```ts
import { printPdfBlob } from '@inklayer-dev/core'

const bytes = await buildReviewedRedaction()
await printPdfBlob({ content: bytes })
```

这样打印预览中显示的是不透明黑块，而页面上的审核界面仍保持彩色 Highlighter。不要调用 `window.print()` 直接打印 Viewer 页面，因为浏览器打印样式、文字层和临时覆盖层都不能提供脱敏保证。

## 安全保证与取舍

`buildSecureRedactedPdf()` 不会在原 PDF 上叠加矩形。它会：

1. 解析审核后的源文字范围。
2. 将每个 PDF 页面渲染成位图。
3. 在目标几何位置绘制不透明黑块。
4. 生成只嵌入页面图片的新 PDF。

因此，输出中所有页面文字都会失去选择、复制、搜索和文字无障碍能力；链接、表单、矢量细节和原有批注结构也会被扁平化。这是当前客户端安全路径的主动取舍。

这项保证只覆盖传入的文字范围和新生成的文件。Core 不会自动识别图片里的身份证、签名或人脸，不会修改原文件，也不会删除缓存、历史版本或其他位置的副本。高风险场景仍应保留人工复核，并验证下载后的最终文件。

## 处理错误和权限

以下情况会拒绝生成：

- Viewer 尚未加载到 `ready` 状态；
- 没有任何确认保留的范围；
- 文档权限禁止打印或栅格输出；
- 运行环境缺少浏览器 Canvas 或 `createImageBitmap`；
- `pixelRatio` 或 `margin` 超出允许范围；
- 任务被 `AbortSignal` 取消。

应用应把 `PDF_PERMISSION_DENIED` 与普通 `EXPORT_FAILED` 分开提示。取消会抛出 `AbortError`，通常只需要恢复按钮状态，不需要显示错误通知。服务端 Node.js 环境不能直接使用这条浏览器栅格路径。

## React 和 Vue 如何接入

React、Vue 和原生 JavaScript 都直接消费同一个 `KeywordHighlighter` Controller。组件只负责把 Snapshot 渲染成规则列表、命中列表和输出按钮；脱敏构建器不依赖框架。

组件卸载时取消正在进行的构建任务、调用订阅返回的 `unsubscribe()`，最后销毁由组件拥有的 Controller：

```ts
abortController?.abort()
unsubscribe()
highlighter.destroy()
```

完整 Controller 状态、正则规则和审核方法见[关键词高亮](./highlighter.md)。其他 PDF、Excel、打印和水印输出见[打印、导出与水印](./output-and-security.md)。
