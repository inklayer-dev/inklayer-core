# 加载 PDF

无论 PDF 来自 URL、本地文件，还是受密码保护，都通过 `core.load()` 加载。对于 URL，Core 还可以自动协商使用 HTTP Range。

> [!TIP] 说明
> 应用界面负责选择来源并展示进度或错误；Core 负责加载任务和文档生命周期。

## 加载 URL

```ts
await core.load({
  url: '/documents/review.pdf',
  range: 'auto'
})
```

`range: 'auto'` 会探测服务器是否支持 HTTP Range，并尽可能分块下载大型 PDF。只有服务器明确不支持 Range 时才会回退到整文件请求；普通网络错误不会触发静默回退。

## 加载本地文件

```ts
const file = fileInput.files?.[0]
if (file) {
  await core.load({ data: new Uint8Array(await file.arrayBuffer()) })
}
```

文件选择器由应用界面提供。替换文档或销毁实例时，Core 会释放文件字节占用的资源。

## 发送请求头和凭据

```ts
await core.load({
  url: '/api/documents/42.pdf',
  range: 'auto',
  headers: { Authorization: `Bearer ${token}` },
  credentials: 'include'
})
```

不要把原始 URL、授权请求头或 PDF 内容写入用户可见的错误提示或遥测数据。

## 展示加载进度

```ts
const stopProgress = core.viewer.subscribe(event => {
  if (event.type === 'loadProgress') {
    updateProgress(event.progress.percentage, event.progress.phase)
  }
})
```

加载阶段（`phase`）可能是 `probing`、`downloading` 或 `parsing`。总量未知时，`percentage` 为 `null`；通过 Range 加载的文档可能在全部字节到达前就已可用。组件卸载时，应在销毁 `core` 的同一清理流程中调用 `stopProgress()`。

## 请求密码

```ts
const stopPassword = core.viewer.subscribe(event => {
  if (event.type !== 'passwordRequired') return
  openPasswordDialog({
    reason: event.request.reason,
    submit: password => core.viewer.submitPassword(event.request.requestId, password),
    cancel: () => core.viewer.cancelPassword(event.request.requestId)
  })
})
```

密码错误后，应使用新的请求更新现有对话框，而不是再打开一个。Core 不会把密码写入状态快照或错误信息。组件卸载时调用 `stopPassword()` 退订监听。

## 取消或替换加载

```ts
await core.cancelLoad()
await core.load(nextSource)
```

后发起的加载拥有最终控制权，旧任务无法覆盖它。如何把结构化加载错误转换成产品提示，见[错误恢复](../error-recovery.md)。
