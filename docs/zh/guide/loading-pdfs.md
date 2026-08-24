# 加载 PDF

URL、本地文件字节、密码文档和自动 HTTP Range 加载都使用同一个 `core.load()`。产品 UI 选择来源并展示进度或错误；Core 负责加载任务和文档生命周期。

## 加载 URL

```ts
await core.load({
  url: '/documents/review.pdf',
  range: 'auto'
})
```

`range: 'auto'` 会探测 HTTP Range 支持，并在可能时按字节分块下载大型 PDF。只有服务器明确不支持 Range 时才回退整文件请求，普通网络失败不会触发静默回退。

## 加载本地文件

```ts
const file = fileInput.files?.[0]
if (file) {
  await core.load({ data: new Uint8Array(await file.arrayBuffer()) })
}
```

文件选择器属于产品 UI。字节属于当前文档 generation，替换文档或销毁实例时会释放相关资源。

## 发送请求头和凭据

```ts
await core.load({
  url: '/api/documents/42.pdf',
  range: 'auto',
  headers: { Authorization: `Bearer ${token}` },
  credentials: 'include'
})
```

不要把源 URL、授权请求头或 PDF 内容复制进可见错误提示或遥测。

## 展示加载进度

```ts
const stop = core.viewer.subscribe(event => {
  if (event.type === 'loadProgress') {
    updateProgress(event.progress.percentage, event.progress.phase)
  }
})
```

phase 为 `probing`、`downloading` 或 `parsing`。未知总量使用 `null`；Range 文档可能在全部字节到达前就已可用。

## 请求密码

```ts
core.viewer.subscribe(event => {
  if (event.type !== 'passwordRequired') return
  openPasswordDialog({
    reason: event.request.reason,
    submit: password => core.viewer.submitPassword(event.request.id, password),
    cancel: () => core.viewer.cancelPassword(event.request.id)
  })
})
```

密码错误后保留同一个对话框，根据新请求状态再次提交。Core 不会把密码存入快照或错误。

## 取消或替换加载

```ts
await core.cancelLoad()
await core.load(nextSource)
```

较新的加载始终获胜，旧任务不能覆盖它。使用[错误恢复](../error-recovery.md)中的结构化结果映射产品提示。
