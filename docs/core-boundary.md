# Core Product Boundary

InkLayer Core owns behavior that must remain identical across React, Vue,
Vanilla, and future consumers. Framework adapters own product composition and
presentation. The dividing line is behavioral consistency—not whether a feature
has visible UI.

## Responsibility test

A capability belongs in Core when changing it independently in two framework
adapters could alter PDF interpretation, page coordinates, annotation data,
direct document manipulation, resource ownership, or persisted/exported output.

A capability belongs in a framework adapter when it controls product layout,
branding, workflow composition, routing, copy, or a business-specific policy.

Many visible features split across both layers: Core exposes a headless model and
browser engine behavior, while the framework renders the surrounding controls.

## Required split

| Capability | Core | Framework adapter |
|---|---|---|
| Viewer | loading, pages, unified numeric/adaptive scale, pinch anchoring, render lifecycle, navigation | application layout and route state |
| Thumbnails | render queue, cache, cancellation, page identity | sidebar/grid presentation |
| Outline | extraction, destination resolution, navigation target | tree presentation and disclosure state |
| Search | extraction, matching, result order, active-result navigation | search field and result list |
| Text selection | PDF.js TextLayer, DOM Range normalization, retained selection state, page-space rectangles | contextual action menu |
| Password/security | password request lifecycle, retry/cancel, permission normalization | credential dialog and policy copy |
| Page layout | single/continuous/facing modes; virtual page shells, render-ahead, scale, navigation, visible-page lifecycle | mode controls, scrollbar styling and surrounding layout |
| Watermark | validated policy, Canvas/PDF rendering | identity data and policy controls |
| Print | permission enforcement, vector/raster composition, watermark/annotation merge, browser resource lifecycle | print options and command UI |
| Annotation interaction | hit testing, selection, drag, resize, rotate, endpoint/vertex editing | toolbar and appearance controls |
| Keyboard/accessibility | direct-document focus, annotation semantic mirror, movement/deletion, FreeText focus, reduced-motion execution | labelled product controls, menu/dialog focus order, localized workflow copy |
| Collaboration | canonical comments, permissions, references, numbering | panels, dialogs and user-facing messages |
| Export | deterministic PDF/XLSX bytes | naming, download, upload and persistence policy |

## Interaction invariants

- Direct manipulation responds continuously and tracks the pointer one-to-one.
- Touch pinch and Ctrl/Meta+wheel zoom preserve the gesture midpoint, update the
  PDF viewport scale continuously, and remain bounded by Core policy.
- Existing annotations are draggable only in selection mode.
- Transform affordances depend on annotation geometry; a generic bounding-box
  transformer is not a sufficient interaction model for every type.
- Multi-stroke Freehand grouping, Free-highlight axis correction, and the
  open-preview/double-click completion semantics of Polygon/Cloud live in Core,
  not in framework toolbar components.
- Text markup originates from a real page TextLayer selection and is normalized
  by Core before canonical creation.
- `text-select` routes input to the TextLayer; `select` retains annotation hit
  testing and direct manipulation without making framework adapters arbitrate DOM
  and Canvas events.
- Cross-page DOM selection is emitted as ordered page-local fragments so canonical
  annotations remain page-scoped.
- Passwords never enter snapshots, errors, logs, storage, or ordinary events.
- Framework adapters never receive Konva nodes or persist framework-specific
  annotation models.
- Core never applies `role="application"`; Canvas annotations have stable native
  button alternatives with visible focus, while adapters own surrounding control
  semantics and use text-selection source for contextual-menu focus handoff.
- Viewer sub-features are generation-scoped and release page tasks, canvases,
  text layers, search work, and cached thumbnails on replacement or destroy.
- Virtual multi-page flow mounts only pages inside the render-ahead window,
  reports asynchronous failures as structured Core errors, and retains stable
  page identity while offscreen resources are released.
- Raster print output is a transient unencrypted image-only artifact; adapters
  must not expose it as a protected source-document replacement.

## Verified correction result

Core now exposes tested thumbnail, outline, search, destination-resolution,
cross-page TextLayer selection, virtual continuous-page lifecycle, secure raster
print, password, permission, and watermark operations. Annotation drag/transform
behavior is tool-specific, and the Vanilla application exercises these paths in
Chromium. This document remains the responsibility test for future React/Vue work.
