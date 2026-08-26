# Custom annotation types

This page adds a purple “Review area” tool. Users click a toolbar button, drag a rectangle on the PDF, and receive a normal annotation that supports selection, resizing, saving, printing, and PDF export.

## Define the annotation

A custom type needs a stable ID, interaction capabilities, default appearance, creation behavior, and a renderer. This example also saves application-specific data in `typeData`:

::: code-group

```ts [review-area.ts]
import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

export const reviewArea: AnnotationTypeDefinition = {
  type: 'custom:acme/review-area',
  apiVersion: 1,
  geometry: 'box',

  data: {
    supportedSchemaVersions: [1],
    validate(payload) {
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('Review area data must be an object')
      }
    }
  },

  capabilities: {
    creation: 'drag-box',
    creationMode: 'one-shot',
    transform: {
      move: true,
      resize: true,
      rotate: false,
      endpoints: false,
      vertices: false
    },
    appearance: { opacity: true, stroke: true, fill: true, text: false },
    comments: true,
    printable: true,
    exportable: true
  },

  appearance: {
    defaults: {
      opacity: 1,
      stroke: {
        color: '#7c3aed',
        width: 2,
        opacity: 1,
        dash: [],
        dashOffset: 0,
        lineCap: 'butt',
        lineJoin: 'round'
      },
      fill: { color: '#c4b5fd', opacity: 0.2 },
      text: null
    }
  },

  creation: {
    controller: 'drag-box',
    initialize({ bounds }) {
      return {
        bounds,
        typeData: {
          schemaVersion: 1,
          payload: { category: 'review' }
        }
      }
    }
  },

  renderer: {
    render(annotation) {
      return {
        children: [{
          kind: 'rectangle',
          bounds: annotation.bounds,
          stroke: annotation.appearance.stroke ?? undefined,
          fill: annotation.appearance.fill ?? undefined
        }]
      }
    }
  },

  pdf: { exportStrategy: 'appearance-stream' }
}
```

:::

`data.supportedSchemaVersions` must include the `schemaVersion` written to `typeData`. Without the matching data definition, Core cannot interpret the custom payload and treats the annotation as unavailable.

## Install the tool and draw an annotation

Add a button next to the existing Viewer, register the type when creating Core, and activate it when the button is clicked:

::: code-group

```html [index.html]
<main id="pdf-workspace">
  <button id="review-area">Review area</button>
  <div id="pages"></div>
</main>
```

```ts [main.ts]
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import { reviewArea } from './review-area'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotationTypes: [reviewArea]
})

await core.load({ url: '/documents/review.pdf' })

document.querySelector<HTMLButtonElement>('#review-area')!.onclick = () => {
  core.annotations.setTool('custom:acme/review-area')
}
```

:::

Click **Review area**, then drag on the PDF. Core creates a purple rectangle, selects it, and stores it in `core.annotations.repository`.

## Read and save the custom data

The new annotation uses the same data model as built-in types:

```ts
const annotation = core.annotations.repository.getAll()[0]

console.log(annotation.type)
// 'custom:acme/review-area'

console.log(annotation.typeData)
// { schemaVersion: 1, payload: { category: 'review' } }
```

Save and restore the complete annotation using the normal repository APIs. No plugin-specific storage format is required. See [Persist annotations](./persistence).

## Register and remove a type dynamically

If the tool must be installed or removed while the Viewer is running, do not also include it in the `annotationTypes` constructor option. Register it directly instead:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages }
})

const removeReviewArea = core.annotationTypes.register(reviewArea)

removeReviewArea()

core.annotationTypes.register(reviewArea)
```

Removing the definition does not delete existing annotations. Their data remains intact, and Core displays a placeholder until a compatible definition is registered again.

## Understand rendering and export limits

The renderer returns Core-defined drawing primitives: `group`, `rectangle`, `ellipse`, `line`, `path`, `text`, and PNG/JPEG `image`. It never creates Konva objects directly.

For `appearance-stream` PDF export, the current version supports `rectangle`, `ellipse`, and `line`. Unsupported primitives cause export to fail during validation rather than silently disappearing.

For every supported field, see [Public API: Annotation Type Definitions](../api#annotation-type-definitions).
