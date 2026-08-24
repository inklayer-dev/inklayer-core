# 错误恢复

InkLayer Core 返回机器可读的失败上下文；应用负责可见的错误文案、重试按钮、重试次数和退避策略。Vanilla 示例中的恢复面板展示了这条边界，但不会把故障注入逻辑带进正式发布的 Core。

## 恢复矩阵

| 场景 | Core 返回 | 应用如何重试 |
|---|---|---|
| URL 文档加载失败 | `PDF_LOAD_FAILED`，操作为 `load` | 保留 URL 来源，再次调用 `viewer.load(source)`。 |
| HTTP Range 失败 | `PDF_RANGE_FAILED`，操作为 `fetchPdfRange` | 服务恢复后，重新执行同一次自动 Range 加载。网络错误不会静默退化为整文件下载。 |
| 密码错误 | `passwordRequired` 事件，`reason: 'incorrect'`，且 `attempt` 递增 | 保持当前密码框，重新调用 `submitPassword(requestId, password)`。Core 不保存密码。 |
| 页面栅格化失败 | `PDF_FEATURE_FAILED`，操作为 `renderPageRaster`，并包含从 0 开始的 `pageIndex` | 修复渲染表面或 Provider 后，对同一页再次调用 `renderPageRaster()`。 |
| 主动取消加载 | `PDF_LOAD_CANCELLED`，操作为 `load`；Viewer 回到 `idle` | 应用保留来源并再次调用 `load()`。取消与网络或解析失败是不同结果。 |

`InkLayerError.cause` 可供诊断代码使用，但示例不会把它直接序列化进 DOM，避免平台错误意外暴露 URL、请求头、凭据或文档内容。产品的日志和遥测也必须遵守这条规则。

## 可复现示例

Vanilla Vite fixture 提供两个“首次失败”端点：URL 端点第一次返回无效 PDF，重试时返回有效文档；Range 端点第一次故意让分段请求失败，之后正常提供字节范围。示例专用的 surface provider 也会拒绝一次栅格编码，再恢复正常。这些接缝让恢复行为可重复验证，而不改变生产环境中的 Core 行为。

Password PDF 和 URL Range PDF 控件覆盖密码错误与主动取消。每个重试闭包只属于创建它的 Core 实例，不能在文档工作区之间隐式共享。

## 验证

```sh
npx vitest run tests/integration/viewer/pdf-viewer-engine.test.ts
npx playwright test tests/browser/vanilla.spec.ts --grep "recovers URL, Range"
```

浏览器场景会在 Chromium、Firefox 和 WebKit 中跑完五种恢复路径。测试允许故意制造的 URL/Range 请求产生对应引擎的网络或无效 PDF 诊断，但会拒绝其他控制台警告、错误和未捕获的页面异常。
