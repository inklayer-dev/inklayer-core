# InkLayer React/Vue Source Difference Matrix

> Audit date: 2026-08-10
> React reference: `977fe6b` (`v1.2.2`)
> Vue reference: `d97f993` (`v1.2.2`)

## 1. Reading rule

The implementations share substantial ancestry, but formatting similarity is not
treated as behavioral equivalence. Each row records the behavior adopted by Core
and the evidence that makes one side preferable or requires a new implementation.

## 2. Engine and domain matrix

| Area | React v1.2.2 | Vue v1.2.2 | Core decision |
|---|---|---|---|
| Viewer public shape | React hook returning state and snapshot values; no explicit `reload` | Vue composable returning refs plus `reload` | Command-oriented engine with `load`, `cancelLoad`, snapshot subscription, and idempotent `destroy` |
| PDF.js worker | Top-level Vite `?url` import and global assignment | Same | Explicit `workerSrc`; no module-top DOM/global side effect |
| Concurrent loading | Effect generation guard; effect cleanup destroys active task | Generation guard; explicitly destroys prior task at reload start | Preserve generation guard and await deterministic cleanup of old task/document/viewer links |
| Range transport | HEAD `Content-Length`, unchecked ranged GET | Same | New transport validates statuses and `Content-Range`, supports headers/credentials/AbortSignal |
| Viewer cleanup | `viewer.cleanup()`, null refs, loading-task destroy | Same, but catches viewer cleanup errors | New lifecycle owns and releases Viewer, LinkService document, PDF document, task, fetch, and listeners |
| Viewer tests | Stale task and native page spacing | Same two behaviors | Port both baselines, then add real integration and lifecycle coverage |
| Nominal Core model | Same file byte-for-byte | Same file byte-for-byte | Reject as canonical because it contradicts live persisted data |
| Existing Core exports | Exports integration layer | Does not export integration layer | New explicit package entries; no broad adapter/integration exports |
| Existing integration typing | Uses typed minimal `PdfJsAnnotation` | Uses `any[]`, `@ts-ignore`, and permissive legacy guard | Do not migrate integration facade; implement validated boundaries |
| Framework Store | Zustand `Map` state | Pinia/Vue refs with extra painter/data-transfer state | Replace both with one framework-free memory repository |
| Page lookup | `getByPage` scans all annotations | Same | Maintain a page index in the Core repository |
| Tool definitions | Icons embedded in definitions as React JSX | Icons/components embedded for Vue | Core exports semantic tool metadata without framework icons |
| Painter storage dependency | Direct module-global Zustand access | Direct Pinia store access | Inject repository into Annotation Engine; no second Painter store |
| Stage creation | Per-page Stage scaled by viewport | Same | Preserve observable geometry behavior with instance/page ownership |
| Painter mode CSS | Global `document.body` classes | Fixed `#InkLayer` element for some paths; provider still uses body | Instance root classes and variables only |
| Selector hover CSS | Global body class | Fixed `#InkLayer` lookup | Instance root state only |
| Editor teardown | Painter clears `editorStore` without calling `editor.destroy()` | Painter calls `editor.destroy()` before clearing | Adopt explicit editor destruction and test it |
| FreeText input | Module singleton, fixed ID, appended to body | Same | Per-engine `TextInputProvider`, root-scoped overlay, cancellable promise |
| Editor events | Repeated un-namespaced Stage events | Same | Per-instance namespace/registry; removal cannot affect another editor |
| Navigation | Scale-aware, cancellable delayed selection | Same runtime behavior | Preserve scale and cancellation; expose engine navigation command |
| Navigation tests | Dedicated page-index, scale, and cancellation tests | Dedicated highlight scale/cancellation tests | Port both sets; React also proves rendered target activation |
| Editor serialization tests | Dedicated replacement/idempotency tests | No equivalent file | Use React tests as a required Core fixture baseline |
| Hover | Coordinator, passive hover, preview, author labels | Same family with small lifecycle differences | One typed engine event/state path; preserve passive/active semantics |
| Delete undo | Annotation and comment undo controller | Same | Domain/repository feature behind engine facade; no UI snackbar in Core |
| Permissions | Canonical controller behavior | Same controller plus a UI-only control-permission helper | Preserve controller semantics; leave menu visibility helper in UI layer |
| Comments | React sidebar mutations | Equivalent Vue sidebar mutations | Move pure mutation rules into Domain; leave editors/UI outside Core |
| References | Same normalization and synchronization algorithms | Same algorithms with formatting differences | One pure Domain implementation |
| Numbering | Same safe-integer/date/page/id behavior | Same | One pure Domain implementation |
| Native import | Same decoder map and metadata inspection | Same | Rebuild normalized import boundary; do not copy side effects |
| Unsupported native annotation | All annotations marked deleted before decoder support check | Same | Explicitly preserve unsupported Link/Widget/Form objects |
| PDF export | More edge and round-trip cases in current tests | Same core writers with fewer cases | Start from shared algorithms; React tests are the broader behavioral baseline |
| Excel export | Stable number and reply test | Stable number/non-mutation test | Combine both expectations and generate bytes separately from download |
| CSS packaging | SCSS plus Radix/app variables | SCSS/Tailwind plus broad PDF.js CSS and body prefixing | Minimal standalone engine CSS with documented `--inklayer-*` variables |
| Root import | Imports framework CSS/components and browser-facing modules | Same category | Root Core import must be safe in Node/SSR; browser modules load on factory use |

## 3. Source evidence for material differences

### 3.1 Viewer reload and state ownership

React exposes hook-derived values only:

- `inklayer-react/src/hooks/usePdfViewer.ts:318-334`.

Vue exposes reactive values and an explicit reload command:

- `inklayer-vue/src/composables/usePdfViewer.ts:302-311`.

Both versions rely on top-level worker setup:

- `inklayer-react/src/hooks/usePdfViewer.ts:13-15`.
- `inklayer-vue/src/composables/usePdfViewer.ts:21-22`.

Core adopts neither framework API and instead makes lifecycle commands public.

### 3.2 Existing Core drift

The nominal `annotation.core.ts` files are byte-identical, but their surrounding
integration differs:

- React exports `./integration`: `inklayer-react/src/core/index.ts:23-24`.
- Vue stops after the Konva adapter: `inklayer-vue/src/core/index.ts:19-21`.
- Vue integration contains `any[]` and `@ts-ignore`; React has stronger nominal
  typing. This module is not an executable engine in either framework.

Core will not preserve a public `StorageFormat = legacy | core | hybrid` facade.
Compatibility is isolated under `src/compat/legacy/` as required by the whitepaper.

### 3.3 Painter destruction

React destroys Stage/hover/selection resources but only clears the editor Map:

- `inklayer-react/src/extensions/annotator/painter/index.ts:1238-1278`.

Vue explicitly destroys every editor before clearing:

- `inklayer-vue/src/extensions/annotator/painter/index.ts:1245-1287`.

Individual editors own window listeners and implement `destroy`, for example:

- Rectangle: `inklayer-vue/src/extensions/annotator/painter/editor/editor_rectangle.ts:54-57`
  and `inklayer-vue/src/extensions/annotator/painter/editor/editor_rectangle.ts:128-132`.
- Circle: `inklayer-vue/src/extensions/annotator/painter/editor/editor_circle.ts:60-63`
  and `inklayer-vue/src/extensions/annotator/painter/editor/editor_circle.ts:149-153`.

Therefore Vue contains a lifecycle fix that Core must adopt, while Core must go
further by making destruction idempotent and testing listener stability.

### 3.4 Framework-global UI state

React uses body classes for Painter and selector state:

- `inklayer-react/src/extensions/annotator/painter/index.ts:426-440`.
- `inklayer-react/src/extensions/annotator/painter/editor/selector.tsx:489-497`.

Vue moved some state to fixed `#InkLayer`, including cleanup:

- `inklayer-vue/src/extensions/annotator/painter/index.ts:444-451`.
- `inklayer-vue/src/extensions/annotator/painter/index.ts:1276-1283`.

The fixed root is still not instance-safe, and Vue's provider adds/removes a
single body class: `inklayer-vue/src/context/PdfViewerProvider.vue:335-336`.

Core uses generated instance identity and never uses body/documentElement state.

### 3.5 Tests unique to one side

React-only or materially broader baselines:

- Navigation page-index/scale/cancellation:
  `inklayer-react/src/extensions/annotator/painter/__tests__/painter_navigation.test.ts:90-137`.
- Serialized-group reuse/replacement:
  `inklayer-react/src/extensions/annotator/painter/editor/__tests__/editor_serialization.test.ts:78-113`.
- Empty text-markup geometry, FreeText boundary placement, and Cloud recognition
  round trips:
  `inklayer-react/src/extensions/annotator/painter/annot/__tests__/pdf_export.test.ts:254-578`.

Vue-only or materially broader baselines:

- Highlight navigation and zero pending timers:
  `inklayer-vue/src/extensions/annotator/painter/__tests__/painter_highlight.test.ts:61-98`.
- UI control-permission projection:
  `inklayer-vue/src/extensions/annotator/permissions/control_permissions.ts:4-34`.
- Broader mapper matrix, including every legacy tool and multiple fallbacks:
  `inklayer-vue/src/__tests__/store.mapper.test.ts:54-719`.

The Vue control-permission projection remains framework/UI-layer behavior. The
navigation, serialization, and mapper fixtures become Core behavior tests.

## 4. Shared algorithms that may be adapted, not copied wholesale

The following source families have equivalent product intent and useful
algorithms in both repositories:

- `painter/editor/*` drawing geometry;
- `painter/transform/decoder_*` native PDF normalization;
- `painter/annot/parse_*` PDF writing;
- `references/annotation_numbering.ts`;
- `references/annotation_reference.ts`;
- `components/sidebar/comment_mutations.ts`;
- permission controller default decisions;
- hover, author label, and delete-undo coordinators.

Before migration each family must receive:

1. a Core contract using canonical Annotation;
2. a test using a real or representative fixture;
3. removal of framework imports, global Store access, global CSS state, i18n,
   and direct console logging;
4. centralized geometry and snapshot parsing;
5. explicit instance resource ownership.

## 5. Core behavior choices requiring new implementation

These areas cannot safely choose either framework implementation:

- canonical data validation and schema versioning;
- safe Konva snapshot parsing;
- framework-free repository;
- structured errors and Logger port;
- PDF worker conflict management;
- abortable and validated Range transport;
- complete document/Viewer/link lifecycle;
- SSR-safe module entry;
- multi-instance root and event ownership;
- strict/lenient invalid annotation policy;
- separate PDF and Excel package entries;
- package consumer and performance baselines.

No unresolved React/Vue difference was found that requires a product-semantic
decision before Phase 1 or Phase 2.
