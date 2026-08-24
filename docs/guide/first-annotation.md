# Create your first annotation

This guide starts from the Viewer created in [Build a viewer in 5 minutes](./getting-started.md). You will add a Rectangle button, control its appearance, observe saved annotation data, and create a Highlight from selected PDF text.

## Add a Rectangle button

Add a product button anywhere outside Core-owned page elements:

```html
<button id="rectangle" type="button">Rectangle</button>
```

Connect it to the annotation tool:

```ts
document.querySelector('#rectangle')?.addEventListener('click', () => {
  core.annotations.setTool('rectangle')
})
```

Click the button and drag on a PDF page. Rectangle is a one-shot tool by default: after creation, Core selects the new annotation and returns to Select.

## Choose its appearance

Set defaults before the user draws:

```ts
core.annotations.setToolAppearance('rectangle', {
  stroke: { color: '#175cd3', width: 2, dash: [] },
  fill: { color: '#84adff', opacity: 0.18 }
})
```

The product owns color pickers and number inputs. Core validates the values and keeps rendering, printing, and export consistent.

## Observe annotation data

```ts
const stop = core.annotations.repository.subscribe(event => {
  if (event.type === 'selection') return
  console.log(core.annotations.repository.getAll())
})
```

`getAll()` returns detached, serializable annotations. It does not return Konva nodes or page DOM.

## Create a Highlight from selected text

Put PDF text into selection mode:

```ts
core.annotations.setTool('text-select')
```

After the user selects text, a product action can create the Highlight:

```ts
const selection = core.viewer.getTextSelection()
if (selection?.kind === 'page') {
  core.annotations.createTextMarkup('highlight', selection.selection)
  core.viewer.clearTextSelection()
}
```

Cross-page selections contain ordered page fragments. Create one canonical markup per fragment. See [Search and text selection](./search-and-selection.md).

## Clean up

Dispose your repository subscription before destroying the instance:

```ts
stop()
await core.destroy()
```

Next, learn how to [save and restore annotations](./persistence.md) or explore all [annotation tools and appearance controls](./annotations.md).
