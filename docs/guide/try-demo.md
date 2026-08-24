# Try InkLayer Core in the live demo

The [live demo](https://inklayer-dev.github.io/inklayer-core/demo/) is the fastest way to see what Core provides before writing integration code. It is a Vanilla application built from the same public APIs documented here—not a separate showcase implementation.

## Open and navigate a PDF

The bundled sample opens automatically. Use **Open PDF** to choose a local file, then try page navigation, zoom presets, continuous scrolling, thumbnails, and the outline. The **Password PDF** and **URL Range PDF** actions demonstrate password requests, chunked loading, cancellation, and retry.

## Search and create text markup

Open **Search**, search for `Core`, and move between results. To create markup:

1. choose the text-selection tool;
2. select text in the PDF;
3. choose **Highlight**, **Underline**, or **Strikeout** from the selection actions.

This is the intended interaction: select real PDF text first, then ask Core to create page-local annotations from that selection.

## Draw and edit annotations

Choose **Rectangle**, draw on a page, then drag or resize the result. Try Freehand, Free Highlight, Polygon, Cloud, FreeText, Note, Signature, and Stamp to see the interaction differences Core owns.

The surrounding palette and property controls belong to the demo application. Drawing, hit testing, transforms, keyboard behavior, and annotation data belong to Core.

## Try a custom annotation plugin

In **Annotation plugin**, choose **Install Measurement plugin**. A Measurement tool appears in the palette. Draw a measurement, unload the plugin, and reload it: the annotation data stays in the document and returns to full rendering when its Definition is available again.

## Print and export

Use **Print** to open the browser print flow. **Export** produces annotated PDF or Excel output. These buttons are product UI; Core prepares the bytes and enforces annotation, watermark, and permission behavior.

## Run the demo locally

```sh
npm install
npm run dev
```

Then continue with [Build a viewer in 5 minutes](./getting-started.md).
