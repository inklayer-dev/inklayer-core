# 保存和恢复批注

批注保存在 `core.annotations.repository`。交互、渲染、评论、打印和导出都使用这里的数据。调用 `getAll()` 会得到一组相互独立、可以序列化的 `Annotation` 数据；持久化时应保存这些数据，而不是 Canvas 节点或其他界面状态。

一条 `Annotation` 包含批注 ID、所在页面、位置和尺寸、外观、内容、评论、作者、时间以及重新绘制所需的数据。完整字段定义见[规范数据模型](../data-model.md)。通常不需要为了持久化而手动拼装这个对象：直接保存 Repository 返回的数据，并在恢复时把整个集合交还给 Repository 即可。

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
  void saveToServer(documentId, repository.getAll()) // 异步保存，这里不等待完成。
})
```

真实产品应对请求做防抖或批处理，并把网络状态保存在应用层。Repository 事件表示同步文档变更，并不是一套同步协议。
创建该订阅的组件或应用作用域销毁时，应调用 `stopSaving()` 停止订阅。

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

## 配置作者与权限

创建 Core 实例时，应用需要提供当前登录用户和权限规则：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotation: {
    currentUser: {
      id: currentUser.id,
      name: currentUser.name
    },
    permissions: {
      mode: 'owner-only'
    }
  }
})
```

新建批注时，Core 会把 `currentUser` 记录为批注的 `author`。使用 `owner-only` 后，任何已登录用户都可以创建批注和添加评论，但只有批注作者可以编辑、移动、删除该批注或修改其状态；评论也只能由评论作者编辑或删除。

Core 会在执行操作时检查这些规则，并阻止不允许的直接交互。应用也应该隐藏或禁用不可用的按钮，让界面与权限规则保持一致，但不能只依赖界面限制权限。服务端接收批注写入请求时，还必须再次进行权限校验。如果没有配置 `permissions`，批注操作默认不受限制。

如果要禁止所有批注操作，让文档完全只读，可以提供自定义判断：

```ts
annotation: {
  currentUser,
  permissions: {
    can: () => false
  }
}
```

如果当前用户或权限规则在 Core 实例运行期间发生变化，可以调用 `core.annotations.setCurrentUser(nextUser)` 或 `core.annotations.setPermissions(nextPermissions)` 更新。

## 应该保存什么

应完整保存 Repository 返回的每一条 `Annotation`。它的顶层结构如下：

```ts
interface Annotation {
  id: string
  schemaVersion: 1
  type: AnnotationTypeId
  pageIndex: number
  bounds: AnnotationBounds
  coordinateSpace: AnnotationCoordinateSpace
  appearance: AnnotationAppearance
  comments: AnnotationComment[]
  author: User
  createdAt: string | null
  native: boolean
  rendererState: KonvaRendererState

  content?: AnnotationContent
  updatedAt?: string | null
  referenceNumber?: number
  source?: AnnotationSource
  typeData?: AnnotationTypeData
  extensions?: JsonObject
}
```

`author` 表示与批注关联的作者身份。权限模式和自定义权限回调属于运行时配置，不是批注数据，不需要随批注保存。引用信息位于 `content` 或具体评论中，并不是顶层字段。`rendererState` 是 Core 准确重绘批注所需的数据，应保持原样；自定义批注包含 `typeData` 时也要一并保存。

打开的面板、当前选中的工具栏按钮、请求状态、搜索高亮、选择状态和鼠标悬停状态都属于应用界面，不应写入批注数据。

协作或远端持久化也应包装同一组 Repository 命令和事件，并由应用定义策略，不能修改 Konva 或 Repository 内部状态。
