# Create your first annotation

Continue with the same `core` instance from [Getting started](./getting-started.md). In this tutorial, you will add application buttons that draw a rectangle and turn selected PDF text into a highlight.

> [!IMPORTANT] NOTE
InkLayer Core is headless: it does not ship a toolbar or sidebar. You build those controls in your framework and call the same methods shown here.

## Draw a rectangle

Add a button outside the Viewer hosts. InkLayer Core is headless, so your application owns this button and decides where it appears:

```html
<button id="rectangle" type="button">Rectangle</button>
```

Activate the Rectangle tool when the user clicks the button:

```ts
const rectangleButton = document.querySelector<HTMLButtonElement>('#rectangle')!

rectangleButton.onclick = () => {
  core.annotations.setTool('rectangle')
}
```

Click **Rectangle**, then drag on a PDF page. Core creates and selects the rectangle, then returns to the Select tool so the user can move or resize it.

### Set the rectangle appearance (optional)

Set the appearance before activating the tool when you want a different default for new rectangles:

```ts
core.annotations.setToolAppearance('rectangle', {
  stroke: {
    color: '#175cd3', // Border color
    width: 2,         // Border width
    dash: []          // Empty means a solid line
  },
  fill: {
    color: '#84adff', // Fill color
    opacity: 0.18     // Fill opacity from 0 to 1
  }
})
```

Call this once during setup, before the user clicks **Rectangle**.

## Highlight selected text

Text markup is created in two steps: first the user selects PDF text, then an application action turns that selection into a highlight.

Add one button for each step:

```html
<button id="select-text" type="button">Select text</button>
<button id="highlight" type="button">Highlight selection</button>
```

Connect the buttons to Core:

```ts
const selectTextButton = document.querySelector<HTMLButtonElement>('#select-text')!
const highlightButton = document.querySelector<HTMLButtonElement>('#highlight')!

selectTextButton.onclick = () => {
  core.annotations.setTool('text-select')
}

highlightButton.onclick = () => {
  const active = core.viewer.getTextSelection()
  if (!active) return

  const selections = active.kind === 'page'
    ? [active.selection]
    : active.selection.fragments

  for (const selection of selections) {
    core.annotations.createTextMarkup('highlight', selection)
  }

  core.viewer.clearTextSelection()
}
```

Click **Select text**, drag across text in the PDF, then click **Highlight selection**. Core retains the PDF selection while focus moves to your button. A cross-page selection creates one page-scoped annotation for each selected page.

Replace `highlight` with `underline` or `strikeout` to create the other text markup types.

## Inspect the result

Core stores every annotation created above in `core.annotations.repository`, the annotation data store for this instance:

```ts
const annotations = core.annotations.repository.getAll()
console.log(annotations)
```

`getAll()` returns detached, serializable annotation data rather than Konva nodes or page DOM. To send these values to a backend and restore them later, continue with [Save and restore annotations](./persistence.md).

When the page unmounts, keep the cleanup from [Getting started](./getting-started.md) and await `core.destroy()`.
