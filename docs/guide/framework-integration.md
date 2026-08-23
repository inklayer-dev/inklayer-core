# Framework integration

The adapter pattern is the same in React, Vue, Svelte, Angular, Web Components,
and plain TypeScript: create one Core instance after the host DOM exists,
translate typed Core events into framework state, call imperative commands from
UI actions, and destroy the instance before the host DOM is removed.

## Ownership boundary

| Core owns | Your framework owns |
|---|---|
| PDF loading, Worker, Range, password lifecycle | File picker, password dialog, loading presentation |
| Page rendering, scale, navigation, page flow | Toolbar, page number field, scrollbar styling |
| TextLayer extraction, selection, search highlights | Search box, results list, contextual markup menu |
| Annotation hit testing, drawing, transforms, keyboard behavior | Tool palette, appearance inspector, comments panel |
| Canonical repository and typed events | Server persistence, user/session state, routing |
| Print/export byte composition and watermark policy | Print/export buttons, filenames, uploads |

Never mount framework children inside elements currently owned by PDF.js,
TextLayer, Page Flow, or the Annotation Engine. Give Core stable empty host
elements and render product UI around them.

## Adapter lifecycle

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

Framework rules:

1. Create the instance after the root is mounted, never during SSR or render.
2. Keep the instance in a ref/non-reactive field; do not proxy engine objects.
3. Derive framework state from detached snapshots and typed events.
4. Do not rebuild the instance for ordinary prop changes; call Core commands.
5. Dispose subscriptions before destroying the instance.
6. Await `destroy()` before reusing or removing an owned host when practical.

## React shape

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

For a production adapter, keep creation tied to mount and call `core.load(source)`
from a separate source effect so changing documents does not recreate engines.

## Vue shape

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

The same lifecycle maps directly to Svelte `onMount`, Angular
`AfterViewInit`/`OnDestroy`, a Web Component's
`connectedCallback`/`disconnectedCallback`, or any host with mount/unmount hooks.

## Translating state without duplicating behavior

Framework state should describe presentation, not reimplement Core algorithms.
For example, a search component stores the query, result list, active result,
and whether its panel is open. It calls `viewer.search()`, passes matches to
`viewer.setSearchHighlights()`, and calls `viewer.goToPage()` for navigation.
It must not extract or normalize PDF text itself.

Likewise, an annotation toolbar stores which button is selected and calls
`annotations.setTool()`. It uses `getAppearanceCapabilities()` to decide which
controls to render and calls `setToolAppearance()` or `updateAppearance()`; it
does not construct Konva nodes.

## Persistence

The `AnnotationRepository` is the application data boundary. Subscribe to
repository events and persist canonical annotations using your own HTTP,
database, or synchronization policy. Load remote data through repository
commands after validation. Do not persist engine snapshots, DOM geometry, Konva
nodes, framework state, search highlights, hover, or selection.

## Multiple viewers

Multiple instances are supported and isolated, but most products need one
instance per visible document workspace. Never share an instance across two DOM
roots. Share server data through repositories or application state instead.
