# 规范数据模型

`Annotation` schema version 1 是唯一用于持久化和协作的数据模型。

## 必备语义

- `id` 在文档内稳定且唯一。
- `pageIndex` 从 0 开始。
- `type` 是 16 种受保护内置类型之一，或受长度限制的 `custom:<namespace>/<name>`；`select` 不会持久化。
- `bounds` 有限、轴对齐且非负。
- `coordinateSpace` 明确为 `konva-stage` 或 `pdf-user-space`。
- `comments`、`author`、`createdAt`、`native` 和 `rendererState` 是一等字段。
- `referenceNumber` 是可选的文档级正整数显示编号。
- `source` 记录 `core`、`legacy` 或 `pdf-native` 来源。
- `typeData` 可保存由 Definition 拥有、独立版本化的无损 JSON 语义。
- `extensions` 保存经过验证的应用通用 JSON 元数据。

## 渲染器状态

```ts
interface KonvaRendererState {
  engine: 'konva'
  schemaVersion: 1
  serialized: string
}
```

对于内置类型，它不是可丢弃缓存，而是精确的重绘表示。加载、创建、变换、导入和导出都使用同一个快照解析器。受保护的 Definition 标识 Core 私有渲染策略；构建、样式更新、内容同步、命中测试和变换都会先解析 Definition 元数据，再进入优化的快照辅助路径。

解析器限制字符串长度、深度、节点数、点数和 data URL；只接受已验证的类与有限属性，拒绝原型链危险键，并校验根 Group ID 与批注 ID 一致。

当自定义 Definition 缺失或不支持保存的 `typeData.schemaVersion` 时，`rendererState` 只作为不透明数据保留，不会交给 Konva。Core 显示基于公共 bounds 的安全占位符；兼容实现恢复后，再从规范数据构建受控场景。

## 类型自有 JSON

```ts
interface AnnotationTypeData {
  schemaVersion: number
  payload: JsonValue
}
```

`JsonValue` 只接受 null、布尔值、有限数字、字符串、数组和普通字符串键对象。Core 限制深度、值总数、字符串和键，并拒绝函数、undefined、symbol、类实例、Date、Map、Set、循环引用、访问器、不可枚举字段、危险原型键和非有限数字。信封解析不依赖插件是否存在。

通过指针创建自定义批注时，Definition 可以从规范化的页面空间手势几何生成初始 `typeData`。Core 只有在信封和 codec 验证通过后才持久化。纯变换 reducer 可以同时替换 bounds 与 `typeData`，让语义尺寸等领域值保持同步，而不把渲染器快照当成源数据。

## 坐标

旧数据和实时 Painter bounds 使用未缩放、左上角为原点的 Stage 坐标；原生 PDF 字典使用左下角为原点的 PDF user space。统一几何函数负责点、矩形、page box、与缩放无关的 bounds，以及 0/90/180/270 度旋转转换。任何格式都不能通过字段名猜测坐标系。

## 协作

评论和引用使用稳定 ID 与可读标签。同步引用标签时可以重新编号可见的 `#N`，但不能丢失目标 ID。权限使用统一的动作词汇和模式/回调合约。评论和状态变更必须保留精确渲染器状态。

所有运行时入口都会分离已验证值；Repository getter 和事件不会暴露可变的内部集合。
