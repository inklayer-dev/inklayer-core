# Create your first keyword redaction

Start with the same `core` and `highlighter` from [Create your first keyword highlight](./first-keyword-highlight.md). This tutorial turns reviewed keyword matches into a new image-only PDF whose page text cannot be copied or extracted.

Open the [Redaction demo](https://core.inklayer.dev/demo/#redaction) to review matches and download the secure output produced by this workflow.

> [!WARNING] SECURITY
> An opaque rectangle drawn over the original PDF is not redaction. The covered text may remain searchable, copyable, or recoverable. Use the secure raster builder for the guarantee described here.

## Review the matches

Scan prepared application rules, then let your product exclude false positives. This example keeps the current review state:

```ts
await highlighter.scan()

const included = highlighter.getSnapshot().matches
  .filter(match => match.reviewState === 'included')
```

`includeMatch()`, `excludeMatch()`, `includeRule()`, and `excludeRule()` can update that state from any Vanilla, React, or Vue interface before output.

Keep each rule's normal Highlighter color during review. The colored preview lets users read the matched text, distinguish rules, and remove false positives. It is temporary UI state; Core changes accepted ranges to opaque black boxes only while building the printed or downloaded redacted copy.

## Build the redacted PDF

Pass only the accepted source ranges to Core:

```ts
import {
  buildSecureRedactedPdf,
  downloadBlob
} from '@inklayer-dev/core'

const pdfBytes = await buildSecureRedactedPdf({
  viewer: core.viewer,
  ranges: included.map(match => match.range),
  pixelRatio: 2,
  margin: 1
})

downloadBlob({
  content: pdfBytes,
  filename: 'contract-redacted.pdf',
  mimeType: 'application/pdf'
})
```

Core resolves the source ranges, renders every page, paints black boxes over the resolved geometry, and creates a new PDF containing page images only. Neither redacted nor unrelated page text remains searchable or selectable in the result.

The builder rejects an empty range list, a Viewer that is not ready, and documents that prohibit raster output through their print permissions. It uses the Viewer print watermark and respects low-resolution print limits.

## Understand the trade-off

This first secure path deliberately removes the complete text layer. Links, forms, vector detail, selection, search, and accessibility text are flattened with it. Core does not modify the original file, redact sensitive content inside images automatically, or remove copies stored elsewhere.

Open the [Redaction demo](https://core.inklayer.dev/demo/#redaction) to review matches and export a real artifact. Continue with [Secure keyword redaction](./keyword-redaction.md) when you need the full review UI, print, progress, cancellation, and error-handling workflow. For the broader output threat model, see [Print, export, and watermarks](./output-and-security.md#export-a-secure-redacted-pdf).
