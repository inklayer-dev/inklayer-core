# 保存和恢复批注

批注保存在 `core.annotations.repository`。Repository 是交互、渲染、评论、打印和导出共同使用的唯一批注数据源。应保存它返回的分离数据，不要保存 Canvas 节点、DOM 矩形、选择、hover 或工具栏状态。

## 读取当前批注

```ts
const annotations = core.annotations.repository.getAll()
const json = JSON.stringify(annotations)
```

返回的数组和值已经与内部状态分离，序列化不会修改正在运行的引擎。

## 在变更后保存

```ts
const repository = core.annotations.repository
const stopSaving = repository.subscribe(event => {
  if (event.type === 'selection' || event.type === 'destroy') return
  void saveToServer(documentId, repository.getAll())
})
```

真实产品应对请求做防抖或批处理，并把网络状态保存在应用层。Repository 事件表示同步文档变更，并不是一套同步协议。

## 恢复已保存数据

```ts
const saved = await loadFromServer(documentId)
core.annotations.repository.replaceAll(saved)
```

`replaceAll()` 会先验证整个集合和重复 ID，再替换当前状态。服务端数据应按不可信输入处理，并向用户明确展示验证失败。

## 让数据跨引擎实例存活

批注数据需要比一次 Viewer 挂载存活更久时，创建并提供自己的 Repository：

```ts
import { createMemoryAnnotationRepository } from '@inklayer-dev/core'
import {
  createAnnotationRepositoryCapability,
  createInkLayer
} from '@inklayer-dev/core/capabilities'

const repository = createMemoryAnnotationRepository()
repository.replaceAll(saved)

const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [createAnnotationRepositoryCapability(repository)]
})
```

Capability 提供的 Repository 默认是 borrowed，因此 `core.destroy()` 不会销毁它。只有 Core 实例应该负责最终清理时才使用 `{ ownership: 'owned' }`。

## 应该保存什么

保存规范 `Annotation` 值，包括稳定 ID、`pageIndex`、`type`、bounds、appearance、content、comments、权限相关归属、references、`typeData` 和 renderer state。打开的面板、工具栏按钮、请求状态、搜索高亮和 hover 等产品状态应放在批注 payload 之外。

协作或远端持久化也应包装同一组 Repository 命令和事件，并由应用定义策略，不能修改 Konva 或 Repository 内部状态。
