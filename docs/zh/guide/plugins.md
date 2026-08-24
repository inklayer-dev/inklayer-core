# 插件概览

插件让某个 InkLayer 实例接入你的产品环境，或者增加一种新的批注工具。插件不能替换 PDF 坐标、验证、权限等必须在所有框架中保持一致的行为。

## 选择需要的插件

| 我想要…… | 使用 | 从这里开始 |
|---|---|---|
| 把日志发送给产品日志系统 | 能力插件 | [第一个能力插件](./capability-plugin.md) |
| 把批注保存在应用拥有的 Repository | Repository Capability | [保存和恢复批注](./persistence.md) |
| 替换 FreeText 编辑器、打印、下载、Fetch、时钟、ID 或缩略图 surface | 内置 Capability factory | [第一个能力插件](./capability-plugin.md) |
| 引擎就绪后运行产品行为 | 使用 `onReady()` 的自定义 Capability | [生命周期与服务](./plugin-lifecycle.md) |
| 增加新的持久化绘制工具 | Annotation Type Definition | [自定义批注类型](./custom-annotation-type.md) |
| 修改工具栏布局、图标、对话框或面板 | 框架 UI，不是 Core 插件 | [框架接入](./framework-integration.md) |

## 两种扩展方式

### 能力插件

Capability 是实例级环境服务或产品集成插件。常见服务已经提供 factory，多数应用不需要自己编写生命周期代码：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [
    createLoggerCapability(appLogger),
    createAnnotationRepositoryCapability(repository),
    createTextInputCapability(textInput)
  ]
})
```

Capability 只影响当前实例，并随实例一起清理。

### 批注类型插件

Annotation Type Definition 会增加 `custom:acme/review-area` 这样的命名空间工具。它声明工具如何创建、支持哪些外观和变换控件、渲染什么受控场景，以及如何进入 PDF 输出。

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotationTypes: [reviewArea]
})

core.annotations.setTool('custom:acme/review-area')
```

指针输入、验证、命中测试、变换、持久化、打印、导出和清理仍由 Core 负责。插件不会得到 Konva 或 PDF.js 私有对象。

## 插件属于实例

两个 Viewer 可以安装不同插件，不共享 Registry 或可变状态。安装失败时，`createInkLayer()` 会先回滚已经创建的插件资源，再返回错误。

16 种内置批注在内部使用同一套 Definition 模型，但它们属于受保护的 Core 行为，不能被替换或注销。

接下来阅读[第一个能力插件](./capability-plugin.md)或[自定义批注类型](./custom-annotation-type.md)。
