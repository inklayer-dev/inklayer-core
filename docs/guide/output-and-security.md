# Print, export, and watermarks

## Vector PDF export

```ts
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

const output = await buildAnnotatedPdf(sourceBytes, annotations, {
  strategy: 'strict',
  watermark: core.viewer.getWatermark(),
  annotationTypes: core.annotationTypes
})
```

The vector exporter returns bytes and never chooses a filename, downloads a
file, uploads data, or opens UI. Strict mode fails before returning a partial
result; lenient mode skips invalid entries and reports warnings.

## Printing

Use vector print preparation for ordinary documents. For password-protected or
sensitive documents already opened by PDF.js, use secure raster preparation:

```ts
import { buildSecureRasterPrintPdf, printPdfBlob } from '@inklayer-dev/core'

const printable = await buildSecureRasterPrintPdf({
  viewer: core.viewer,
  annotations: core.annotations,
  pixelRatio: 2
})

await printPdfBlob(printable)
```

The secure path produces a transient, unencrypted, image-only PDF for the print
dialog. It enforces normalized PDF permissions and merges annotations and print
watermarks, but intentionally loses selectable text, links, forms, and vector
fidelity. Do not expose it as a replacement document download.

## Watermarks

```ts
core.viewer.setWatermark({
  text: `${currentUser.name} · ${documentId}`,
  layout: 'repeated',
  opacity: 0.12,
  rotation: -28,
  targets: { viewer: true, print: true, export: true, thumbnails: false }
})
```

Frontend watermarks deter casual reuse but are not tamper-resistant DRM. Enforce
high-value policy on a trusted backend as well.

## Download and Excel

```ts
import { buildAnnotationWorkbook } from '@inklayer-dev/core/export/excel'
import { downloadBlob } from '@inklayer-dev/core'

const workbook = await buildAnnotationWorkbook(annotations)
downloadBlob({
  content: workbook,
  filename: 'annotations.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
})
```

Browser Print and Download providers are optional side-effect boundaries. In
Electron, mobile WebViews, server rendering, or a custom file service, provide
your own Port Capability instead of emulating browser clicks.
