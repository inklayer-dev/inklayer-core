# Stamp and visual signature

Open the [Stamp & Sign demo](https://core.inklayer.dev/demo/#stamp-sign) to try manual placement, batch stamping, opacity changes, and PDF export with the included sample stamp and signature.

> [!WARNING] A visual signature is not a digital signature
> `signature` represents an image or drawn visual signature. It does not provide a digital certificate, signature validation, tamper detection, or signer identity assurance.

## Prepare a stamp or signature

The application obtains the image from an upload, signature pad, template library, or backend. Core accepts a self-contained PNG/JPEG data URL and owns subsequent placement and export:

```ts
core.annotations.setImageAsset('stamp', {
  image: approvedStampDataUrl,
  width: 140,
  height: 60,
  text: 'Approved stamp'
})

core.annotations.setImageAsset('signature', {
  image: signatureDataUrl,
  width: 180,
  height: 60,
  text: 'Ada signature'
})
```

Image capture, cropping, background removal, and asset permissions belong to application UI. Core does not provide a fixed stamp library or signature-capture dialog.

## Place one manually

Set the appearance for future creations, then activate the matching tool:

```ts
core.annotations.setToolAppearance('stamp', { opacity: 0.8 })
core.annotations.setTool('stamp')
```

The next PDF page click creates a Stamp. Use `setTool('signature')` for an image signature. Core returns to selection after creation, and users can move, resize, rotate, or delete the placed content.

If `setImageAsset()` has not been called, a page click does not create an empty image. Core emits `imageAssetRequired` so the application can open its own asset picker.

## Change opacity after placement

After selecting a Stamp or Signature, update its whole-annotation opacity by ID:

```ts
const selectedId = core.annotations.repository.getSelection().primaryId

if (selectedId !== undefined) {
  core.annotations.updateAppearance(selectedId, { opacity: 0.55 })
}
```

`opacity` accepts values from `0` through `1`. The Demo restricts user input to `0.05` through `1` so a nearly invisible mark does not become difficult to select again.

## Place across multiple pages

Page-range input, position presets, and repeat confirmation are application workflow. Core only needs the final annotation data for each page:

```ts
const pageIndexes = [0, 1, 2] // Pages 1-3 selected by application UI.

for (const pageIndex of pageIndexes) {
  const page = await handle.document.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const width = 140
  const height = 60
  const margin = 24

  core.annotations.createAnnotation({
    type: 'stamp',
    pageIndex,
    bounds: {
      x: viewport.width - width - margin,
      y: viewport.height - height - margin,
      width,
      height
    },
    content: { text: 'Approved stamp', image: approvedStampDataUrl },
    appearance: { opacity: 0.65 }
  })
}
```

Do not copy first-page coordinates unchanged to every page. Landscape pages, rotated pages, and different CropBoxes can have different dimensions. Read `getViewport({ scale: 1 })` per page, then calculate top-left, top-right, bottom-left, bottom-right, or centered placement.

The public Demo supports `all`, `current`, `odd`, `even`, `1-3`, and `1-3, 5`. These strings are a Demo product protocol, not a Core API. If creation fails, the Demo deletes items already created by that batch so it does not leave a partial result.

## Export the stamped PDF

Stamp and image Signature annotations are exported with PDF Stamp appearances:

```ts
import { downloadBlob } from '@inklayer-dev/core'
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

const bytes = await buildAnnotatedPdf(
  sourceBytes,
  core.annotations.repository.getAll(),
  { annotationTypes: core.annotationTypes }
)

downloadBlob({
  content: bytes,
  filename: 'contract-stamped.pdf',
  mimeType: 'application/pdf'
})
```

The output retains position, size, rotation, and whole-annotation opacity. It represents a visible PDF mark and cannot replace a certificate-backed digital signature. See [Print, export, and watermarks](./output-and-security.md) for complete export, print, and watermark limitations.
