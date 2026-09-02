---
layout: home

hero:
  name: InkLayer Core
  text: One PDF engine for every web framework
  tagline: Build your product UI. Let Core handle PDF viewing, annotations, keyword review, secure output, and export.
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
      link: 'https://core.inklayer.dev/demo/#viewer'

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
  - title: Review prepared keyword rules
    details: Batch-scan literal terms and regular expressions, preview matches by rule, review occurrences, and create permanent highlights.
    link: /guide/highlighter
  - title: Export securely redacted copies
    details: Keep matches readable while reviewing, then flatten approved coverings into a new image-only PDF with no copyable source text.
    link: /guide/keyword-redaction
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

## From keyword rules to safe output

Pass Core a prepared set of terms or regular expressions—such as contract clauses, prohibited wording, account numbers, or dates. The Highlighter scans them together, previews matches in each rule's color, and gives your application an immutable review state. Accepted matches can become permanent Highlight annotations.

When matched text is sensitive, reuse the reviewed ranges to print or export a securely redacted copy. The on-screen review remains readable and color-coded; the generated PDF uses opaque coverings and image-only pages, so it contains no source text that can be selected from beneath a black box. Image-only output also flattens all other text, links, forms, and vector content.

[Keyword Highlighter guide →](/guide/highlighter) ·
[Secure redaction guide →](/guide/keyword-redaction) ·
[Highlighter demo →](https://core.inklayer.dev/demo/#highlighter) ·
[Redaction demo →](https://core.inklayer.dev/demo/#redaction)

## Choose your next task

[Load PDF →](/guide/loading-pdfs) ·
[Create your first annotation →](/guide/first-annotation) ·
[Create your first keyword highlight →](/guide/first-keyword-highlight) ·
[Create your first keyword redaction →](/guide/first-keyword-redaction) ·
[Print and export →](/guide/output-and-security)

## Extend only when you need to

Capability plugins connect one instance to application services such as logging,
annotation storage, text input, printing, and downloads. Annotation Type
Definitions add namespaced drawing tools. However you extend it, Core retains
control of coordinates, validation, interaction, rendering, output, and cleanup.

[Build your first plugin →](/guide/capability-plugin)
