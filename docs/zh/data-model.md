# 批注数据模型

`Annotation` 是可序列化的批注数据，也是数据仓库、持久化、导入、打印和导出的唯一数据来源。应保存 Core 返回的完整对象，不要用 DOM 元素、Konva 节点或临时工具栏状态代替它。

## 顶层结构

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

这是 V1 批注完整的顶层结构。嵌套对象分别保存文字或图片内容、外观、评论、自定义类型数据和绘制数据。

## 字段含义

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定的批注 ID，在一份文档中必须唯一。 |
| `schemaVersion` | 完整批注结构的版本，目前为 `1`。 |
| `type` | 16 种内置类型之一，或带命名空间的 `custom:<namespace>/<name>`。`select` 是工具，不是批注类型。 |
| `pageIndex` | 从 0 开始的 PDF 页码。 |
| `bounds` | `coordinateSpace` 坐标系中有限、非负、轴对齐的位置和尺寸。 |
| `appearance` | 完整的透明度、边框、填充和文字外观。 |
| `content` | 可选的文字、所选原文、图片、签名或引用内容。 |
| `comments` | 按稳定顺序保存的评论和回复。 |
| `author` | 创建者身份，供应用界面和权限判断使用。 |
| `createdAt` / `updatedAt` | 时间戳字符串；无法确定时为 `null`。 |
| `native` | 批注是否来自源 PDF。 |
| `referenceNumber` | 可选的文档级正整数显示编号。 |
| `source` | 可选的数据来源，例如 `core`、`legacy` 或 `pdf-native`。 |
| `rendererState` | 重绘批注所需的版本化绘制数据。 |
| `typeData` | 由自定义批注类型管理的版本化 JSON。 |
| `extensions` | Core 不解释、但会校验并保留的应用 JSON。 |

## 作者与权限

每条批注都会持久化 `author`。权限策略不会写进批注数据，而是属于当前 Core 实例，并结合当前用户进行判断。

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotation: {
    currentUser: { id: 'alice', name: 'Alice' },
    permissions: { mode: 'owner-only' }
  }
})
```

使用 `owner-only` 时，Alice 可以编辑 `author.id` 为 `alice` 的批注；其他用户读取的仍是同一份批注数据，但 Core 会拒绝受保护的操作。通过 `core.annotations.setCurrentUser(user)` 可以切换当前身份。完整示例见[保存和恢复批注](./guide/persistence)。

## 绘制数据

```ts
interface KonvaRendererState {
  engine: 'konva'
  schemaVersion: 1
  serialized: string
}
```

`rendererState` 是需要持久化的数据，不是可以丢弃的缓存。应用应原样保存，由 Core 负责校验和更新；不要自行解析或修改其中序列化的 Konva 数据。

自定义批注类型暂时不可用时，Core 会保留原有数据，并显示基于 `bounds` 的安全占位图形。重新注册兼容的类型定义后，会恢复正常渲染和交互。

## 自定义类型数据与应用数据

自定义批注类型通过 `typeData` 保存自己的版本化数据：

```ts
interface AnnotationTypeData {
  schemaVersion: number
  payload: JsonValue
}
```

对应的类型定义必须声明支持该版本，并校验 `payload`。`extensions` 的用途不同：它保存通用的应用元数据，Core 只负责保留，不会解释其业务含义。

`JsonValue` 支持 `null`、布尔值、有限数字、字符串、数组和普通字符串键对象。函数、类实例、日期、Map、Set、循环引用、访问器和非有限数字都会被拒绝。

## 坐标

`konva-stage` 使用左上角为原点的未缩放坐标；`pdf-user-space` 使用 PDF 左下角原点坐标。渲染、导入、打印和导出时由 Core 负责转换，应用不要根据字段名猜测坐标系，也不要混用两个坐标系中的值。

`bounds` 使用页面单位保存，不会随查看器缩放而变化。

## 数据仓库与同步

数据仓库的读取结果和事件数据都是独立副本，修改返回的对象不会直接改变 Core 状态。需要更新批注时，应调用批注引擎或数据仓库提供的方法。

数据仓库事件只描述当前实例中的数据变化，并不是网络同步协议。应用若要支持多人协作，仍需自行定义传输、身份认证、冲突处理、顺序和重试机制。
