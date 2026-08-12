# React and Vue Integration Boundary

After Core is installed, React and Vue adapters implement product UI and normal
framework wiring—not a second Viewer, Painter, annotation store, decoder, or
exporter.

The normative responsibility test and split-feature matrix live in
`docs/core-boundary.md`. In particular, visible document interactions such as
TextLayer selection and annotation transforms remain Core responsibilities;
"visible" does not imply "framework-owned."

## Framework responsibilities

- render toolbar, sidebar, dialogs, comment panels, menus, and application layout;
- create DOM roots/page containers and call `attachPage`/`detachPage`;
- map UI actions to `setTool`, create/update/delete/comment/export operations;
- project `getScale`/`scaleChanged` into zoom controls and call Core `zoomIn`,
  `zoomOut`, or `setScale`; do not retain a framework pinch recognizer;
- render contextual text-selection actions from `textSelectionChanged`, then call
  `createTextMarkup` and `clearTextSelection`;
- subscribe to typed Viewer/Annotation events and project them into component
  state;
- supply current user, permissions, translations for UI labels, persistence, and
  download/upload policy; override `workerSrc` only for self-hosting or CSP;
- import `inklayer-core/style` and optionally override variables on each engine
  root;
- destroy engines during component unmount.

## Core responsibilities

- PDF loading, Range behavior, page document lifecycle, and worker ownership;
- numeric/adaptive zoom state, resize re-resolution, touch/trackpad gesture
  recognition, and viewport-anchor preservation;
- canonical annotation/repository state;
- Konva rendering, pointer gestures, selection, transforms, hover, and labels;
- retained TextLayer selection geometry, `text-select`/annotation `select` routing,
  FreeText input lifecycle, a default browser textarea, and all persisted builders;
- comments, permissions, references, and numbering semantics;
- native PDF import, metadata inspection, PDF/Excel content generation;
- coordinate conversion, validation, errors, logging ports, lifecycle cleanup,
  and minimal scoped CSS.

An adapter may wrap imperative calls in hooks/composables, but must not translate
canonical annotations into a framework-specific persisted model. Painter and
Konva nodes remain internal. This keeps React, Vue, and future integrations
behaviorally aligned while allowing each product to design its own interface.
Adapters may replace the default FreeText `TextInputProvider`; requests include the
page overlay, page index, canonical bounds, scale, and projected DOM bounds.
