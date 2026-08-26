---
layout: home

hero:
  name: InkLayer Core
  text: One PDF engine for every web framework
  tagline: Build your product UI. Let Core handle PDF viewing, annotations, page rendering, print, and export.
  image:
    light: /hero-engine.svg
    dark: /hero-engine-dark.svg
    alt: PDF document with a text highlight and a selected freehand annotation.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api
    - theme: alt
      text: Live demo
      link: 'https://inklayer-dev.github.io/inklayer-core/demo/'

features:
  - title: Use your framework of choice
    details: Use the same Core API in React, Vue, Svelte, Angular, Web Components, or plain TypeScript.
    link: /guide/framework-integration
  - title: Core handles PDF behavior
    details: Viewing, annotations, zoom, search, watermarks, print, and export live in Core, while your application controls the interface and workflow.
    link: /guide/viewer-and-pages
  - title: Annotations built in and extensible
    details: Start with sixteen types for highlights, text, shapes, signatures, and more, then define your own tools when needed.
    link: /guide/plugins
  - title: Controlled from mount to teardown
    details: Cancel in-progress loads, destroy instances cleanly, run isolated viewers side by side, and import Core safely during SSR.
    link: /error-recovery
---

## Start with Core

Install Core, provide two host elements, give the scroll container an explicit size, and load a PDF.

```bash
npm install @inklayer-dev/core
```

```html
<div id="pdf-workspace">
  <div id="pages"></div>
</div>
```

```css
html, body, #pdf-workspace {
  height: 100%;
  margin: 0;
}

#pages {
  height: 100%;
  overflow: auto;
  background: #f2f4f7;
}
```

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})
await core.load({ url: '/documents/review.pdf', range: 'auto' })
```

[Getting started →](/guide/getting-started)

> [!IMPORTANT] NOTE
> InkLayer Core is headless: it owns PDF and annotation behavior while your framework owns the toolbar, panels, and workflow.

## Choose your next task

[Load PDF →](/guide/loading-pdfs) ·
[Create your first annotation →](/guide/first-annotation) ·
[Print and export →](/guide/output-and-security)

## Extend only when you need to

Capability plugins connect one instance to application services such as logging,
annotation storage, text input, printing, and downloads. Annotation Type
Definitions add namespaced drawing tools. However you extend it, Core retains
control of coordinates, validation, interaction, rendering, output, and cleanup.

[Build your first plugin →](/guide/capability-plugin)
