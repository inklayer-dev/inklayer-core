# React Adapter Migration

`inklayer-react` now contains a minimal real consumer named `CoreAnnotationBridge`. It listens to PDF.js `pagerendered`, creates page-local overlays, attaches the public Core Annotation Engine, and forwards canonical annotations, user, permissions and typed events without owning a second annotation store.

## Migration sequence

1. Mount the bridge alongside the legacy Painter for comparison.
2. Route toolbar tool and appearance actions to `AnnotationEngine`.
3. Route sidebar selection and hover with explicit Core sources.
4. Save `engine.repository` canonical V1 directly.
5. Move loading/search/pinch/selection/print to Viewer Engine and Page Flow.
6. Lazy-load PDF/Excel exporters from action handlers.
7. Remove the old Painter, PDF writer, selection and Pinch paths after product E2E acceptance.

React remains responsible for toolbars, dialogs, signature/stamp creation forms, comment UI, Snackbar timing, sidebars, theming and localization.

## Current acceptance status

- Core full package check and Chromium Vanilla E2E pass.
- React production build passes with the local Core package.
- React Jest has 14 passing suites and 83 passing assertions; 31 suites cannot start because `canvas.node` ABI 127 does not match Node 24 ABI 137. Rebuild `canvas` before using React Jest as a release gate.

