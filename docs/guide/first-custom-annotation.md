# Create your first custom annotation

Built-in annotations cover common PDF markup. A custom Annotation Type Definition adds an application-owned tool with its own semantic data while Core continues to own pointer gestures, transforms, persistence, printing, and export.

Open the [Custom Annotations demo](https://core.inklayer.dev/demo/#custom-annotations) to try the isolated application-owned tools and inspect each Definition through **Show code**.

This example creates a business review area. For every contract field and lifecycle rule, continue with [Custom annotation types](./custom-annotation-type.md).

## Define the type

```ts
import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

export const reviewArea: AnnotationTypeDefinition = {
  type: 'custom:acme/review-area',
  apiVersion: 1,
  geometry: 'box',
  data: {
    supportedSchemaVersions: [1],
    validate(payload) {
      if (typeof payload !== 'object' || payload === null) {
        throw new Error('Review area data must be an object')
      }
    }
  },
  capabilities: {
    creation: 'drag-box',
    creationMode: 'one-shot',
    transform: {
      move: true, resize: true, rotate: false,
      endpoints: false, vertices: false
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
        color: '#f59e0b', width: 2, opacity: 1,
        dash: [], dashOffset: 0, lineCap: 'butt', lineJoin: 'round'
      },
      fill: { color: '#fbbf24', opacity: 0.18 },
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
          payload: { category: 'legal-risk', severity: 'high', status: 'pending' }
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

## Register and activate it

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotationTypes: [reviewArea]
})

await core.load({ url: '/documents/review.pdf' })

reviewAreaButton.onclick = () => {
  core.annotations.setTool('custom:acme/review-area')
}
```

The result is stored in the normal annotation repository. Save the complete annotation, including `typeData`, rather than maintaining a second plugin-specific store.

The [Custom Annotations demo](https://core.inklayer.dev/demo/#custom-annotations) also includes Measurement and Issue Marker Definitions. Its Show code drawer lets you inspect and copy each Definition separately.
