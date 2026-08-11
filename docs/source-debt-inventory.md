# InkLayer Source Debt Inventory

> Audit date: 2026-08-10
> Purpose: prevent legacy debt from being copied into `inklayer-core`

## 1. Severity definition

- **P0**: data loss, security boundary, incorrect canonical data, or cross-instance
  corruption risk. Must be addressed before the affected engine path is exposed.
- **P1**: lifecycle, correctness, packaging, or architectural debt that blocks the
  whitepaper completion contract.
- **P2**: maintainability, diagnostics, test quality, or performance debt that must
  be resolved before release preparation.

## 2. P0 findings

### P0-01 — Unsupported native annotations are marked deleted

Current behavior marks every PDF.js annotation deleted before checking decoder
support. Link, Widget, Form, and other unsupported annotations may therefore be
hidden or altered merely by enabling native annotation import.

Evidence:

- Decoder support selection:
  `inklayer-react/src/extensions/annotator/painter/transform/transform.ts:103-141`.
- Unconditional annotationStorage mutation:
  `inklayer-react/src/extensions/annotator/painter/transform/transform.ts:144-168`.

Core treatment:

- normalize and decode one annotation first;
- return an explicit supported/unsupported result;
- isolate annotationStorage mutation behind a separate function;
- mutate only successfully imported, intentionally replaced annotations;
- test Link, Widget, malformed supported input, and one valid supported input.

### P0-02 — Stage bounds are mislabeled as PDF user-space geometry

`konvaClientRect` is stored in unscaled, top-left Konva Stage space. The existing
mapper copies it into geometry and labels the target `pdf-user-space`.

Evidence:

- Stage owns viewport scale:
  `inklayer-react/src/extensions/annotator/painter/index.ts:348-359`.
- Mapper relabeling:
  `inklayer-react/src/core/adapters/store.mapper.ts:130-204`.
- Actual export conversion multiplies by viewport scale:
  `inklayer-react/src/extensions/annotator/painter/annot/geometry.ts:50-52`.

Impact: persisted coordinates may be interpreted with the wrong origin, scale,
and rotation. Bounding-box approximations also lose paths and quad geometry.

Core treatment: explicit `konva-stage | pdf-user-space` union, centralized
rotation-aware transforms, and no implicit cast between spaces.

### P0-03 — Serialized Konva input is not validated

Painters call `Konva.Node.create` directly, and exporters parse snapshots in
multiple files. The shared parser checks only that JSON produced an object.

Evidence:

- Minimal parser:
  `inklayer-react/src/extensions/annotator/painter/annot/parse.ts:6-37`.
- Direct node construction:
  `inklayer-react/src/extensions/annotator/painter/editor/editor.ts:353-393`.
- Direct JSON parsing remains in individual writers, for example
  `inklayer-react/src/extensions/annotator/painter/annot/parse_cloud.ts:87` and
  `inklayer-react/src/extensions/annotator/painter/annot/parse_line.ts:31`.

Impact: oversized/deep snapshots, dangerous keys, non-finite values, huge points
arrays, or embedded data URLs can enter both rendering and export paths.

Core treatment: one bounded parser validating depth, nodes, class names, attrs,
point counts, image sizes, dangerous keys, finite numbers, and annotation/group ID.

### P0-04 — Module/global DOM state prevents safe multi-instance use

Examples:

- body-level Painter state:
  `inklayer-react/src/extensions/annotator/painter/index.ts:426-440`;
- body-level selector hover:
  `inklayer-react/src/extensions/annotator/painter/editor/selector.tsx:489-497`;
- documentElement cursor variable:
  `inklayer-react/src/extensions/annotator/utils/utils.ts:96-111`;
- module-level FreeText singleton and fixed ID:
  `inklayer-react/src/extensions/annotator/painter/editor/editor_free_text.tsx:27-50`
  and `inklayer-react/src/extensions/annotator/painter/editor/editor_free_text.tsx:183-186`;
- page wrapper ID based only on page number:
  `inklayer-react/src/extensions/annotator/painter/index.ts:334-345`.

Impact: one instance can change another instance's cursor, mode, selection hover,
FreeText input, or DOM identity; destroying one can remove shared global state.

Core treatment: generated instance ID, root-scoped state, per-instance overlay and
timer registries, and namespaced DOM/Konva events.

### P0-05 — Canonical annotation is split across two facts

The nominal Core model excludes Konva state and comments while the operational
Store contains the fields required for redraw, permissions, comments, and export.
The mapper hides essential information in untyped `extensions`.

Evidence:

- Nominal restriction:
  `inklayer-react/src/core/annotation.core.ts:464-533`.
- Operational Store:
  `inklayer-react/src/extensions/annotator/const/definitions.tsx:166-185`.
- Essential renderer/legacy data in extensions:
  `inklayer-react/src/core/adapters/store.mapper.ts:166-190`.

Impact: event payloads and permission callbacks can receive incomplete or
approximated data; round trips depend on undocumented extension structure.

Core treatment: one schema-versioned Annotation with first-class renderer state,
comments, author, source, bounds, coordinate space, and preserved extensions.

## 3. P1 findings

### P1-01 — Viewer cleanup does not own the whole PDF.js graph

The current cleanup calls `viewer.cleanup()` and destroys the loading task, but
does not explicitly detach Viewer/LinkService documents, abort Range fetches, or
destroy the previously ready PDF document before replacement/unmount.

Evidence:

- React cleanup: `inklayer-react/src/hooks/usePdfViewer.ts:117-124` and
  `inklayer-react/src/hooks/usePdfViewer.ts:303-315`.
- Vue cleanup: `inklayer-vue/src/composables/usePdfViewer.ts:114-122` and
  `inklayer-vue/src/composables/usePdfViewer.ts:294-300`.

Core treatment: one load session owns task, fetch controller, document, Viewer
association, LinkService association, and listeners; cleanup is awaited and
idempotent.

### P1-02 — Range support is inferred from error text and unchecked responses

Current transport does not verify HEAD status, GET status, 206, `Content-Range`,
body length, credentials, custom headers, or abort state. Fallback classification
uses substrings such as `range`, `content-length`, `cors`, and `unexpected server
response`.

Evidence: `inklayer-react/src/hooks/usePdfViewer.ts:42-47` and
`inklayer-react/src/hooks/usePdfViewer.ts:130-143`.

Core treatment: typed range failure categories and transport integration tests
against real HTTP responses.

### P1-03 — Worker configuration is bundler-specific and global at import time

Both repositories import the worker through Vite `?url` and assign PDF.js global
state at module evaluation.

Evidence: `inklayer-react/src/hooks/usePdfViewer.ts:13-15` and
`inklayer-vue/src/composables/usePdfViewer.ts:21-22`.

Core treatment: explicit version-matched `workerSrc`, conflict detection, and
Node/SSR-safe root import.

### P1-04 — Framework Stores are engine dependencies

Painter reads and writes Zustand or Pinia directly. React `getByPage` scans the
full Map and exposes mutable Map-shaped state. Vue adds Painter itself to Pinia,
further mixing engine ownership with UI state.

Evidence:

- React Store contract and scan: `inklayer-react/src/extensions/annotator/store/index.ts:14-47`.
- Painter direct Store access, for example:
  `inklayer-react/src/extensions/annotator/painter/index.ts:115-159`.
- Vue Store painter state:
  `inklayer-vue/src/stores/annotationStore.ts:22-37` and
  `inklayer-vue/src/stores/annotationStore.ts:160-219`.

Core treatment: one immutable-boundary repository with page index, subscriptions,
selection consistency, duplicate detection, and idempotent destroy.

### P1-05 — React Painter skips editor destruction

React clears `editorStore` without calling editor `destroy`; Vue contains the
corresponding explicit cleanup.

Evidence:

- React: `inklayer-react/src/extensions/annotator/painter/index.ts:1251-1261`.
- Vue: `inklayer-vue/src/extensions/annotator/painter/index.ts:1256-1261`.

Some editors own window listeners, so Map clearing alone leaks behavior.

Core treatment: resource registry and create/destroy stress tests.

### P1-06 — Konva events are un-namespaced and broadly removed

Base Editor registers mouse and touch handlers on a shared Stage and calls
`stage.off('mousedown')`, etc. without a namespace or exact callback.

Evidence: `inklayer-react/src/extensions/annotator/painter/editor/editor.ts:134-190`.

Impact: disabling one editor can remove another consumer's listener. This is
especially risky during tool switching and multi-instance/page lifecycle.

Core treatment: namespaced listeners or a single Stage router owned by the page.

### P1-07 — Import/export is coupled to Viewer, download, and i18n

The PDF/Excel module imports `file-saver`, `i18next`, `pdf-lib`, PDF.js Viewer
types, and all writer implementations together.

Evidence: `inklayer-react/src/extensions/annotator/painter/annot/index.ts:1-21`.

Impact: content generation is not independently testable/consumable, translations
affect workbook bytes, and viewer-only consumers risk heavy dependencies.

Core treatment: byte builders in separate entries; download helper and Translator
are separate browser/application concerns.

### P1-08 — CSS depends on application and PDF.js internals

Painter CSS consumes `--accent-contrast` and PDF.js editor cursor variables,
while dynamic cursor state is written globally.

Evidence: `inklayer-react/src/extensions/annotator/painter/index.scss:23-90`.

Core treatment: minimal root-scoped CSS and documented `--inklayer-*` fallbacks.

### P1-09 — Global Adapter registry contradicts instance ownership

The existing nominal Core exposes a module-global mutable Adapter registry even
though Konva and PDF.js are already fixed engine choices.

Evidence: `inklayer-react/src/core/adapters/adapter.interface.ts:224-249`.

Core treatment: remove it; use direct internal modules and instance factories.

### P1-10 — Required API contains an empty method

`Painter.resetPdfjsAnnotationStorage()` is an empty public method.

Evidence: `inklayer-react/src/extensions/annotator/painter/index.ts:968-972`.

Core treatment: do not migrate the method unless it receives a tested, explicit
contract. No public stub or empty entry is allowed.

## 4. P2 findings

### P2-01 — Logging bypasses a structured channel

Legacy modules call `console.warn`, `console.error`, and `console.log` directly,
including permission resolver failures, unsupported export types, metadata
inspection, missing Store IDs, and color parsing.

Examples:

- permission resolver: `inklayer-react/src/extensions/annotator/permissions/permission_controller.ts:55-60`;
- export dispatch: `inklayer-react/src/extensions/annotator/painter/annot/index.ts:71-78`;
- color parser: `inklayer-react/src/extensions/annotator/utils/utils.ts:13-35`.

Core treatment: structured errors/warnings and Logger port; no sensitive comment
or PDF contents in messages.

### P2-02 — Duplicate utility responsibilities

Color parsing, dates, coordinate conversion, snapshot parsing, and PDF object
conversion are spread across utils, decoders, and writer classes.

Evidence:

- duplicate color interpretations:
  `inklayer-react/src/extensions/annotator/utils/utils.ts:6-59`;
- decoder coordinate formulas:
  `inklayer-react/src/extensions/annotator/painter/transform/decoder.ts:34-75`;
- writer geometry conversion:
  `inklayer-react/src/extensions/annotator/painter/annot/geometry.ts:9-52`.

Core treatment: one module per responsibility under Domain/Geometry/renderer
boundaries.

### P2-03 — Deep clone through JSON serialization

Delete undo clones arbitrary values with `JSON.parse(JSON.stringify(value))`.

Evidence: `inklayer-react/src/extensions/annotator/painter/delete_undo.ts:42-48`.

Impact: unsupported values are silently changed, and the type assertion pretends
the result remains `T`.

Core treatment: clone validated canonical annotation/comment data explicitly or
use structured cloning within a documented data contract.

### P2-04 — Tests over-mock critical engine paths

Viewer tests replace PDF.js classes entirely. Painter navigation tests construct
objects from `Painter.prototype`, and most editor tests use mocked canvas contexts.
These tests are useful for pure behavior but cannot prove a working engine.

Evidence:

- React PDF.js mocks:
  `inklayer-react/src/hooks/__tests__/usePdfViewer.test.tsx:5-70`.
- React prototype-only navigation setup:
  `inklayer-react/src/extensions/annotator/painter/__tests__/painter_navigation.test.ts:41-88`.

Core treatment: retain focused unit tests and add real PDF.js/Konva integration,
Vanilla browser E2E, and package consumer tests.

### P2-05 — Test runs are green but noisy

Baseline warnings include React `act` deprecation, missing i18n initialization,
Vue missing translation keys, and Sass legacy API deprecation. Green assertions
do not imply a clean consumer console.

Core treatment: fail browser E2E on unexpected console error/warning, except for
an explicit allowlist owned by the test.

### P2-06 — Source comments and public contracts do not meet Core rules

Legacy source mixes Chinese/English comments, has undocumented named methods,
mechanically descriptive comments, `any`, `@ts-ignore`, and framework types in
low-level definitions.

Core treatment: implement the whitepaper's English file-header/JSDoc quality gate;
do not copy legacy comments as-is.

## 5. Test gaps to convert into Phase 1-7 gates

| Gap | Required proof |
|---|---|
| Canonical schema | runtime validation fixtures, extension preservation, schema version errors |
| Repository | duplicate IDs, page index, selection consistency, subscribe/unsubscribe, destroy |
| Snapshot safety | depth/node/string/image/points/dangerous-key/finite limits, strict and lenient |
| Viewer | real URL/data/range/fallback, race, retry, cancel, document release, double destroy |
| Worker | empty source and conflict behavior |
| SSR | Node import of packed root entry |
| Annotation tools | real create/load/update/select/transform/delete fixture for every type |
| Lifecycle | two instances and 100 create/destroy iterations |
| Native import | supported types, malformed isolation, unsupported annotation preservation |
| PDF export | all types, rotations/scales, round trips, bad snapshot policy |
| Excel export | real workbook bytes, rows/comments/references/authors/dates |
| CSS | real emitted CSS entry, scoped roots, two instances, documented variables |
| Package | tarball install, all implemented entries, types, production build |

## 6. Migration guardrails

Before adapting any Viewer, editor, decoder, or exporter module:

1. cite both framework implementations and relevant tests;
2. state the Core coordinate space and ownership contract;
3. create a failing behavior test in Core;
4. remove framework Store/i18n/icon/global DOM dependencies;
5. route snapshots and geometry through their single validated modules;
6. register every listener, timer, DOM node, Stage, and pending promise with an
   instance owner and teardown path;
7. do not expose the module until the path is real and tested.
