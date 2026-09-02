# Secure keyword redaction

New to this workflow? Complete [Create your first keyword redaction](./first-keyword-redaction.md) first, or open the [Redaction demo](https://core.inklayer.dev/demo/#redaction). This page explains how to combine keyword rules, human review, and secure output into an extensible product workflow.

Keyword redaction is not a permanent annotation type. It reuses Highlighter matches and review state, then creates a new image-only PDF:

```text
Application rules → colored preview → human review → opaque covering → image-only PDF
```

## Keep preview and redacted output separate

The on-screen review should retain each rule's ordinary Highlighter color. Users need to read the matched text, distinguish rules, and exclude false positives; do not cover the text with black boxes during review.

Only printing or exporting a redacted copy should pass included text ranges to `buildSecureRedactedPdf()`. Core renders every page again, paints opaque black boxes, and creates a PDF without source text objects. Preview colors never enter redacted output.

| Stage | Application UI | Core data |
| --- | --- | --- |
| Scan | Temporary highlights colored by rule | `KeywordMatch[]` |
| Review | Include, exclude, navigate, and count | `reviewState` |
| Print or export | Progress, cancellation, and completion | `PdfTextRange[]` |
| Result | A new image-only PDF | `Uint8Array` |

## Review keyword matches

The Controller initially marks scanned matches as `included`. Product UI can change review state per match or per rule:

```ts
highlighter.excludeMatch(matchId)
highlighter.includeMatch(matchId)
highlighter.excludeRule('internal-identifiers')
highlighter.includeRule('internal-identifiers')
```

Drive the result list and output actions from the Snapshot instead of keeping a second editable copy of review state:

```ts
const unsubscribe = highlighter.subscribe(snapshot => {
  const canOutput = snapshot.status === 'ready'
    && snapshot.includedCount > 0

  exportButton.disabled = !canOutput
  printButton.disabled = !canOutput
  includedCount.textContent = String(snapshot.includedCount)
})
```

Call `activateMatch(id)` to navigate to a result and update the active preview. `clearPreview()` hides only temporary layers owned by the Controller; it does not discard rules or review results. `reset()` clears the complete workflow.

## Build one reusable redaction task

Print and download should call the same builder so the two output paths cannot diverge:

```ts
import { buildSecureRedactedPdf } from '@inklayer-dev/core'

async function buildReviewedRedaction(signal?: AbortSignal) {
  const snapshot = highlighter.getSnapshot()
  if (snapshot.status !== 'ready') {
    throw new Error('Keyword review is not ready.')
  }

  const ranges = snapshot.matches
    .filter(match => match.reviewState === 'included')
    .map(match => match.range)

  return await buildSecureRedactedPdf({
    viewer: core.viewer,
    ranges,
    pixelRatio: 2,
    margin: 1,
    signal,
    onProgress: (completed, total) => {
      progress.textContent = `${completed}/${total}`
    }
  })
}
```

`pixelRatio` defaults to `2` and accepts a finite value above `0` and no greater than `4`. Higher values increase clarity, memory use, processing time, and file size. Core caps the ratio at `1` when the document permits only low-resolution printing.

`margin` defaults to one PDF page unit and covers glyph edges. It accepts values from `0` through `20`; large values may cover adjacent content, so use a fixed, tested product value rather than exposing it as an unrestricted user control.

## Download a redacted copy

The download action only names and delivers the generated artifact:

```ts
import { downloadBlob } from '@inklayer-dev/core'

const controller = new AbortController()

try {
  exportButton.disabled = true
  const bytes = await buildReviewedRedaction(controller.signal)
  downloadBlob({
    content: bytes,
    filename: 'contract-redacted.pdf',
    mimeType: 'application/pdf'
  })
} finally {
  exportButton.disabled = highlighter.getSnapshot().includedCount === 0
}
```

Call `controller.abort()` when the user closes the flow, replaces the document, or cancels the task. Do not start concurrent redaction builds; disable conflicting actions until the current task finishes.

## Print a redacted copy

Printing must reuse the same secure artifact rather than print the current DOM with its colored preview:

```ts
import { printPdfBlob } from '@inklayer-dev/core'

const bytes = await buildReviewedRedaction()
await printPdfBlob({ content: bytes })
```

The system print preview therefore contains opaque black boxes while the on-screen review retains colored Highlighter marks. Do not use `window.print()` on the Viewer page: browser print styles, text layers, and temporary overlays do not provide a redaction guarantee.

## Security guarantee and tradeoffs

`buildSecureRedactedPdf()` does not place rectangles over the original PDF. It:

1. Resolves reviewed source-text ranges.
2. Renders every PDF page to a bitmap.
3. Paints opaque black boxes over the target geometry.
4. Creates a new PDF containing only page images.

All page text consequently loses selection, copy, search, and text accessibility. Links, forms, vector detail, and original annotation structure are flattened as well. This is a deliberate tradeoff of the current client-side secure path.

The guarantee covers only the supplied text ranges and the newly generated file. Core does not automatically detect identity numbers, signatures, or faces inside images; modify the original file; or erase cached copies, prior versions, or files stored elsewhere. High-risk workflows still need human review and verification of the final downloaded artifact.

## Handle errors and permissions

Generation is rejected when:

- the Viewer has not reached `ready`;
- no included ranges remain;
- document permissions prohibit printing or raster output;
- the runtime lacks browser Canvas or `createImageBitmap`;
- `pixelRatio` or `margin` is outside its allowed range; or
- an `AbortSignal` cancels the task.

Present `PDF_PERMISSION_DENIED` separately from a general `EXPORT_FAILED`. Cancellation throws `AbortError` and normally requires only restoring action state, not an error notification. This browser raster path cannot run directly in a Node.js server environment.

## Integrate with React and Vue

React, Vue, and Vanilla JavaScript consume the same `KeywordHighlighter` Controller. Components only render the Snapshot as rule lists, result rows, and output actions; the redaction builder has no framework dependency.

On component teardown, cancel active output, call the function returned by `subscribe()`, and finally destroy a Controller owned by that component:

```ts
abortController?.abort()
unsubscribe()
highlighter.destroy()
```

See [Keyword Highlighter](./highlighter.md) for complete Controller state, regular expressions, and review methods. See [Print, export, and watermarks](./output-and-security.md) for other PDF, spreadsheet, print, and watermark outputs.
