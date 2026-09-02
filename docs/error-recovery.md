# Error recovery

Core reports structured errors; the application decides what the user sees and when an operation should be retried. Retry with the original input after the underlying problem has been resolved—do not reuse internal PDF.js tasks or share retry state between Viewer instances.

> [!NOTE] NOTE
> Display `error.message` or an application-written message. Keep `error.cause` for diagnostics only: stringifying it into the UI or telemetry can expose URLs, request headers, credentials, or document data.

## Common recovery paths

| Scenario | Core result | Application action |
| --- | --- | --- |
| PDF URL, network, or parsing failure | `PDF_LOAD_FAILED` | Keep the original `PdfSource` and call `core.load(source)` again. |
| HTTP Range request failure | `PDF_RANGE_FAILED` | Retry after the server or network recovers. Network failures do not silently become a full download. |
| Server does not support Range | Automatic fallback when `range: 'auto'`; otherwise `PDF_RANGE_UNSUPPORTED` | Use `range: 'auto'`, or retry with `range: false` when full download is acceptable. |
| Incorrect password | `passwordRequired` event with `reason: 'incorrect'` | Keep the same password dialog open and submit another password for the active `requestId`. |
| User cancels password input | Pending load rejects with `PDF_PASSWORD_CANCELLED` | Return to the document picker or let the user start a new load. |
| Application cancels loading | Pending load rejects with `PDF_LOAD_CANCELLED` | Treat cancellation as expected; start a new load only when requested. |
| Application cancels `searchMany()` | Pending batch rejects with `PDF_FEATURE_CANCELLED` | Treat cancellation as expected; retain the loaded document and start another search only when requested. |
| Application cancels `resolveTextRanges()` | Pending geometry work rejects with `PDF_FEATURE_CANCELLED` | Treat cancellation as expected; the loaded document and cached page text remain usable. |
| Temporary text-highlight layer input is invalid | `PDF_FEATURE_FAILED` with `setTextHighlightLayers` or `clearTextHighlightLayers` | Correct duplicate/blank IDs, page ranges, active indexes, visibility values, or CSS colors; the previously retained layers remain unchanged. |
| Page, search, thumbnail, or raster operation fails | `PDF_FEATURE_FAILED`, often with `operation` and `pageIndex` | Retry the specific feature after fixing its input or browser resource problem. |
| PDF permission blocks printing | `PDF_PERMISSION_DENIED` | Disable printing and explain that the document does not allow it. |
| Core instance has been destroyed | `ENGINE_DESTROYED` | Create a new instance; a destroyed instance cannot be restarted. |

## Retry a document load

Keep the source in application state and create a new load attempt from it:

```ts
import { InkLayerError } from '@inklayer-dev/core'

const retryButton = document.querySelector<HTMLButtonElement>('#retry')!
const source = { url: '/documents/review.pdf', range: 'auto' as const }

async function openPdf(): Promise<void> {
  retryButton.hidden = true

  try {
    await core.load(source)
  } catch (error) {
    if (error instanceof InkLayerError && error.code === 'PDF_LOAD_FAILED') {
      retryButton.hidden = false
      retryButton.onclick = () => { void openPdf() }
      return
    }

    throw error
  }
}

await openPdf()
```

Use an application-defined retry limit or backoff policy when repeated network requests would be expensive.

## Handle password retries

A wrong password does not start a new PDF load. The current loading task remains active and emits another password request:

```ts
const stopPassword = core.viewer.subscribe(event => {
  if (event.type !== 'passwordRequired') return

  openPasswordDialog({
    reason: event.request.reason,
    attempt: event.request.attempt,
    submit(password: string) {
      core.viewer.submitPassword(event.request.requestId, password)
    },
    cancel() {
      core.viewer.cancelPassword(event.request.requestId)
    }
  })
})
```

Call `stopPassword()` when the surrounding component or workspace is removed.

## Branch on stable fields

`InkLayerError` provides `code`, and may also provide `operation`, `annotationId`, and a zero-based `pageIndex`. Branch on these structured fields rather than matching the human-readable message.

Annotation validation and permission failures commonly use `ANNOTATION_INVALID`; custom type availability uses `ANNOTATION_TYPE_UNAVAILABLE`; import and export boundaries use `IMPORT_FAILED` and `EXPORT_FAILED`. The complete `InkLayerErrorCode` union is exported from `@inklayer-dev/core`.
