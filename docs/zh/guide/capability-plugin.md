# 能力插件

能力插件（Capability）用于把一个 Core 实例接到应用提供的服务上。Core 知道**什么时候**需要某项服务，例如创建自由文本批注时需要输入文字，加载 PDF 时需要发送网络请求；应用则负责决定这项工作**具体怎么完成**。

可以把调用过程理解为：

`Core 需要某项服务 → 调用已注册的 Provider → 应用完成具体操作`

创建实例时，通过 `capabilities` 安装插件：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createLoggerCapability(appLogger)]
})
```

> [!IMPORTANT] 能力插件不会创建应用界面
> 安装能力插件不会自动添加工具栏按钮、对话框或侧边栏。界面仍由应用渲染，何时响应用户操作也由应用决定。能力插件只是为当前 Core 实例提供一项服务或一段可复用的行为。

## 内置能力插件分别有什么用

如果 Core 默认的浏览器实现不符合要求，或者希望 Core 和其他插件使用同一项应用服务，可以选择对应的内置创建函数。

### Core 会自动使用的服务

安装以下能力插件后，查看器或批注引擎会在需要时自动使用对应服务：

| 创建函数 | 适用场景 | 安装后的作用 |
| --- | --- | --- |
| `createLoggerCapability()` | 把警告和监听器错误交给应用日志或监控平台 | Core 会通过传入的日志服务报告相关警告和错误 |
| `createAnnotationRepositoryCapability()` | 使用应用持有的批注数据仓库，或者在多个 Core 实例之间复用它 | 批注引擎会读写这个数据仓库；把数据保存到服务端仍由应用负责 |
| `createTextInputCapability()` | 用 React/Vue 对话框或自定义编辑器替换 Core 的浏览器文字编辑器 | 用户创建或编辑自由文本、便签批注时，Core 会向 Provider 请求文字 |
| `createFetchCapability()` | 为请求添加鉴权、复用应用的 HTTP 客户端，或者通过代理加载 PDF | 查看器会用传入的 `fetch` 实现发送 URL 请求和分段请求 |
| `createClockCapability()` | 需要由应用控制时间戳，或在测试中使用固定时间 | 批注引擎写入批注和评论时间时会使用传入的时钟 |
| `createIdGeneratorCapability()` | 批注 ID 需要符合应用或服务端的生成规则 | 批注引擎会用传入的生成器创建批注、评论等记录的 ID |
| `createThumbnailSurfaceCapability()` | 非标准运行环境或测试环境需要提供自定义画布 | 调用 `renderThumbnail()` 时，查看器会用它创建并编码缩略图画布 |

不安装这些插件，也可以使用 Core 对应的功能。在浏览器环境中，Core 已尽可能提供默认实现；只有需要替换默认行为或由应用接管时才需要安装。

### 需要应用主动调用的服务

`createPrintCapability()` 和 `createDownloadCapability()` 有所不同：安装后，打印或下载服务会注册到当前实例，但 Core 不会自动调用它们。

| 创建函数 | 适用场景 | 应用仍需完成的工作 |
| --- | --- | --- |
| `createPrintCapability()` | 浏览器、Electron、WebView 等运行环境需要各自的打印实现 | 先生成可打印的 PDF 内容，再由打印按钮或命令调用 `print()` |
| `createDownloadCapability()` | 需要使用系统文件选择器、原生保存接口或应用自己的下载规则 | 先生成待保存的内容和文件名，再由下载按钮或命令调用 `download()` |

例如，打印按钮可以取得当前实例注册的打印服务并主动调用：

```ts
import {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  createInkLayer,
  createPrintCapability
} from '@inklayer-dev/core/capabilities'
import { createBrowserPrintProvider } from '@inklayer-dev/core'
import { buildPrintablePdf } from '@inklayer-dev/core/export/pdf'

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createPrintCapability(createBrowserPrintProvider())]
})

printButton.onclick = async () => {
  const printablePdf = await buildPrintablePdf(
    sourceBytes,
    core.annotations.repository.getAll(),
    { annotationTypes: core.annotationTypes }
  )
  const print = core.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.print)
  await print?.print({ content: printablePdf })
}
```

`sourceBytes` 是应用保留的原始 PDF 字节。如果只有一个模块使用 Provider，而且已经直接持有它，就可以直接调用，不必再安装为能力插件。只有当多个应用模块或自定义插件需要取得同一个实例服务时，注册到 `capabilities` 才有意义。其他输出方式见[打印、导出与水印](./output-and-security)。

## 示例：接入应用日志

`createLoggerCapability()` 会把 Core 的警告和监听器错误交给应用提供的日志服务：

::: code-group

```ts [main.ts]
import { createInkLayer, createLoggerCapability } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const appLogger = {
  warn(message: string) {
    console.warn('[PDF]', message)
  },
  error(message: string, cause?: unknown) {
    console.error('[PDF]', message, cause)
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createLoggerCapability(appLogger)]
})

await core.load({ url: '/documents/review.pdf' })
```

:::

这项日志服务只作用于当前 Core 实例。如果输出到浏览器控制台已经够用，可以直接使用 `createLoggerCapability(console)`。

## 示例：替换文字编辑器

Core 默认使用内置的浏览器文字编辑器处理自由文本和便签批注。应用也可以把它替换成自己的对话框或组件：

```ts
import type { TextInputProvider } from '@inklayer-dev/core'
import { createTextInputCapability } from '@inklayer-dev/core/capabilities'

const textInput: TextInputProvider = {
  async requestText(request) {
    const value = await openTextDialog({
      initialValue: request.initialValue ?? '',
      signal: request.signal
    })
    return { value }
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createTextInputCapability(textInput)]
})
```

这里的 `openTextDialog()` 代表由应用实现的对话框。用户激活自由文本或便签工具并点击页面后，Core 会调用 `requestText()`；Provider 返回的文字会写入批注，返回 `null` 则取消本次编辑。

## 示例：复用批注数据仓库

如果希望批注数据不受 Core 实例生命周期影响，可以先创建数据仓库，再通过能力插件接入：

```ts
import { createMemoryAnnotationRepository } from '@inklayer-dev/core'
import { createAnnotationRepositoryCapability } from '@inklayer-dev/core/capabilities'

const repository = createMemoryAnnotationRepository()

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createAnnotationRepositoryCapability(repository)]
})

await core.destroy()

console.log(repository.getAll())
```

默认情况下，Core 只借用这个数据仓库，销毁实例时不会销毁它。只有希望由 Core 负责销毁时，才传入 `{ ownership: 'owned' }`。能力插件本身不会把批注保存到服务端；如何订阅变更并保存可序列化数据，见[保存和恢复批注](./persistence)。

## 什么时候需要自定义能力插件

如果一段接入逻辑需要随 Core 实例创建和销毁，而且没有对应的内置创建函数，可以把它封装成自定义能力插件。例如，下面的插件会在文档加载完成后，把页数交给应用：

::: code-group

```ts [document-loaded.ts]
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

export function createDocumentLoadedCapability(
  onLoaded: (pageCount: number) => void
): InkLayerCapability {
  return {
    id: 'acme:document-loaded',
    setup(context) {
      context.onReady(({ viewer }) => {
        return viewer.subscribe(event => {
          if (event.type === 'documentLoaded') {
            onLoaded(event.document.numPages)
          }
        })
      })
    }
  }
}
```

```ts [main.ts]
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import { createDocumentLoadedCapability } from './document-loaded'

const pageCount = document.querySelector<HTMLOutputElement>('#page-count')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [
    createDocumentLoadedCapability(count => {
      pageCount.textContent = `${count} 页`
    })
  ]
})
```

:::

`onReady()` 会在查看器和批注引擎创建完成后执行。插件返回了 `viewer.subscribe()` 提供的取消订阅函数，因此调用 `core.destroy()` 时，Core 会自动清理这项订阅。

安装顺序、服务共享和资源清理规则见[插件生命周期与服务](./plugin-lifecycle)。
