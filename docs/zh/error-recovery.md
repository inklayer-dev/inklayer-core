# 错误恢复

Core 负责返回结构化错误，应用负责决定向用户显示什么内容，以及何时允许重试。底层问题解决后，应使用原来的输入重新发起操作；不要复用 PDF.js 内部任务，也不要在多个查看器实例之间共享重试状态。

> [!NOTE] 提示
> 界面中只显示 `error.message` 或应用自己编写的提示。`error.cause` 仅用于内部诊断，直接写入界面或遥测数据可能泄露 URL、请求头、凭据或文档数据。

## 常见恢复方式

| 场景 | Core 返回 | 应用如何处理 |
| --- | --- | --- |
| PDF URL、网络或解析失败 | `PDF_LOAD_FAILED` | 保留原来的 `PdfSource`，再次调用 `core.load(source)`。 |
| HTTP Range 请求失败 | `PDF_RANGE_FAILED` | 等服务器或网络恢复后重试。网络错误不会自动改成整文件下载。 |
| 服务器不支持 Range | `range: 'auto'` 时自动回退，否则返回 `PDF_RANGE_UNSUPPORTED` | 使用 `range: 'auto'`；如果可以接受整文件下载，也可以改成 `range: false`。 |
| 密码错误 | `passwordRequired` 事件，`reason` 为 `incorrect` | 保持当前密码框，使用活动的 `requestId` 再次提交密码。 |
| 用户取消密码输入 | 当前加载返回 `PDF_PASSWORD_CANCELLED` | 返回文档选择界面，或者等待用户重新发起加载。 |
| 应用主动取消加载 | 当前加载返回 `PDF_LOAD_CANCELLED` | 将取消视为正常结果；只在用户要求时重新加载。 |
| 应用取消 `searchMany()` | 当前批量搜索返回 `PDF_FEATURE_CANCELLED` | 将取消视为正常结果；保留已加载文档，只在用户要求时开始新的搜索。 |
| 应用取消 `resolveTextRanges()` | 当前几何计算返回 `PDF_FEATURE_CANCELLED` | 将取消视为正常结果；已加载文档及页面文字缓存仍然可用。 |
| 临时文字高亮层输入无效 | 返回 `PDF_FEATURE_FAILED`，operation 为 `setTextHighlightLayers` 或 `clearTextHighlightLayers` | 修正重复/空白 ID、页面范围、激活索引、可见性或 CSS 颜色；此前保留的图层不会改变。 |
| 页面、搜索、缩略图或栅格操作失败 | `PDF_FEATURE_FAILED`，通常带有 `operation` 和 `pageIndex` | 修正输入或浏览器资源问题后，只重试对应功能。 |
| PDF 权限禁止打印 | `PDF_PERMISSION_DENIED` | 禁用打印，并说明该文档不允许打印。 |
| Core 实例已经销毁 | `ENGINE_DESTROYED` | 创建新实例；已经销毁的实例不能重新启动。 |

## 重试文档加载

把文档来源保存在应用状态中，每次重试都使用它重新发起加载：

```ts
import { InkLayerError } from '@inklayer-dev/core'

const retryButton = document.querySelector<HTMLButtonElement>('#retry')!
const source = { url: '/documents/review.pdf', range: 'auto' as const }

async function openPdf(): Promise<void> {
  retryButton.hidden = true

  try {
    await core.load(source)
  } catch (error) {
    if (error instanceof InkLayerError && error.code === 'PDF_LOAD_FAILED') {
      retryButton.hidden = false
      retryButton.onclick = () => { void openPdf() }
      return
    }

    throw error
  }
}

await openPdf()
```

如果反复发送网络请求的成本较高，应由应用设置重试次数或退避策略。

## 处理密码重试

密码错误不会重新开始 PDF 加载。当前加载任务仍然有效，并会再次发出密码请求：

```ts
const stopPassword = core.viewer.subscribe(event => {
  if (event.type !== 'passwordRequired') return

  openPasswordDialog({
    reason: event.request.reason,
    attempt: event.request.attempt,
    submit(password: string) {
      core.viewer.submitPassword(event.request.requestId, password)
    },
    cancel() {
      core.viewer.cancelPassword(event.request.requestId)
    }
  })
})
```

移除组件或工作区时调用 `stopPassword()` 取消订阅。

## 根据稳定字段处理错误

`InkLayerError` 一定包含 `code`，还可能包含 `operation`、`annotationId` 和从 0 开始的 `pageIndex`。应用应根据这些结构化字段处理错误，不要匹配可能变化的英文错误文案。

批注校验和权限失败通常使用 `ANNOTATION_INVALID`；自定义类型不可用时使用 `ANNOTATION_TYPE_UNAVAILABLE`；导入和导出分别使用 `IMPORT_FAILED` 与 `EXPORT_FAILED`。完整的 `InkLayerErrorCode` 联合类型由 `@inklayer-dev/core` 导出。
