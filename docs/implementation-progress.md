# InkLayer Core Implementation Progress

> Last updated: 2026-08-12
> Overall status: **first complete Core baseline delivered; release-candidate work tracked in `docs/roadmap.md`**

## Scope controls

- Only `inklayer-core/**` has been modified.
- `inklayer-react` and `inklayer-vue` were read and tested without source changes.
- No package was published and no release was created. The complete baseline was
  committed as `1b68cde` and pushed to `origin/main` on 2026-08-11.
- `WHITEPAPER.md` remains an ignored local implementation contract; maintained
  public planning continues in `docs/roadmap.md`.

## Phase status

| Phase | Status | Evidence |
|---|---|---|
| Phase 0 — source audit and behavior baseline | Complete | Three audit documents, source/test evidence, reference test baseline |
| Phase 1 — project skeleton and quality gates | Complete | Package metadata, root API, CI, Vanilla skeleton, all local gates green |
| Phase 2 — Domain, validation, repository, compat | Complete | Canonical model, validation, collaboration functions, repository, legacy fixtures |
| Phase 3 — Viewer Engine | Complete | Real PDF.js loading, Range, concurrency, worker ownership, lifecycle, package entry |
| Phase 4 — Annotation Engine and Konva renderer | Complete | Safe snapshots, facade, all tools, gestures, Konva ownership, collaboration, lifecycle |
| Phase 5 — native import and PDF/Excel export | Complete | Isolated PDF.js decoding, coordinate conversion, PDF dictionaries, XLSX bytes |
| Phase 6 — CSS, browser platform, Vanilla E2E | Complete | Scoped CSS, download boundary, two-instance demo, real Chromium E2E |
| Phase 7 — optimization and release preparation | Complete | Dependency/dead-code audits, consumer install, performance baseline, docs, final gate |
| Boundary correction — document features and direct interaction | Complete | Tested thumbnails, outline, search, TextLayer selection, tool-specific transforms, Vanilla E2E |
| Extended Viewer — security, layout, highlight, watermark, cross-page, print | Complete | Real password retry, permissions, virtual continuous flow, search highlight, cross-page selection, Canvas/PDF watermark, vector print and secure raster print delivered |

## Phase 0 record

### Goals

- inventory Viewer, annotation tools, persistence, permissions, comments,
  references, native import, export, and CSS behavior;
- compare React and Vue without assuming equivalence;
- identify unique fixes and tests on each side;
- establish the real coordinate and scale contract;
- record legacy debt that must not enter Core;
- verify both reference test baselines.

### Outputs

- `docs/source-behavior-baseline.md`;
- `docs/source-difference-matrix.md`;
- `docs/source-debt-inventory.md`;
- this progress record.

### Source facts established

- The live engine source of truth is `IAnnotationStore`, including exact
  `konvaString` and unscaled Stage bounds.
- The existing nominal Core model is not safe to promote because it labels Stage
  bounds as PDF user space and hides essential state in `extensions`.
- Stored legacy coordinates are top-left, unscaled `konva-stage` coordinates.
- React and Vue share tool behavior but contain different fixes and regression
  coverage; neither side is the sole authority.
- Vue explicitly destroys editors; React supplies broader navigation,
  serialization, and PDF export regressions.
- Native import currently marks unsupported PDF annotations deleted.
- Existing snapshot parsing does not enforce safety limits.
- Viewer concurrency generation is useful, but Range and resource ownership need
  a new implementation.
- Current global DOM/CSS state is incompatible with multi-instance Core.

### Design choices for subsequent phases

1. Canonical annotations use zero-based `pageIndex`.
2. Coordinate spaces are explicitly `konva-stage` or `pdf-user-space`.
3. Versioned Konva renderer state is first-class canonical data.
4. `SELECT` is an engine tool, not a persisted annotation type.
5. Current permission, reference, numbering, and immutable comment semantics are
   preserved unless tests prove a contradiction.
6. Cloud and Arrow fidelity/round-trip behavior is preserved.
7. Native annotation decoding and PDF.js annotationStorage mutation are separate.
8. Existing global Adapter registry and hybrid integration facade are not ported.
9. All browser/global resources are instance-owned.

### Commands and actual results

```text
git -C inklayer-react status --short
git -C inklayer-vue status --short
```

Both reference worktrees were clean before and after testing.

```text
cd inklayer-react && npm test -- --runInBand
```

- Initial sandboxed attempts stopped before Jest assertions because Sass tooling
  attempted localhost access and received `EPERM 127.0.0.1:62059`.
- Approved rerun result: 45 suites passed, 228 tests passed, 0 snapshots.
- Runtime: 23.3 seconds reported by Jest.
- Non-failing warnings: deprecated ReactDOM test `act`, missing test i18n instance,
  and Node `punycode` deprecation.

```text
cd inklayer-vue && npm test
```

- Result: 44 test files passed, 301 tests passed.
- Runtime: 7.96 seconds reported by Vitest.
- Non-failing warnings: Sass legacy JS API and missing i18n keys.

### Risks carried forward

- No real legacy backend payload or private production PDF fixture was present;
  Phase 2 compatibility claims must remain limited to repository fixtures.
- Existing Viewer tests mock PDF.js and do not prove Range/lifecycle correctness.
- Existing editor coverage is incomplete and cannot prove full-tool creation.
- Rotation behavior has export-oriented evidence but still needs centralized
  integration fixtures before the geometry contract is considered implemented.
- Image/signature/stamp snapshots require explicit input-size and data-URL limits.

### Self-review

- Every major conclusion in the Phase 0 documents cites source or tests.
- Differences are recorded per subsystem; the audit does not claim blanket
  React/Vue equivalence.
- High-risk behaviors have explicit required Core tests.
- No Stub, empty package entry, production source, or framework adapter was added.

## Phase 1 record

### Outputs

- npm package metadata and lockfile with ESM, CommonJS, and declaration builds;
- strict TypeScript, ESLint, Vitest, Vite, documentation, and package gates;
- Node/SSR-safe root entry exposing only implemented version and error contracts;
- a Vanilla consumer skeleton that imports the real package root;
- CI running the same `npm run check` command used locally.

### Toolchain and verification

- Node 24.18.0;
- TypeScript 6.0.3, Vite 8.2.1, Vitest 4.1.10, ESLint 9.39.5;
- 2 test files and 3 tests passed;
- ESM and CommonJS root bundles plus declarations built successfully;
- Vanilla production build completed successfully;
- package checks validated 3 root export targets and 13 packed files;
- `npm audit --omit=dev` reported 0 vulnerabilities.

### Public surface at the end of Phase 1

Only `CORE_VERSION`, `ANNOTATION_SCHEMA_VERSION`, `InkLayerError`, and its error
types are exported. Viewer, annotation, export, style, and other package entries
remain absent until they have real implementations and consumer tests.

### Self-review

- all production source participates in strict type checking;
- package build output is absent from source control and reproducible;
- the example consumes the package rather than duplicating constants;
- no unfinished API is represented by a stub or empty package export.

## Next phase entry criteria

Phase 2 may proceed without a product decision. Its public API is exposed only
after validation, repository, permission, reference, comment, and legacy fixture
tests pass together.

## Phase 2 record

### Outputs

- one canonical `Annotation` carrying semantic content, comments, authorship,
  explicit coordinate space, exact versioned Konva state, provenance, and
  preserved unknown extensions;
- runtime parsing for annotations, collections, comments, users, appearance,
  renderer envelopes, sources, and JSON-compatible extensions;
- immutable comment helpers, one permission contract, deterministic reference
  numbering, and stable reference-label synchronization;
- a detached in-memory repository with page indexes, selection reconciliation,
  synchronous subscriptions, duplicate protection, and idempotent destruction;
- isolated legacy parser/serializer under `src/compat/legacy` with a source-derived
  fixture and structured warnings for preserved or omitted fields.

### Compatibility decisions

- legacy `pageNumber` is converted from one-based to canonical zero-based
  `pageIndex`;
- legacy `konvaClientRect` is truthfully labeled `konva-stage`;
- `konvaString` is preserved byte-for-byte in renderer state;
- unknown legacy fields survive under `extensions.legacyUnknown` and are restored
  on serialization;
- canonical PDF-space bounds are rejected by legacy serialization rather than
  being silently mislabeled;
- annotation types without a verified historical tool number fail with
  `ANNOTATION_TYPE_UNSUPPORTED`.

### Verification

- strict production and test type checking passed;
- ESLint and documentation gates passed for 29 maintained code files;
- 8 test files and 33 tests passed;
- the legacy fixture round-tripped all verified and unknown fields exactly;
- ESM, CommonJS, declarations, Vanilla build, and package checks passed;
- built root size: 26.91 kB ESM and 21.83 kB CommonJS before gzip.

### Self-review

- domain and repository modules have no DOM, PDF.js, Konva, Zustand, Pinia, or
  RxJS dependency;
- all external annotation and legacy values are validated rather than cast into
  the engine;
- selection cannot reference absent annotations and removal reconciles it;
- permission overrides receive the canonical object and deny on exceptions;
- full Konva JSON graph validation remains deliberately unexposed until the
  single Phase 4 snapshot parser is implemented.

## Next phase entry criteria

Phase 3 can begin without a product decision. Viewer construction must remain
SSR-safe, and PDF.js environment access may occur only when a browser-facing
factory or load operation is invoked.

## Phase 3 record

### Outputs

- SSR-safe `createPdfViewerEngine` factory from both root and
  `inklayer-core/viewer`;
- URL and copied byte sources, explicit/disabled/automatic Range policies,
  credentials, headers, and configurable chunk size;
- centralized worker ownership with empty-source validation and active
  multi-instance conflict detection;
- validated HEAD plus initial GET Range probing, strict 206/Content-Range and
  byte-length checks, AbortSignal propagation, and distinct unsupported/network
  error codes;
- generation-guarded load, cancel, reload, retry, listener isolation, optional
  PDF.js web Viewer ownership, and idempotent destruction;
- an interactive Vanilla metadata loader and documented worker contract.

### Lifecycle and environment decisions

- PDF.js runtime imports occur only inside `load()`;
- browser loading uses the standard build while a runtime-only Node path uses
  the PDF.js legacy build, keeping root imports safe and browser bundles singular;
- callers' bytes and headers are snapshotted before the first asynchronous step;
- event listeners and returned handles receive detached containers while the
  intentionally shared PDF.js document proxy remains explicit;
- `auto` falls back only for `PDF_RANGE_UNSUPPORTED`, never for ordinary network
  or HTTP failures;
- PDF.js stays an external library dependency in Core bundles.

### Verification

- 12 test files and 50 tests passed, including a real PDF.js load of a generated
  valid one-page PDF;
- load A/load B, loading cancel, loading destroy, ready reload, error retry,
  Range fallback, listener errors, and double destroy are covered;
- strict type, lint, and documentation checks passed for 40 code files;
- ESM, CommonJS, declarations, root/viewer imports, Vanilla, and npm pack checks
  passed;
- root ESM: 26.66 kB; Viewer implementation chunk: 12.13 kB before gzip;
- the Vanilla consumer bundles one standard PDF.js build rather than both
  standard and Node legacy builds;
- runtime dependency audit reported 0 vulnerabilities.

### Self-review

- no PDF.js global is changed at module import time;
- every load generation owns and aborts its Range controller and loading task;
- stale promises cannot publish ready or error state over a newer generation;
- Viewer and LinkService detach their document before loading-task destruction;
- CJS and ESM package entries synchronously import without executing PDF.js.

## Next phase entry criteria

Phase 4 can begin without a product decision. It must establish the one and only
validated Konva snapshot parser before any renderer/editor consumes serialized
state, then expose the Annotation Engine only after all persisted tool kinds have
real creation paths.

## Phase 4 record

### Outputs

- one `parseAndValidateKonvaSnapshot` entry enforcing input length, plain JSON
  objects, depth, node count, allowed classes, typed numeric attrs, finite points,
  image/data URL size, dangerous keys, root Group, and annotation/group ID;
- `createAnnotationEngine` from root and `inklayer-core/annotation`, backed only
  by the canonical repository;
- real validated builders for all 16 persisted canonical types, including text
  markup line geometry, line/path tools, image stamps, notes, arrows, and outward
  quadratic Cloud waves;
- instance-owned dynamic Konva Stage, Layer, Transformer, nodes, image hydration,
  author-label overlay, hover state, page registry, and namespaced listeners;
- Core-owned Stage pointer gestures for drag tools, freehand/signature,
  Note/FreeText clicks, and multi-point Polygon/Polyline/Cloud; text markup uses
  normalized browser selection input and Stamp uses image-backed creation input;
- selection, transform write-back, semantic updates, deletion, navigation,
  comments/status permissions, tool state, typed events, and listener isolation;
- actual Clock, IdGenerator, Logger, and TextInputProvider consumers plus an
  instance-owned browser textarea default.

### Safety and lifecycle decisions

- all creation, load, transform, and semantic update paths validate canonical
  data and exact renderer state before rendering or persistence;
- strict snapshot loading fails; lenient loading records IDs, reports observable
  warnings, and skips rendering unsafe entries;
- Pointer gestures and temporary inputs are owned per page/engine; there is no
  body class, fixed ID, singleton editor, global timer, or shared DOM registry;
- supplied repositories remain consumer-owned, while default repositories are
  destroyed by their engine;
- image callbacks, Konva listeners, nodes, overlays, stages, pending text input,
  repository subscription, and root state are released idempotently;
- React/Vue integration can focus on product UI and subscribe/call the facade;
  it does not need a second Painter/editor state machine.

### Verification

- 15 test files and 71 tests passed;
- every persisted type is created through the public facade and revalidated;
- pointer creation and Transformer write-back use the internal Konva runtime
  seam, not a second test-only state machine;
- two painter instances detach independently;
- 100 create/destroy cycles leave no root class or dataset state;
- comments and statuses retain renderer state and apply distinct permission
  actions;
- strict/lenient, listener failure, external repository ownership, text input
  cancellation, tool events, navigation primitives, and selection are covered;
- strict type, lint, documentation, ESM/CJS/declarations, Vanilla, and package
  checks pass for 56 maintained code files and 9 export targets;
- Annotation implementation chunk: 55.45 kB ESM before gzip; Konva remains an
  external runtime dependency.

### Self-review

- Painter and all Konva node types remain internal;
- selection is a transient tool, never a persisted annotation type;
- hover opacity is removed before transform serialization so transient UI state
  cannot enter canonical renderer state;
- caller geometry is bounded before Cloud/path computation;
- Node/SSR root and annotation imports do not evaluate Konva.

## Next phase entry criteria

Phase 5 can begin without a product decision. Native decoding must decide support
before any PDF.js annotationStorage mutation, isolate malformed entries, and pass
all produced snapshots through the same validator. Exporters must generate bytes
only; browser download remains a separate platform helper.

## Phase 5 record

### Outputs

- centralized PDF bottom-left/user-space to unscaled top-left Stage conversion
  for rotations 0, 90, 180, and 270, including non-zero page boxes;
- isolated PDF.js annotation decoding for Text/Note, FreeText, Line/Arrow,
  Square, Circle, Polygon, PolyLine, Highlight, Underline, StrikeOut, Ink, and
  InkLayer custom Arrow/Cloud/FreeText forms;
- reply decoding into canonical comments, per-item malformed warnings, and a
  separate annotationStorage helper that hides only confirmed imported IDs;
- `inklayer-core/import/pdfjs`, `inklayer-core/export/pdf`, and
  `inklayer-core/export/excel` ESM, CommonJS, and declaration entries;
- strict/lenient PDF export preflight, native dictionary generation, rotated
  geometry, colors, content, author/date metadata, replies, and custom
  Ink-based Arrow/Cloud round-trip markers;
- unsupported existing PDF annotation retention while replaceable supported
  dictionaries are regenerated from the canonical annotation source of truth;
- XLSX byte generation with stable annotation/comment sheets, references,
  authorship, dates, one-based display page numbers, and localizable labels.

### Packaging and dependency decisions

- exporters return only `Uint8Array` content; filenames, browser downloads,
  persistence, and upload behavior remain outside format code;
- ExcelJS, pdf-lib, PDF.js, and Konva are externalized from library bundles and
  heavy format exporters are not re-exported from the root or Viewer entry;
- a runtime `uuid` override removes ExcelJS's transitive vulnerable uuid 8
  resolution without changing the public workbook API;
- CSS color parsing is centralized and browser-independent;
- all native and exporter renderer geometry passes through the same validated
  Konva snapshot representation.

### Verification

- 19 test files and 83 tests passed on the declared Node 24.18 runtime;
- all 16 canonical types were written to PDF and re-read as low-level
  dictionaries, including subtype, Rect, QuadPoints/InkList, color, content,
  author, modification date, custom markers, and reply linkage;
- unsupported Link dictionaries survive PDF regeneration;
- strict preflight rejects before writing and lenient mode reports and skips the
  individual invalid annotation;
- generated workbooks were reloaded and checked for sheets, localized headers,
  semantic values, comments, references, authors, dates, and byte output;
- strict type, lint, documentation, ESM/CommonJS/declaration build, and format
  integration checks passed for 69 maintained files;
- PDF export entry: 8.79 kB ESM; Excel export entry: 3.58 kB ESM before gzip,
  with heavy dependencies remaining external.

### Self-review

- unsupported native annotations are never marked hidden by decoding alone;
- one malformed native item cannot abort decoding of other page annotations;
- PDF page rotation and coordinate conversion are no longer duplicated inside
  import/export adapters;
- translator callbacks cannot alter stored type/status/reference semantics;
- React and Vue require no PDF dictionary or workbook construction logic.

## Next phase entry criteria

Phase 6 can proceed without a product decision. It must expose one namespaced CSS
entry, keep browser globals instance-owned, make the Vanilla example exercise the
real Viewer/Annotation/import/export APIs, and add browser-level multi-instance,
interaction, export, reload, and teardown evidence.

## Phase 6 record

### Outputs

- a generated `inklayer-core/style` entry at `dist/inklayer-core.css`, scoped
  exclusively below `.inklayer-engine` and instance/page data attributes;
- a documented set of 17 `--inklayer-*` variables with standalone fallbacks for
  labels, stacking, FreeText input, focus, and every cursor family;
- reversible root/page metadata, initial and dynamic tool cursor state,
  instance-local author labels, accessible FreeText input, and no body/html state;
- typed `DownloadProvider`, `createBrowserDownloadProvider`, and `downloadBlob`
  with one-shot anchor/object-URL ownership independent from content exporters;
- a self-contained framework-free demo that creates its PDF at runtime, renders
  it with PDF.js, attaches two Annotation Engines, exposes all 16 tools, and
  supports comments, selection, deletion, zoom, reload, PDF/Excel downloads, and
  destroy/remount;
- Playwright configuration and committed Chromium E2E for desktop and 390px
  mobile behavior, with CI browser installation.

### Browser evidence

- the in-app Browser independently verified page identity, meaningful DOM,
  rendered PDF canvases, crosshair cursor, pointer-drag rectangle creation,
  Transformer selection, comment update, FreeText overlay/focus/submit, zoom,
  export byte status, two-instance isolation, destroy/remount, and mobile layout;
- the manual browser run finished with zero console warnings or errors;
- desktop screenshot showed Alice's selected rectangle and blue instance-scoped
  author label beside Bob's clean independent page;
- mobile screenshot at 390×844 showed one readable column with no horizontal
  overflow;
- committed Playwright E2E creates every canonical type and checks distinct CSS
  variable overrides for Alice and Bob.

### Verification

- 21 Vitest files and 86 tests passed before the Phase 6 browser additions;
- 2 Playwright Chromium tests passed, covering the complete tool/browser flow
  and responsive breakpoint;
- strict production/test/example/config type checks, ESLint, and documentation
  checks passed for 78 maintained files;
- Vanilla production build emitted the matching PDF.js worker, public engine
  CSS, and dynamically split format exporters;
- Chromium and its headless shell were installed only in the local Playwright
  cache, not included in the package or source tree.

### Self-review

- engine CSS contains no `body`, `html`, `:root`, toolbar, dialog, sidebar, or
  brand-theme selectors;
- consumer-specific demo CSS remains separate from the exported engine CSS;
- PDF/Excel content generation still has no filename or browser dependency;
- destroy removes only metadata owned by the matching instance;
- two engines use distinct variable scopes, stages, labels, repositories,
  Viewer generations, and teardown paths.

## Next phase entry criteria

Phase 7 can proceed without a product decision. It must audit dependency
direction and dead code, measure repeatable bundles and lifecycle performance,
install the packed tarball into a temporary consumer, finish public architecture,
API/data/legacy/integration documentation, and run the complete final gate without
publishing or pushing.

## Phase 7 record

### Outputs

- a source import-graph gate covering 46 production files, rejecting cycles,
  framework dependencies, and forbidden layer directions;
- a tarball consumer gate that installs the packed package into a temporary
  TypeScript/Vite project and verifies every JavaScript entry, declarations,
  public CSS, production build, and Node-safe root import;
- a repeatable benchmark covering transitive entry sizes, repository/import/export
  workloads, Annotation lifecycle stress, and real Chromium lifecycle timings;
- public architecture, API, data-model, CSS, legacy compatibility, framework
  integration, performance, and final implementation-report documentation;
- a package audit that verifies 20 export targets and 148 packed files without
  source, tests, workspace paths, empty public entries, or missing declarations;
- cleanup of two type-only dependency cycles and generated Playwright output.

### Final verification

- `npm run check` passed on Node 24.18.0: strict production/test typecheck,
  ESLint, 84-file comment audit, dependency graph, 21 Vitest files with 87 tests,
  two Playwright Chromium tests, library build, Vanilla production build, package
  validation, and packed-consumer validation;
- `npm audit --omit=dev` reported zero vulnerabilities;
- all seven public package entries are non-empty and installable from the tarball;
- React and Vue reference worktrees remained clean;
- no TODO/FIXME, `_pending`, `as any`, production typecheck exclusion, framework
  dependency, or unscoped body/html state remains in maintained Core code;
- final transitive Core entry sizes are Viewer 12,387 bytes, Annotation 56,911
  bytes, PDF export 29,543 bytes, and Excel export 16,741 bytes;
- 100 Annotation create/destroy cycles completed in 1.17 ms in the recorded local
  baseline, with resource cleanup also asserted by lifecycle tests.

### Final design and release decisions

- React and Vue integrations remain product UI adapters: Core owns PDF lifecycle,
  annotation interaction/rendering, persistence semantics, import/export, and
  instance-scoped engine CSS;
- format libraries remain on secondary entries and are dynamically loaded by the
  Vanilla example, so they do not enter Viewer or initial application code;
- the package remained at local version `0.1.0`; that Phase 7 run performed no
  publish, release, push, or reference-framework mutation. The reviewed baseline
  was pushed later as recorded at the top of this document.

### Residual risks

- compatibility evidence is limited to repository fixtures because private
  production payloads and PDFs were not available;
- browser E2E currently runs Chromium only; Safari/WebKit and Firefox need a
  downstream compatibility matrix if they become supported release targets;
- PDF dictionaries and round trips are structurally tested, but appearance-stream
  behavior—especially stamps—can still vary between third-party PDF readers;
- benchmark timings are local-machine baselines rather than cross-machine budgets.

### Self-review

- every Whitepaper completion item is mapped to reproducible evidence in
  `docs/final-report.md`;
- documentation values were refreshed after the final PDF Cloud path change;
- generated browser output is ignored and no generated build artifact is required
  as source input;
- all required capabilities are implemented rather than represented by stubs.

## Boundary correction record

### Outputs

- a normative Core/framework responsibility test in `docs/core-boundary.md`;
- generation-scoped outline extraction, destination resolution, ordered search,
  and cached/cancellable thumbnail rendering on the Viewer facade;
- real PDF.js TextLayer attachment and same-page DOM Range normalization to
  unscaled page rectangles through the typed `textSelected` event;
- Select-only dragging, page constraints, continuous author-label feedback, and
  tool-specific box, proportional, endpoint, vertex, move-only, or disabled
  transform affordances;
- continuous creation previews that remain transient and never enter canonical
  repository or exported state;
- a three-page source-backed Vanilla PDF demonstrating outline, search,
  thumbnails, TextLayer markup, and direct annotation interaction.

### Verification

- The latest `npm run check` passed on Node 24.18.0: strict typecheck, ESLint,
  documentation checks for 97 maintained files, a 55-file acyclic dependency
  graph, 24 Vitest files with 106 tests, two Chromium E2E tests, both builds,
  20 export targets, 172 packed files, and fresh tarball-consumer validation;
- the browser E2E performs a real mouse selection over PDF.js TextLayer text,
  creates a Highlight, verifies outline/search/thumbnail behavior, and proves
  one-to-one selected-annotation dragging with a clean console;
- `npm audit --omit=dev` reported zero vulnerabilities;
- refreshed transitive Core sizes are Viewer 27,506 bytes, Annotation 64,586
  bytes, PDF export 29,543 bytes, and Excel export 16,741 bytes.

### Boundary result

React and Vue own product presentation: sidebar/tree/list markup, search input,
toolbar, menus, dialogs, workflow composition, and persistence/download policy.
Core owns document interpretation and direct interaction: thumbnail generation,
outline/search semantics, TextLayer selection geometry, annotation rendering,
creation, hit testing, dragging, and geometry-specific transformation.

### Residual risks

- canonical text markup remains page-scoped; cross-page browser selection is
  normalized into ordered page fragments and produces one annotation per page;
- browser E2E currently targets Chromium; WebKit and Firefox need explicit
  compatibility runs before they are declared supported targets;
- Cloud is proportionally resized as a path, while Line/Arrow and
  Polygon/Polyline receive endpoint/vertex editing respectively;
- Viewer and Annotation entry sizes increased because these corrected behaviors
  now live in Core; optional format libraries remain outside those entries.

## Extended Viewer record

### Delivered

- generation-scoped password requests with `required`/`incorrect` reasons,
  retry, explicit cancellation, stale-request rejection, and an
  `awaiting-password` state that never contains credentials;
- normalized PDF permissions for print quality, copy, accessibility, content
  modification, annotation, forms, and page assembly;
- Core commands for single, continuous, facing, and continuous-facing PDF.js web
  Viewer layouts, scale changes, and page navigation;
- attached-TextLayer search highlighting with an independent active match and
  automatic restoration after page reattachment;
- cross-page DOM Range normalization into ordered page-local fragments;
- one validated watermark policy rendered by the Viewer Canvas post-pass and
  the PDF print/export backend, with optional embedded non-Latin font bytes;
- `buildPrintablePdf`, `PrintProvider`, and a browser iframe/object-URL print
  implementation with owned cleanup.
- a virtual `createPdfPageFlow` controller with stable placeholders, overscanned
  page raster/TextLayer/Annotation mounting, current-page tracking, scale rebuild,
  structured async errors, and complete resource release;
- browser-only `buildSecureRasterPrintPdf`, which renders the ready decrypted
  PDF.js document, print watermark, and canonical annotations into a transient
  image-only PDF while enforcing normalized print permissions.

### Verification

- final `npm run check`: 94 documented source/config files, 54 production files
  with no dependency cycles, 23 Vitest files and 97 tests, two Chromium E2E
  tests, library/example builds, 20 export targets, 169 packed files, and a
  fresh consumer install/typecheck/build/import;
- browser QA visibly confirmed repeated per-user Canvas watermarks, active
  TextLayer search highlighting, two-instance isolation, and zero warning/error
  logs;
- `@pdf-lib/fontkit` is external to Core bundles and enters only the secondary
  PDF export path; the built ESM PDF entry remains 11.86 kB before gzip.
- refreshed transitive Core sizes are Viewer 39,327 bytes, Annotation 69,264
  bytes, PDF export 32,600 bytes, and Excel export 16,741 bytes.

### Security and fidelity boundary

The real Mozilla PDF.js encrypted fixture now verifies required-password,
incorrect-password, successful retry, credential-free events, and ready document
state. Encrypted printing is supported through the raster path, but its output is
deliberately unencrypted, image-only, and transient. Vector-preserving encrypted
annotation/watermark output remains a backend responsibility because `pdf-lib`
does not decrypt or re-encrypt protected source documents.

## Interaction polish and executable security demo

### Delivered

- configurable, page-local Freehand batching with a 1,000ms default idle window,
  document-level release fallback, independent Konva Line strokes, and complete
  multi-entry PDF `InkList` import/export round trips;
- deterministic two-degree horizontal/vertical correction for Free-highlight;
- open Polygon/Polyline/Cloud creation previews with Polygon and Cloud closure
  deferred until double-click/double-tap completion;
- Vanilla `Print` invoking the real browser print boundary, retained `Prepare
  print` byte inspection, local PDF file loading, and an embedded encrypted PDF
  flow with required/incorrect password dialog, retry, and cancellation.

### Verification

- final `npm run check`: 94 documented files, 54 acyclic production files,
  23 Vitest files and 99 tests, two Chromium E2E tests, both builds, 20 export
  targets, 169 packed files, and fresh packed-consumer validation;
- Chromium completes an incorrect-then-correct password retry and draws two
  Freehand strokes 300ms apart that become one annotation after the idle window;
- interaction tests assert open Polygon/Cloud previews, axis-corrected
  Free-highlight points, two-Line Freehand renderer state, and two-entry PDF
  `InkList` output restored as two lines on import.

## Selection-first markup and page-safe FreeText

### Delivered

- retained `PdfActiveTextSelection` state with `getTextSelection`,
  `clearTextSelection`, and nullable `textSelectionChanged` events while preserving
  the original same-page and document events;
- explicit `text-select` pointer routing separate from existing-annotation
  `select`, plus a Vanilla contextual Highlight/Underline/Strikeout menu;
- FreeText provider requests containing page identity, canonical bounds, page
  scale, page overlay ownership, and projected DOM bounds;
- zoom-safe author-label and FreeText DOM placement without scaling UI typography.

### Verification

- integration coverage asserts scaled label render/transform projection and
  scaled page-local FreeText input requests;
- Chromium selects PDF.js text before choosing a markup action and completes the
  contextual menu flow without console warnings or errors.

## Unified Viewer zoom and gestures

### Delivered

- one closed numeric/adaptive scale contract covering `auto`, `page-actual`,
  `page-fit`, `page-width`, and `page-height`, with detached percentage state;
- bounded `getScale`, `setScale`, `zoomIn`, `zoomOut`, and `scaleChanged` Viewer
  operations plus matching PageFlow state and commands;
- framework-neutral Ctrl/Meta+wheel and two-touch recognition migrated from the
  React implementation, including factor accumulation, opposing-motion/rotation
  discrimination, midpoint anchoring, and complete listener teardown;
- PageFlow adaptive preset resolution against live page/container geometry and
  ResizeObserver refresh; Vanilla controls for zoom-out, zoom-in, preset choice,
  and resolved percentage.

### Verification

- zoom unit tests cover every preset, bounds, wheel anchoring, opposing and
  one-finger-fixed touch pinch input, and destruction;
- Chromium exercises numeric steps and adaptive presets in both single-page and
  continuous layouts before completing the full annotation/export flow.
