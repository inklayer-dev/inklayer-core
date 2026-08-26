# 插件概览

InkLayer 提供两种扩展方式：为 Core 实例接入应用服务，或者增加新的批注类型。具体选择哪一种，取决于你想扩展的内容。

## 接入应用服务

能力插件（Capability）用于接入应用提供的服务，例如日志、批注数据仓库、文字输入或下载处理。

下面的配置会把 Core 的诊断信息输出到浏览器控制台：

```ts
import { createInkLayer, createLoggerCapability } from '@inklayer-dev/core/capabilities'

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createLoggerCapability(console)]
})
```

这个日志服务只作用于当前 Core 实例。另一个查看器可以使用不同的日志服务，也可以不安装该插件。

现成能力插件的使用方法，以及自定义能力插件的写法，见[创建能力插件](./capability-plugin)。

## 增加批注类型

自定义批注类型可以增加新的绘制工具，例如评审区域或测量框。类型定义会描述批注如何创建、渲染、保存、打印和导出。

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotationTypes: [reviewArea]
})

core.annotations.setTool('custom:acme/review-area')
```

指针交互、选中、权限、持久化和 PDF 输出仍由 Core 负责。类型定义只描述批注本身，不直接操作 Konva 或 PDF.js 的内部对象。

包含自定义数据的完整绘制工具示例，见[创建自定义批注类型](./custom-annotation-type)。

## 了解扩展边界

插件只属于当前 Core 实例，不会与其他实例共享服务或批注类型；实例销毁时，插件占用的资源也会一并释放。

16 种内置批注类型不能被替换或移除。工具栏、按钮、对话框和侧边栏属于应用界面，不属于插件系统；相关实现见[框架接入](./framework-integration)。

安装顺序、服务共享、资源清理和初始化失败处理见[插件生命周期与服务](./plugin-lifecycle)。
