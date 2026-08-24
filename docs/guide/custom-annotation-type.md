# Custom annotation type

This tutorial adds a purple **Review area** tool. Users can drag a box on the PDF, select it, move and resize it, save its semantic data, print it, and export it to PDF.

## Define the tool

Custom IDs use `custom:<namespace>/<name>`. The Definition below uses Core's drag-box gesture and controlled rectangle renderer:

```ts
import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

export const reviewArea = {
  type: 'custom:acme/review-area',
  apiVersion: 1,
  geometry: 'box',
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
        color: '#7c3aed', width: 2, opacity: 1,
        dash: [6, 4], dashOffset: 0, lineCap: 'butt', lineJoin: 'round'
      },
      fill: { color: '#c4b5fd', opacity: 0.2 },
      text: null
    }
  },
  creation: {
    controller: 'drag-box',
    initialize(input) {
      return {
        bounds: { ...input.bounds },
        content: { text: 'Review area' },
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
} satisfies AnnotationTypeDefinition
```

## Install and use it

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotationTypes: [reviewArea]
})

reviewAreaButton.onclick = () => {
  core.annotations.setTool('custom:acme/review-area')
}
```

After the user drags a page box, the new annotation appears in the normal Repository. No plugin-specific save path is needed: `type`, `typeData`, bounds, appearance, and renderer state travel with the canonical annotation.

## Unload and reload

```ts
const remove = core.annotationTypes.register(reviewArea)
remove()
```

Removal is idempotent and does not delete annotations. Core preserves their data and displays a safe bounds placeholder. Registering a compatible Definition restores full rendering.

## Understand the safety boundary

The renderer may return only public scene primitives such as group, rectangle, ellipse, line, path, text, and PNG/JPEG image. Core validates them before creating private Konva objects and continues to own hit testing, transform controls, tags, snapshots, teardown, print, and export.

For `appearance-stream` PDF output, V1 supports rectangle, ellipse, and line primitives. Unsupported output fails during preflight instead of silently dropping an annotation.

See [Public API: Annotation Type Definitions](../api.md#annotation-type-definitions) for the complete contract.
