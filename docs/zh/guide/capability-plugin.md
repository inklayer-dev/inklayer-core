# 第一个能力插件

能力插件把一个 InkLayer 实例连接到环境服务或产品行为。优先使用现成 factory；只有 factory 无法覆盖集成时，才编写自定义 Capability。

## 把诊断发送到产品日志

```ts
import {
  createInkLayer,
  createLoggerCapability
} from '@inklayer-dev/core/capabilities'

const appLogger = {
  warn(message: string, context?: unknown) {
    console.warn('[PDF]', message, context)
  },
  error(message: string, context?: unknown) {
    console.error('[PDF]', message, context)
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [createLoggerCapability(appLogger)]
})
```

这就是完整的 Logger 插件配置。它只作用于 `core`，另一个实例可以使用另一套 Logger。

## 提供由产品拥有的批注数据

```ts
import { createMemoryAnnotationRepository } from '@inklayer-dev/core'
import { createAnnotationRepositoryCapability } from '@inklayer-dev/core/capabilities'

const repository = createMemoryAnnotationRepository()
const repositoryPlugin = createAnnotationRepositoryCapability(repository)
```

把 `repositoryPlugin` 放进同一个 `capabilities` 数组。默认采用 borrowed 所有权，因此 Viewer 卸载后应用仍可复用 Repository。详见[保存和恢复批注](./persistence.md)。

## 其他现成能力插件

```ts
const capabilities = [
  createTextInputCapability(textInputProvider),
  createPrintCapability(printProvider),
  createDownloadCapability(downloadProvider),
  createFetchCapability(fetchImplementation),
  createClockCapability(clock),
  createIdGeneratorCapability(idGenerator),
  createThumbnailSurfaceCapability(thumbnailSurfaceProvider)
]
```

它们是明确、可测试的实例配置，不是全局配置。

## 编写一个小型自定义插件

集成需要使用已经创建好的引擎时，通过 `onReady()` 安装：

```ts
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const escapeToSelect: InkLayerCapability = {
  id: 'acme:escape-to-select',
  setup(context) {
    context.onReady(({ annotations }) => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') annotations.setTool('select')
      }
      context.root.addEventListener('keydown', onKeyDown)
      return () => context.root.removeEventListener('keydown', onKeyDown)
    })
  }
}
```

返回的清理函数会自动执行。继续阅读[生命周期与服务](./plugin-lifecycle.md)，了解安装顺序、服务冲突、回滚和所有权。
