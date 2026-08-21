# Annotations

## Attach a page

When Page Flow is not creating pages for you, attach the annotation overlay to a
stable page container after its dimensions are known:

```ts
await core.annotations.attachPage({
  pageIndex: 0,
  container: pageElement,
  width: unscaledPageWidth,
  height: unscaledPageHeight,
  scale: currentScale
})
```

Update or reattach it when the page scale changes and detach it when the page is
unmounted. Coordinates in canonical annotations remain unscaled page units.

## Tools and creation modes

```ts
core.annotations.setTool('rectangle')
core.annotations.setTool('highlight')
core.annotations.setTool('select')
```

Shape, ink, image, text, and path tools default to one-shot creation and return
to Select. Highlight, Underline, and Strikeout default to continuous creation.
Override this through `creationModes`; the toolbar only reflects the resulting
`toolChanged` event.

Text markup follows native selection:

```ts
const selection = core.viewer.getTextSelection()
if (selection?.kind === 'page') {
  core.annotations.createTextMarkup('highlight', selection.selection)
  core.viewer.clearTextSelection()
}
```

## Appearance

`AnnotationAppearanceInput` is a deep partial. `undefined` inherits the current
value and `null` disables a component such as stroke or fill.

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
and owns the in-place textarea; a product can provide another implementation
through a Capability without changing annotation semantics.

Signature and Stamp are image annotations. Product UI creates or selects a PNG
or JPEG data URL, then gives Core the placement asset:

```ts
core.annotations.setImageAsset('signature', {
  image: signatureDataUrl,
  width: 180,
  height: 60,
  text: 'Ada signature'
})
core.annotations.setTool('signature')
```

Core owns the cursor preview, placement, selection, transforms, rendering, and
PDF output. Without an asset, a canvas click emits `imageAssetRequired` so the
application can open its picker.

## Repository and collaboration

The repository is the single source of truth for annotations, selection,
comments, references, and permissions. Pass your own repository when state must
outlive an engine instance, or install it with
`createAnnotationRepositoryCapability()`.

Persist canonical `Annotation` values only. Validate untrusted or historical
input before inserting it. Framework UI may keep panel state and optimistic
network status separately, but must not create a second annotation model.

## Custom annotation types

Register namespaced definitions through `inklayer-core/annotation-types`.
Definitions receive validated data and return controlled renderer-neutral scene
values; they never receive Konva nodes or PDF.js internals. See the
[Public API](../api.md#annotation-type-definitions) for registration, missing
definition behavior, transform reducers, and PDF appearance streams.
