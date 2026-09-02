# Document watermarks

Open the [Watermark demo](https://core.inklayer.dev/demo/#watermark) to change the text, layout, opacity, rotation, and output targets while using the same Continuous PDF workspace as the other demos.

A watermark is a Viewer policy, not an annotation. Configure it once and choose independently whether it appears while viewing, printing, and exporting.

## Configure before loading

Set the policy before `load()` so the first rendered Continuous pages already contain the watermark:

```ts
core.viewer.setWatermark({
  text: `${currentUser.name} · ${documentId}`,
  layout: 'repeated',
  opacity: 0.12,
  rotation: -28,
  targets: {
    viewer: true,
    print: true,
    export: true,
    thumbnails: false
  }
})

await core.load({ url: '/documents/review.pdf' })
```

Use `layout: 'center'` for one centered mark. Repeated layout is usually more effective for review copies because cropping one area does not remove every occurrence.

## Update or remove the policy

`setWatermark()` replaces the complete policy. After changing it, rerender or reload pages already visible in your application:

```ts
core.viewer.setWatermark({
  text: 'INTERNAL REVIEW',
  layout: 'center',
  opacity: 0.18,
  rotation: -20,
  targets: { viewer: true, print: true, export: false }
})

core.viewer.setWatermark(null) // remove it
```

`getWatermark()` returns a detached snapshot that can be passed to PDF output builders.

## Carry it into export

Viewer Canvas and generated PDF files are separate output paths. Pass the current policy when building an exported PDF:

```ts
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

const watermark = core.viewer.getWatermark()
const output = await buildAnnotatedPdf(sourceBytes, annotations, {
  annotationTypes: core.annotationTypes,
  ...(watermark === null ? {} : { watermark })
})
```

The demo's **Print** action uses the `print` target. Its **Export** action uses the `export` target and downloads `inklayer-watermarked.pdf`.

## Security boundary

Watermarks discourage casual redistribution and can identify a user or review copy. They do not encrypt the PDF, prevent editing, prove authenticity, or replace access control and certificate-backed digital signatures.

For font embedding, password-protected documents, raster printing, and secure redaction, continue with [Print, export, and watermarks](./output-and-security.md).
