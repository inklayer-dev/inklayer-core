# Vue integration

Build a PDF Viewer with Vue 3 and `<script setup>`. Start with the smallest useful component, then add page navigation, thumbnails, an annotation toolbar, and a sidebar.

## Start with a minimal Viewer

Create Core after the component mounts, load a PDF, and destroy the instance when the component unmounts:

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

Use the component from its parent and pass the PDF URL through `source`:

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

## Add navigation and thumbnails

Use Page Flow to navigate and zoom. Render a thumbnail as a blob, then create an image URL for it:

::: code-group

```ts [PdfWorkspace.vue]
core.getPageFlow()?.scrollToPage(pageIndex)
await core.getPageFlow()?.zoomIn()

const thumbnail = await core.viewer.renderThumbnail({ pageIndex, maxWidth: 140 })
const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
```

:::

Keep the URL while the thumbnail is displayed. Call `URL.revokeObjectURL(thumbnailUrl)` when the component unmounts.

## Build an annotation workspace

The complete component below adds previous/next buttons, zoom controls, thumbnails, a rectangle tool, and an annotation list. Clicking an annotation selects it and opens its page:

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
      <button @click="goTo(currentPage - 1)">Previous</button>
      <span>{{ currentPage + 1 }} / {{ pageCount }}</span>
      <button @click="goTo(currentPage + 1)">Next</button>
      <button @click="core?.getPageFlow()?.zoomOut()">−</button>
      <span>{{ zoom }}%</span>
      <button @click="core?.getPageFlow()?.zoomIn()">+</button>
      <button @click="core?.annotations.setTool('select')">Select</button>
      <button @click="core?.annotations.setTool('rectangle')">Rectangle</button>
    </header>

    <aside class="sidebar">
      <button v-for="thumbnail in thumbnails" :key="thumbnail.pageIndex"
        @click="goTo(thumbnail.pageIndex)">
        <img :src="thumbnail.url" :alt="`Page ${thumbnail.pageIndex + 1}`">
      </button>
    </aside>

    <div ref="pages" class="pages"></div>

    <aside class="sidebar">
      <button v-for="annotation in annotations" :key="annotation.id"
        @click="selectAnnotation(annotation)">
        {{ annotation.type }} · Page {{ annotation.pageIndex + 1 }}
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

The parent uses `PdfWorkspace` in the same way as the minimal component:

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

For text highlights, author permissions, and saving annotations, continue with [Create your first annotation](./first-annotation) and [Persist annotations](./persistence).

## Subscribe to the Highlighter Controller

Vue can project Controller snapshots into a `shallowRef` directly. Dispose both the subscription and Controller with the owning effect scope:

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

Templates can read `snapshot.status`, iterate over `snapshot.matches`, and call the same review and application methods as Vanilla or React. The maintained [Vue consumption fixture](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/framework-consumers/vue-keyword-highlighter.ts) is type-checked and production-built without adding Vue to Core's runtime dependencies.
