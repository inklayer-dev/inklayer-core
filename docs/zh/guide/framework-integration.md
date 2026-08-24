# 框架接入

React、Vue、Svelte、Angular、Web Components 和原生 TypeScript 使用同一种适配器模式：宿主 DOM 存在后创建一个 Core 实例，把类型化 Core 事件转成框架状态，由 UI 操作调用命令式方法，并在移除宿主 DOM 前销毁实例。

## 所有权边界

| Core 负责 | 框架负责 |
|---|---|
| PDF 加载、Worker、Range、密码生命周期 | 文件选择器、密码框、加载状态展示 |
| 页面渲染、缩放、导航、页面流 | 工具栏、页码输入、滚动条样式 |
| TextLayer 提取、选择、搜索高亮 | 搜索框、结果列表、文字批注上下文菜单 |
| 批注明中、绘制、变换、键盘行为 | 工具面板、外观检查器、评论面板 |
| 规范 Repository 与类型化事件 | 服务端持久化、用户/会话状态、路由 |
| 打印/导出字节合成与水印策略 | 打印/导出按钮、文件名、上传 |

不要在 PDF.js、TextLayer、Page Flow 或 Annotation Engine 当前拥有的元素内挂载框架子节点。应向 Core 提供稳定的空宿主元素，并把产品 UI 渲染在其周围。

## 适配器生命周期

```ts
import type { InkLayerInstance, PdfViewerEvent } from '@inklayer-dev/core'
import { createInkLayer } from '@inklayer-dev/core/capabilities'

export async function mountPdfAdapter(
  root: HTMLElement,
  emit: (event: PdfViewerEvent) => void
) {
  const core = await createInkLayer({ root })
  const unsubscribe = core.viewer.subscribe(emit)

  return {
    core,
    async destroy() {
      unsubscribe()
      await core.destroy()
    }
  }
}
```

框架规则：

1. 只在 root 挂载后创建实例，不能在 SSR 或渲染阶段创建。
2. 把实例放在 ref/非响应式字段中，不要代理引擎对象。
3. 从分离快照和类型化事件派生框架状态。
4. 普通 prop 变化不要重建实例，调用 Core 命令。
5. 销毁实例前先清理订阅。
6. 条件允许时，在复用或移除宿主前等待 `destroy()` 完成。

## React 结构

```tsx
function PdfWorkspace({ source }: { source: PdfSource }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<InkLayerInstance | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      const root = rootRef.current
      if (!root) return
      const core = await createInkLayer({ root })
      if (controller.signal.aborted) return void core.destroy()
      coreRef.current = core
      await core.load(source)
    })()

    return () => {
      controller.abort()
      const core = coreRef.current
      coreRef.current = null
      if (core) void core.destroy()
    }
  }, [source])

  return <div ref={rootRef} className="pdf-workspace" />
}
```

生产适配器应让实例创建只与 mount 绑定，并在单独的 source effect 中调用 `core.load(source)`，这样切换文档不会重建引擎。

## Vue 结构

```ts
const root = ref<HTMLElement>()
let core: InkLayerInstance | undefined

onMounted(async () => {
  core = await createInkLayer({ root: root.value! })
  await core.load(props.source)
})

watch(() => props.source, source => core?.load(source))

onBeforeUnmount(() => {
  const instance = core
  core = undefined
  if (instance) void instance.destroy()
})
```

同一生命周期可以直接映射到 Svelte `onMount`、Angular `AfterViewInit`/`OnDestroy`、Web Component 的 `connectedCallback`/`disconnectedCallback`，或任何具有 mount/unmount hook 的宿主。

## 转换状态，但不复制行为

框架状态应描述表现，不能重写 Core 算法。例如搜索组件保存查询、结果列表、当前结果和面板开关；它调用 `viewer.search()`、把匹配传给 `viewer.setSearchHighlights()`，并用 `viewer.goToPage()` 导航，不能自行提取或归一化 PDF 文本。

同理，批注工具栏保存选中的按钮并调用 `annotations.setTool()`；通过 `getAppearanceCapabilities()` 决定显示哪些控件，再调用 `setToolAppearance()` 或 `updateAppearance()`，不能构建 Konva 节点。

## 持久化

`AnnotationRepository` 是应用数据边界。订阅 Repository 事件，并用自己的 HTTP、数据库或同步策略保存规范批注。远端数据验证后通过 Repository 命令加载。不要持久化引擎快照、DOM 几何、Konva 节点、框架状态、搜索高亮、hover 或 selection。

## 多 Viewer

多个实例相互隔离且受支持，但多数产品每个可见文档工作区只需要一个实例。不要让一个实例跨两个 DOM root；如需共享服务端数据，应通过 Repository 或应用状态共享。
