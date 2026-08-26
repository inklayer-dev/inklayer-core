# 插件生命周期与服务

能力插件分两个阶段运行：`setup()` 在 Core 创建引擎之前执行，`onReady()` 在引擎创建完成后执行。区分这两个阶段，才能在合适的时机注册服务、订阅事件和清理资源。

## 在引擎创建前执行 setup

`setup(context)` 会按照插件在 `capabilities` 数组中的顺序执行。它适合注册服务、注册批注类型，或绑定不依赖查看器和批注引擎的资源：

```ts
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const resizePlugin: InkLayerCapability = {
  id: 'acme:resize-listener',
  setup(context) {
    function onResize() {
      console.log('Viewer container resized')
    }

    window.addEventListener('resize', onResize)

    context.lifecycle.add(() => {
      window.removeEventListener('resize', onResize)
    })
  }
}
```

`context.lifecycle.add()` 用于登记当前实例的清理操作。不要在 `setup()` 中访问 `viewer` 或 `annotations`，因为这时两个引擎尚未创建。

## 在引擎创建后执行 onReady

需要使用查看器或批注引擎时，通过 `context.onReady()` 注册回调。直接返回取消订阅函数，Core 会在实例销毁时自动执行：

```ts
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const progressPlugin: InkLayerCapability = {
  id: 'acme:load-progress',
  setup(context) {
    context.onReady(({ viewer }) => {
      return viewer.subscribe(event => {
        if (event.type === 'loadProgress') {
          console.log('PDF loading:', event.progress.percentage)
        }
      })
    })
  }
}
```

`onReady()` 回调同样按插件顺序执行。如果其中一个回调失败，`createInkLayer()` 会终止创建，并释放此前已经安装的资源。

## 在插件之间共享服务

一个插件可以提供当前实例专用的服务，后面的插件再读取它。提供服务的插件必须排在 `capabilities` 数组前面：

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const reviewPolicy = { mode: 'internal' }

const providePolicy: InkLayerCapability = {
  id: 'acme:provide-policy',
  setup(context) {
    context.provide('acme:review-policy', reviewPolicy)
  }
}

const usePolicy: InkLayerCapability = {
  id: 'acme:use-policy',
  setup(context) {
    const policy = context.get<typeof reviewPolicy>('acme:review-policy')
    if (!policy) throw new Error('Review policy is not installed')

    context.root.dataset.reviewMode = policy.mode
    return () => { delete context.root.dataset.reviewMode }
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [providePolicy, usePolicy]
})
```

插件 ID 和服务名称在同一个实例内必须唯一。重复注册时会直接报错，不会悄悄覆盖之前的插件或服务。

## 在实例销毁时清理资源

插件按照数组顺序安装，并按照相反顺序清理：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [providePolicy, usePolicy]
})

await core.destroy()
```

这里会先清理 `usePolicy`，再清理 `providePolicy`。`setup()` 或 `onReady()` 返回的清理函数，以及通过 `context.lifecycle.add()` 登记的操作，都会自动执行；其中某一项失败时，Core 仍会继续清理其他资源。

通过 `createAnnotationRepositoryCapability(repository)` 接入的批注数据仓库默认只由 Core 借用，调用 `core.destroy()` 后仍然可用。传入 `{ ownership: 'owned' }` 后，则会随 Core 实例一起销毁。

## 保持实例之间相互独立

不要把某个实例的服务、事件监听、批注类型注册表或引擎存放在共享的模块级变量中。通过插件上下文安装这些资源，多个查看器才能独立运行和销毁。

全部内置服务名称和创建函数见[公开 API：Composition Root 与 Capabilities](../api#composition-root-与-capabilities)。
