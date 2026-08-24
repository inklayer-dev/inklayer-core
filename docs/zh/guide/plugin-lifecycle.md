# 插件生命周期与服务

请在安装过基础 Capability 后阅读本页。这里解释插件代码何时运行、插件如何共享服务，以及安装失败时为什么仍能可靠清理。

## 在引擎之前安装

`setup(context)` 会在 Viewer 和 Annotation Engine 创建前按数组顺序运行。可用于提供服务、消费更早的服务、注册自定义批注类型，或把自有清理加入插件生命周期。

```ts
const plugin: InkLayerCapability = {
  id: 'acme:feature',
  setup(context) {
    const resource = createResource()
    context.lifecycle.add(() => resource.destroy(), 'feature-resource')
  }
}
```

不要在 setup 中访问 Viewer 或 Annotation Engine，因为它们此时还不存在。

## 在引擎就绪后运行

```ts
setup(context) {
  context.onReady(({ viewer, annotations }) => {
    const stop = viewer.subscribe(handleViewerEvent)
    annotations.setCurrentUser(currentUser)
    return stop
  })
}
```

ready effect 按 Capability 顺序运行。任一失败都会让 `createInkLayer()` 失败并回滚完整实例。

## 提供和消费服务

```ts
setup(context) {
  context.provide('acme:review-policy', reviewPolicy)
}
```

后面的 Capability 可以读取它：

```ts
setup(context) {
  const policy = context.get<ReviewPolicy>('acme:review-policy')
}
```

Capability ID 和单 Provider service key 在一个实例内必须唯一。重复占用会明确失败，不会因为加载顺序不同而悄悄改变行为。

## 清理顺序

Capability 按数组顺序安装、按相反顺序销毁。Core 会先取消新工作，单个 disposer 失败后继续清理，并把清理失败聚合成结构化错误。返回的清理函数和 `context.lifecycle.add()` 都由实例幂等管理。

Core 不销毁借用服务，但插件创建的订阅或监听仍由插件清理。Repository Capability 默认 borrowed，也可以明确设置为 `owned`。

## 保持插件隔离

不要把 Registry、服务、监听器或当前引擎放入模块级可变全局状态。通过实例 context 安装，才能让同时运行的 Viewer、销毁、测试和未来框架适配器彼此独立。

完整 service key 和类型化 factory 见[公开 API：Composition Root 与 Capabilities](../api.md#composition-root-与-capabilities)。
