# Vue 接入

使用 Vue 3 和 `<script setup>` 搭建 PDF 查看器：先完成最简单的文档查看，再逐步加入页面导航、缩略图、批注工具栏和侧边栏。

## 搭建最简单的查看器

组件挂载后创建 Core 实例并加载 PDF，组件卸载时销毁实例：

::: code-group

```vue [PdfViewer.vue]
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { InkLayerInstance } from '@inklayer-dev/core'
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const props = defineProps<{ source: string }>()
const root = ref<HTMLDivElement>()
const pages = ref<HTMLDivElement>()
let core: InkLayerInstance | undefined

onMounted(async () => {
  core = await createInkLayer({
    root: root.value!,
    pageFlow: { container: pages.value!, scale: 'page-width' }
  })

  await core.load({ url: props.source })
})

onBeforeUnmount(() => {
  void core?.destroy()
})
</script>

<template>
  <div ref="root" class="pdf-viewer">
    <div ref="pages" class="pdf-pages"></div>
  </div>
</template>

<style scoped>
.pdf-viewer { height: 100vh; }
.pdf-pages { height: 100%; overflow: auto; }
</style>
```

:::

在父组件中引入 `PdfViewer`，通过 `source` 传入 PDF 地址：

::: code-group

```vue [App.vue]
<script setup lang="ts">
import PdfViewer from './PdfViewer.vue'
</script>

<template>
  <PdfViewer source="/documents/review.pdf" />
</template>
```

:::

## 添加页面导航和缩略图

通过 Page Flow 控制页面跳转和缩放。缩略图先由 Core 渲染成 Blob，再转换成图片地址：

::: code-group

```ts [PdfWorkspace.vue]
core.getPageFlow()?.scrollToPage(pageIndex)
await core.getPageFlow()?.zoomIn()

const thumbnail = await core.viewer.renderThumbnail({ pageIndex, maxWidth: 140 })
const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
```

:::

缩略图显示期间需要保留图片地址，组件卸载时调用 `URL.revokeObjectURL(thumbnailUrl)` 释放。

## 搭建批注工作区

下面是完整组件，包含上一页和下一页、缩放、缩略图、矩形批注工具以及批注列表。点击列表中的批注可以选中它，并跳转到对应页面：

::: code-group

```vue [PdfWorkspace.vue]
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Annotation, InkLayerInstance } from '@inklayer-dev/core'
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const props = defineProps<{ source: string }>()
const root = ref<HTMLDivElement>()
const pages = ref<HTMLDivElement>()
const annotations = ref<Annotation[]>([])
const thumbnails = ref<Array<{ pageIndex: number; url: string }>>([])
const currentPage = ref(0)
const pageCount = ref(0)
const zoom = ref(100)

let core: InkLayerInstance | undefined
let stop: (() => void) | undefined

onMounted(async () => {
  core = await createInkLayer({
    root: root.value!,
    pageFlow: {
      container: pages.value!,
      scale: 'page-width',
      onCurrentPageChanged: pageIndex => { currentPage.value = pageIndex },
      onScaleChanged: state => { zoom.value = state.percentage }
    }
  })

  const pdf = await core.load({ url: props.source })
  pageCount.value = pdf.numPages

  stop = core.annotations.repository.subscribe(() => {
    annotations.value = [...core!.annotations.repository.getAll()]
  })

  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const thumbnail = await core.viewer.renderThumbnail({ pageIndex, maxWidth: 140 })
    thumbnails.value.push({
      pageIndex,
      url: URL.createObjectURL(thumbnail.blob)
    })
  }
})

function goTo(pageIndex: number): void {
  if (pageIndex >= 0 && pageIndex < pageCount.value) {
    core?.getPageFlow()?.scrollToPage(pageIndex)
  }
}

function selectAnnotation(annotation: Annotation): void {
  core?.annotations.setSelection({ ids: [annotation.id] })
  goTo(annotation.pageIndex)
}

onBeforeUnmount(() => {
  stop?.()
  for (const thumbnail of thumbnails.value) URL.revokeObjectURL(thumbnail.url)
  void core?.destroy()
})
</script>

<template>
  <div ref="root" class="workspace">
    <header class="toolbar">
      <button @click="goTo(currentPage - 1)">上一页</button>
      <span>{{ currentPage + 1 }} / {{ pageCount }}</span>
      <button @click="goTo(currentPage + 1)">下一页</button>
      <button @click="core?.getPageFlow()?.zoomOut()">−</button>
      <span>{{ zoom }}%</span>
      <button @click="core?.getPageFlow()?.zoomIn()">+</button>
      <button @click="core?.annotations.setTool('select')">选择</button>
      <button @click="core?.annotations.setTool('rectangle')">矩形</button>
    </header>

    <aside class="sidebar">
      <button v-for="thumbnail in thumbnails" :key="thumbnail.pageIndex"
        @click="goTo(thumbnail.pageIndex)">
        <img :src="thumbnail.url" :alt="`第 ${thumbnail.pageIndex + 1} 页`">
      </button>
    </aside>

    <div ref="pages" class="pages"></div>

    <aside class="sidebar">
      <button v-for="annotation in annotations" :key="annotation.id"
        @click="selectAnnotation(annotation)">
        {{ annotation.type }} · 第 {{ annotation.pageIndex + 1 }} 页
      </button>
    </aside>
  </div>
</template>

<style scoped>
.workspace {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 220px;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100vh;
}
.toolbar { grid-column: 1 / -1; }
.pages, .sidebar { overflow: auto; }
.sidebar img { max-width: 100%; }
</style>
```

:::

父组件中使用 `PdfWorkspace` 的方式与前面的基础查看器相同：

::: code-group

```vue [App.vue]
<script setup lang="ts">
import PdfWorkspace from './PdfWorkspace.vue'
</script>

<template>
  <PdfWorkspace source="/documents/review.pdf" />
</template>
```

:::

文字高亮、作者权限和批注保存请分别参考[创建第一个批注](./first-annotation)与[保存和恢复批注](./persistence)。

## 订阅 Highlighter Controller

Vue 可以直接把 Controller 快照投影到 `shallowRef`，并在所属 effect scope 结束时同时释放订阅与 Controller：

```ts
const controller = createKeywordHighlighter({ viewer, annotations })
const snapshot = shallowRef(controller.getSnapshot())
const unsubscribe = controller.subscribe(next => {
  snapshot.value = next
})

watch(rules, next => controller.setRules(next), { immediate: true })
onScopeDispose(() => {
  unsubscribe()
  controller.destroy()
})
```

模板可以读取 `snapshot.status`、遍历 `snapshot.matches`，并调用与 Vanilla 或 React 完全相同的审核和应用方法。仓库中的 [Vue 消费 fixture](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/framework-consumers/vue-keyword-highlighter.ts)会经过类型检查和生产构建，同时不会把 Vue 加入 Core 的运行时依赖。
