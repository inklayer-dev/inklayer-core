# Error recovery

InkLayer Core reports machine-readable failure context; the application owns
the visible error message, retry button, retry limits, and any backoff policy.
The Vanilla recovery panel demonstrates this boundary without adding
fault-injection behavior to the published Core runtime.

## Recovery matrix

| Scenario | Core outcome | Application retry |
|---|---|---|
| URL document failure | `PDF_LOAD_FAILED`, operation `load` | Repeat `viewer.load(source)` with the retained URL source. |
| HTTP Range failure | `PDF_RANGE_FAILED`, operation `fetchPdfRange` | Repeat the same automatic-Range load after the server becomes healthy. Network failures never silently fall back to a full download. |
| Incorrect password | `passwordRequired` event with `reason: 'incorrect'` and an incremented `attempt` | Keep the active request dialog open and call `submitPassword(requestId, password)` again. The password is never stored by Core. |
| Page raster failure | `PDF_FEATURE_FAILED`, operation `renderPageRaster`, and zero-based `pageIndex` | Repeat `renderPageRaster()` for the same page after the surface/provider problem is resolved. |
| Explicit load cancellation | `PDF_LOAD_CANCELLED`, operation `load`; Viewer returns to `idle` | Retain the application source and call `load()` again. Cancellation is distinct from a network or parsing failure. |

`InkLayerError.cause` remains available to diagnostic code, but the demo does
not stringify it into the DOM. This prevents a platform error from accidentally
exposing URLs, headers, credentials, or document content. Product telemetry and
logging must follow the same rule.

## Deterministic examples

The Vanilla Vite fixture supplies two fail-once endpoints. The URL endpoint
returns invalid PDF bytes once and a valid document on retry. The Range endpoint
returns one intentional failing partial request and then serves valid byte
ranges. A demo-only surface-provider wrapper rejects one raster encode and then
delegates normally. These seams make failure behavior reproducible without
changing production Core behavior.

The Password PDF and URL Range PDF controls cover incorrect-password and
explicit-cancellation recovery. A retry closure belongs to its Core instance and
must never be shared implicitly between document workspaces.

## Verification

```sh
npx vitest run tests/integration/viewer/pdf-viewer-engine.test.ts
npx playwright test tests/browser/vanilla.spec.ts --grep "recovers URL, Range"
```

The browser scenario runs the complete five-path recovery sequence in Chromium,
Firefox, and WebKit. The intentionally failing URL/Range responses may produce
their engine's expected network or invalid-PDF diagnostic; the test rejects all
other console warnings, errors, and uncaught page failures.
