# Annotation tools and appearance

This page is a reference for the built-in annotation types, tool switching,
creation modes, and appearance settings. To create an annotation through a
complete UI interaction first, follow [Create your first annotation](./first-annotation.md).
To add a new type, start with [Create your first custom annotation](./first-custom-annotation.md), then continue with [Custom annotation types](./custom-annotation-type.md). The isolated [Custom Annotations demo](https://core.inklayer.dev/demo/#custom-annotations) contains no built-in drawing tools.

Use the [Annotations demo](https://core.inklayer.dev/demo/#annotations) for the complete built-in tool palette, appearance controls, repository list, print, and export workflow.

## Built-in annotation types

Every built-in type supports printing and PDF export. `native` writes a standard
PDF annotation dictionary. `appearance-stream` preserves behavior without an
equivalent standard PDF type through a Stamp appearance stream.

The Geometry, Creation, and PDF strategy columns contain values from Annotation
Type Definitions and are mainly useful when extending the type system. For
ordinary use, focus on the Type ID and Purpose columns.

| Type ID | Purpose | Geometry | Creation | PDF strategy |
|---|---|---|---|---|
| `highlight` | Text highlight | `text-markup` | `text-selection` · continuous | `native` |
| `strikeout` | Text strikeout | `text-markup` | `text-selection` · continuous | `native` |
| `underline` | Text underline | `text-markup` | `text-selection` · continuous | `native` |
| `free-text` | Positioned text box | `text-box` | `text-input` · one-shot | `native` |
| `rectangle` | Rectangle shape | `box` | `drag-box` · one-shot | `native` |
| `circle` | Circle or ellipse shape | `box` | `drag-box` · one-shot | `native` |
| `freehand` | Multi-stroke ink | `path` | `freehand` · one-shot | `native` |
| `free-highlight` | Corrected free highlight | `path` | `freehand` · one-shot | `appearance-stream` |
| `signature` | Image or ink signature | `image` | `image-placement` · one-shot | `appearance-stream` |
| `stamp` | Image stamp | `image` | `image-placement` · one-shot | `native` |
| `note` | Point note | `point` | `point` · one-shot | `native` |
| `line` | Line with editable endpoints | `line` | `line` · one-shot | `native` |
| `arrow` | Arrow with editable endpoints | `line` | `line` · one-shot | `appearance-stream` |
| `polygon` | Closed polygon | `polyline` | `polyline` · one-shot | `native` |
| `polyline` | Open polyline | `polyline` | `polyline` · one-shot | `native` |
| `cloud` | Closed cloud outline | `polyline` | `polyline` · one-shot | `appearance-stream` |

## Tools and creation modes

```ts
core.annotations.setTool('rectangle')
core.annotations.setTool('text-select')
core.annotations.setTool('select')
```

`rectangle` starts drawing a rectangle, `text-select` lets the user select PDF
text, and `select` edits existing annotations.

Most creation tools return to `select` after one annotation. `highlight`,
`underline`, and `strikeout` remain active by default so users can create more
than one text markup. You can change this when creating the Core instance:

```ts
const core = await createInkLayer({
  root,
  annotation: {
    creationModes: { rectangle: 'continuous' }
  }
})
```

Update toolbar state from the emitted `toolChanged` event, because a one-shot
tool can switch back to `select` after creation. Text markup follows the rule
“select text, then create the annotation”; the complete button interaction is
shown in [Create your first annotation](./first-annotation.md).

## Appearance

`AnnotationAppearanceInput` accepts only the fields you want to change. Omitted
fields keep their current values; setting `stroke`, `fill`, or `text` to `null`
disables that appearance component.

```ts
core.annotations.setToolAppearance('highlight', {
  stroke: null,
  fill: { color: '#74d13d', opacity: 0.45 }
})

core.annotations.setToolAppearance('rectangle', {
  stroke: { color: '#175cd3', width: 2, dash: [] },
  fill: null
})
```

Use `getAppearanceCapabilities(type)` to render valid inspector controls for
each annotation type. Hit target width and transformer internals are Core-owned
and are intentionally not persisted appearance fields.

## FreeText, Signature, and Stamp

FreeText uses the configured `TextInputProvider`. The browser default creates
and manages an in-place textarea. An application can provide another
implementation through a Capability without changing annotation semantics.

Signature and Stamp are image annotations. The application creates or selects a
PNG or JPEG data URL, then gives Core the asset to place:

```ts
core.annotations.setImageAsset('signature', {
  image: signatureDataUrl,
  width: 180,
  height: 60,
  text: 'Ada signature'
})
core.annotations.setTool('signature')
```

Core handles the cursor preview, placement, selection, transforms, rendering,
and PDF output. If no asset has been set, clicking the page emits
`imageAssetRequired`, allowing the application to open its picker.

## Annotation data and collaboration

`core.annotations.repository` is the current instance's annotation data store
and the single source of truth for annotations, selection, comments, references,
and permissions. Pass your own repository when state must outlive an engine
instance, or install it with
`createAnnotationRepositoryCapability()`.

Persist canonical `Annotation` values only. Validate untrusted input before
inserting it. Framework UI may keep panel state and optimistic network status
separately, but must not create a second annotation model. Follow the complete
[save and restore guide](./persistence.md).

## Custom annotation types

Register namespaced definitions through `@inklayer-dev/core/annotation-types`.
Definitions receive validated data and return controlled renderer-neutral scene
values; they never receive Konva nodes or PDF.js internals. See the
[custom annotation type tutorial](./custom-annotation-type.md) for a complete Definition and lifecycle example,
and the [Public API](../api.md#annotation-type-definitions) for registration,
missing definition behavior, transform reducers, and PDF appearance streams.

## Attach pages manually

Page Flow handles this automatically. If your adapter owns page layout, add an
empty annotation layer above each page canvas and attach it after the page
dimensions are known:

```ts
await core.annotations.attachPage({
  pageIndex: 0,
  container: annotationLayer,
  width: unscaledPageWidth,
  height: unscaledPageHeight,
  scale: currentScale
})
```

Update or reattach the layer when scale changes. When the page unmounts, call
`core.annotations.detachPage(pageIndex)`. Annotation coordinates remain in
unscaled page units.
