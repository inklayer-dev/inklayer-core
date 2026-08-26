# Browser support

InkLayer Core targets modern browsers. Runtime behavior is tested against the Chromium, Firefox, and WebKit engines; application layout and framework components remain the responsibility of the integrating application.

## Supported engines

| Browser family | Support |
| --- | --- |
| Chromium-based browsers | Tested against Chromium |
| Firefox | Tested against Firefox |
| Safari | Tested against WebKit |
| Embedded WebViews | Not declared; verify the host WebView and operating-system version |

The automated matrix uses current Playwright browser builds. This confirms behavior in the three browser engines, but it is not a promise that every historical browser or vendor-specific WebView is supported.

## Browser features used

The complete Viewer and annotation workspace relies on modern platform APIs:

- ES modules and dynamic `import()`;
- `fetch`, `AbortController`, `Blob`, and object URLs;
- Canvas 2D and browser image decoding;
- `IntersectionObserver` and `createImageBitmap` for virtualized pages;
- `ResizeObserver` for automatic recalculation of adaptive page scales when available;
- Pointer Events for drawing and touch gestures;
- the Selection and Range APIs for selectable PDF text.

Applications that target restricted WebViews should verify these APIs before creating the Viewer. Missing required features are reported through `InkLayerError`, commonly with `ENVIRONMENT_UNSUPPORTED` or `PDF_FEATURE_FAILED`.

## Tested behavior

The browser suite covers document loading, HTTP Range requests, passwords, virtualized pages, search, text selection, annotations, keyboard interaction, touch zoom, printing, export, multiple Viewer instances, and teardown.

Responsive toolbars, sidebars, dialogs, and breakpoints are application UI and are not supplied by Core. Test those components in the browsers and devices supported by your own product.

## Server-side rendering

Package imports are safe in a server environment because the PDF.js browser runtime is loaded only when a document is opened. PDF rendering, DOM attachment, printing, and downloads still require a browser and should run from the client lifecycle.

For browser-specific failures and retry behavior, see [Error recovery](./error-recovery).
