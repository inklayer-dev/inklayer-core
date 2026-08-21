---
layout: home

hero:
  name: InkLayer Core
  text: One PDF engine for every web framework
  tagline: Framework-independent PDF viewing, text selection, annotations, page flow, print, and export—built on PDF.js and Konva.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Read the API
      link: /api

features:
  - title: Framework-independent
    details: Use the same imperative engines from React, Vue, Svelte, Angular, Web Components, or plain TypeScript.
  - title: Complete document behavior
    details: Loading, Range requests, passwords, search, selection, page flow, zoom, watermarks, print, and export live in Core.
  - title: Extensible annotations
    details: Sixteen built-in types plus instance-scoped custom definitions, controlled rendering, canonical persistence, and PDF output.
  - title: Production lifecycle
    details: Instance ownership, cancellation, structured errors, deterministic disposal, SSR-safe imports, and a bundled PDF.js Worker.
---

## Core owns behavior; your framework owns presentation

InkLayer Core does not render a product toolbar, sidebar, dialog, or application
route. It provides the document engines and normalized state needed to build
those interfaces once in the framework you already use.

```ts
import { createInkLayer } from 'inklayer-core/capabilities'
import 'inklayer-core/style'

const core = await createInkLayer({ root: workspaceElement })
await core.load({ url: '/documents/review.pdf', range: 'auto' })

const stop = core.viewer.subscribe(event => {
  if (event.type === 'loadProgress') updateLoadingUI(event.progress)
})

// Framework unmount
stop()
await core.destroy()
```

[Learn the integration boundary →](/guide/framework-integration)
