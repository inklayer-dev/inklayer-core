# InkLayer Source Behavior Baseline

> Audit date: 2026-08-10
> React reference: `977fe6b` (`v1.2.2`)
> Vue reference: `d97f993` (`v1.2.2`)
> Scope: read-only audit of `inklayer-react` and `inklayer-vue`

## 1. Purpose and confidence

This document records observable source behavior that InkLayer Core must either
preserve or deliberately replace. A source file existing is not treated as proof
of a working behavior; tests and executable paths are cited separately.

The existing framework repositories remain the compatibility reference, but the
Core target behavior follows its documented architecture and public contracts
when a legacy implementation conflicts with the new engine contract.

## 2. Current product capability inventory

### 2.1 Viewer capabilities

Both implementations currently provide:

- PDF loading from URL or binary `data`;
- an `enableRange` option with `true`, `false`, and `auto` modes;
- PDF.js `EventBus`, `PDFLinkService`, `PDFFindController`, `DownloadManager`, and
  `PDFViewer` construction;
- progress, metadata, loading, and error state;
- stale-load protection through a monotonically increasing load generation;
- automatic full-download fallback for errors whose message appears range-related;
- PDF.js native annotation editor disablement;
- framework lifecycle cleanup for the active loading task and viewer.

Evidence:

- React worker and PDF.js imports: `inklayer-react/src/hooks/usePdfViewer.ts:1-15`.
- React Viewer construction: `inklayer-react/src/hooks/usePdfViewer.ts:86-128`.
- React URL/data/range loading: `inklayer-react/src/hooks/usePdfViewer.ts:130-164`.
- React load-generation guard and fallback: `inklayer-react/src/hooks/usePdfViewer.ts:168-300`.
- React lifecycle cleanup: `inklayer-react/src/hooks/usePdfViewer.ts:303-316`.
- Vue corresponding construction and loading: `inklayer-vue/src/composables/usePdfViewer.ts:81-286`.
- Vue explicit reload API: `inklayer-vue/src/composables/usePdfViewer.ts:302-311`.

Observed contract:

- `data` takes precedence over `url`.
- Range mode performs a `HEAD` request, reads `Content-Length`, then issues GET
  requests with a `Range: bytes=begin-end` header.
- `auto` retries without range after a classified range failure.
- A stale loading task is destroyed; a stale resolved PDF document is also
  destroyed before returning.
- PDF.js native annotation editing is disabled because InkLayer owns annotation
  interaction through Konva.

The Viewer tests prove only stale-load suppression and preservation of PDF.js page
spacing. They do not exercise a real PDF.js lifecycle or a real HTTP Range server:

- React: `inklayer-react/src/hooks/__tests__/usePdfViewer.test.tsx:76-132`.
- Vue: `inklayer-vue/src/composables/__tests__/usePdfViewer.test.ts:59-139`.

### 2.2 Annotation tools

The framework implementations expose these product tools:

| Product tool | Legacy enum | PDF.js type/subtype | Text selection | Resizable | Draggable |
|---|---:|---|---:|---:|---:|
| Select | `SELECT` | `NONE` / `None` | No | No | No |
| Highlight | `HIGHLIGHT` | `HIGHLIGHT` / `Highlight` | Yes | No | No |
| Strikeout | `STRIKEOUT` | `STRIKEOUT` / `StrikeOut` | Yes | No | No |
| Underline | `UNDERLINE` | `UNDERLINE` / `Underline` | Yes | No | No |
| Free text | `FREETEXT` | `FREETEXT` / `FreeText` | No | Yes | Yes |
| Rectangle | `RECTANGLE` | `SQUARE` / `Square` | No | Yes | Yes |
| Circle | `CIRCLE` | `CIRCLE` / `Circle` | No | Yes | Yes |
| Freehand | `FREEHAND` | `INK` / `Ink` | No | Yes | Yes |
| Free highlight | `FREE_HIGHLIGHT` | `INK` / `Highlight` | No | Yes | Yes |
| Signature | `SIGNATURE` | `STAMP` / legacy `Caret` | No | Yes | Yes |
| Stamp | `STAMP` | `STAMP` / `Stamp` | No | Yes | Yes |
| Note | `NOTE` | `TEXT` / `Text` | No | No | Yes |
| Arrow | `ARROW` | `LINE` / legacy `Arrow` | No | Yes | Yes |
| Cloud | `CLOUD` | `POLYLINE` / `PolyLine` | No | Yes | Yes |

Evidence:

- Product enum: `inklayer-react/src/extensions/annotator/const/definitions.tsx:77-93`.
- Tool capabilities and defaults: `inklayer-react/src/extensions/annotator/const/definitions.tsx:189-436`.
- Equivalent Vue definitions: `inklayer-vue/src/extensions/annotator/const/definitions.ts:131-374`.
- Painter activation behavior: `inklayer-react/src/extensions/annotator/painter/index.ts:924-966`.

`SELECT` and `NONE` are interaction modes, not persisted annotation types. Core
must keep them out of the canonical `AnnotationType` union and represent them as
engine tools instead.

### 2.3 Annotation creation, redraw, selection, mutation, and deletion

The current Painter owns a Konva `Stage` per one-based page number. A Stage is
created at PDF page viewport dimensions and receives `viewport.scale` as its
Konva scale. Page rendering inserts or rescales this canvas:

- React stage creation: `inklayer-react/src/extensions/annotator/painter/index.ts:334-363`.
- React page insert/rescale: `inklayer-react/src/extensions/annotator/painter/index.ts:365-424`.
- Vue corresponding behavior: `inklayer-vue/src/extensions/annotator/painter/index.ts:343-433`.

Editors create one root Konva `Group` per annotation. The group ID is the
annotation ID, and editor completion serializes the whole group with `toJSON()`.
The stored client rectangle is measured in unscaled Stage coordinates:

- Group creation and ID: `inklayer-react/src/extensions/annotator/painter/editor/editor.ts:265-286`.
- Serialization into store data: `inklayer-react/src/extensions/annotator/painter/editor/editor.ts:96-129`.
- Serialized redraw: `inklayer-react/src/extensions/annotator/painter/editor/editor.ts:353-401`.

Selection and transform update both serialized Konva state and the Stage-space
client rectangle:

- React selector transform callbacks: `inklayer-react/src/extensions/annotator/painter/editor/selector.tsx:270-310`.
- Painter update routing: `inklayer-react/src/extensions/annotator/painter/index.ts:184-219`.

Existing operations include:

- load external annotations and optionally native PDF annotations;
- external data overriding a native annotation with the same ID;
- reference-number normalization after load;
- update, style update, delete, comment delete, and delete undo;
- page navigation and delayed selection after page rendering;
- text selection, passive hover, active hover, hover preview, and author labels;
- Stage detach/destroy when the associated page DOM disappears.

Evidence: `inklayer-react/src/extensions/annotator/painter/index.ts:904-1233`.

### 2.4 Legacy persisted annotation shape

The live framework engines use `IAnnotationStore`, not the existing
`src/core/annotation.core.ts` model, as their operational source of truth.

The persisted object contains:

- a stable string ID;
- optional stable document-scoped reference number;
- one-based page number;
- full serialized Konva group (`konvaString`);
- unscaled Konva Stage client rectangle (`konvaClientRect`);
- author/title, semantic tool enum, PDF.js numeric type and subtype;
- creation/modification date;
- main content, selected source text, image, and structured references;
- comments/replies, author identity, status, and structured references;
- native/import origin flag.

Evidence: `inklayer-react/src/extensions/annotator/const/definitions.tsx:124-185`.

The existing nominal Core model is not the operational source of truth. It says
that all coordinates are PDF user space and forbids Konva state, while the mapper
derives geometry directly from `konvaClientRect`, labels it `pdf-user-space`, and
preserves `konvaString` under `extensions`:

- Claimed contract: `inklayer-react/src/core/annotation.core.ts:1-17` and
  `inklayer-react/src/core/annotation.core.ts:464-533`.
- Conflicting mapper behavior: `inklayer-react/src/core/adapters/store.mapper.ts:130-204`.

Core decision: do not promote this model unchanged. Phase 2 will define one
canonical model that explicitly includes versioned renderer state, comments,
author, source, bounds, and an honest coordinate-space discriminator.

### 2.5 Permissions

Both frameworks implement the same two modes and eight actions:

- modes: `unrestricted`, `owner-only`;
- actions: create, transform, edit, delete, comment, change status, edit comment,
  and delete comment.

Evidence: `inklayer-react/src/extensions/annotator/types/annotator.ts:6-35`.

Observed owner-only behavior:

- create and comment require an authenticated user;
- transform/edit/delete/change-status require the annotation owner;
- comment edit/delete require the comment author, not the annotation owner;
- a legacy comment without stable author identity is read-only;
- a synchronous `can` callback may override the default by returning a boolean;
- `undefined` keeps the default;
- a throwing callback denies the action and reports the failure once per callback.

Evidence:

- Controller: `inklayer-react/src/extensions/annotator/permissions/permission_controller.ts:14-83`.
- Behavioral tests: `inklayer-react/src/extensions/annotator/permissions/__tests__/permission_controller.test.ts:45-152`.

Core decision: preserve these semantics, but pass the canonical Annotation
directly and report callback failures through the Logger/error channel rather
than `console.error`.

### 2.6 Comments, status, references, and numbering

Comments preserve stable ID, text, author title/identity, date, optional status,
and structured annotation references. Status values are `Accepted`, `Rejected`,
`Cancelled`, `Completed`, `None`, and `Closed`.

Evidence: `inklayer-react/src/extensions/annotator/const/definitions.tsx:136-164`.

Comment mutations are immutable at the comment-array level and preserve
unmodified fields. Main-comment and reply content maintain structured reference
metadata beside readable `#N` text:

- `inklayer-react/src/extensions/annotator/components/sidebar/comment_mutations.ts:9-62`.

Reference behavior:

- labels must match positive safe-integer `#N` tokens;
- identity is `annotationId`; label is display text only;
- invalid, missing-from-text, duplicate, or ambiguous metadata is removed;
- reference order follows first text occurrence;
- stale labels are synchronized in one pass so swaps cannot overwrite each other.

Evidence: `inklayer-react/src/extensions/annotator/references/annotation_reference.ts:6-143`.

Numbering behavior:

- valid unique positive safe integers are preserved;
- duplicate, missing, and invalid values are reassigned after the greatest
  preserved number;
- deterministic ordering uses valid date first, then page, then ID;
- both PDF date strings and strict ISO strings are recognized;
- exhaustion at `Number.MAX_SAFE_INTEGER` throws.

Evidence: `inklayer-react/src/extensions/annotator/references/annotation_numbering.ts:3-174`.

Core decision: preserve these pure-function semantics and move them to Domain.

### 2.7 Native PDF annotation import

Current decoder coverage includes:

- Circle, FreeText, Highlight, Underline, StrikeOut, Square, Ink, Line, Polygon,
  PolyLine, and Text/Note;
- custom reconstruction for Cloud, InkLayer FreeText, and Arrow using private
  PDF dictionary markers.

Evidence: `inklayer-react/src/extensions/annotator/painter/transform/transform.ts:1-14`
and `inklayer-react/src/extensions/annotator/painter/transform/transform.ts:103-141`.

Import fetches annotations from every PDF page and decorates them with one-based
page number and the corresponding PDF.js page view. It separately inspects the
raw PDF with `pdf-lib` for InkLayer metadata; inspection failure is non-fatal.

Evidence: `inklayer-react/src/extensions/annotator/painter/transform/transform.ts:37-101`.

Critical current behavior that Core must not preserve: every PDF.js annotation
is marked deleted in `annotationStorage` before the code determines whether a
decoder exists. This includes unsupported Link, Widget, and Form annotations.

Evidence: `inklayer-react/src/extensions/annotator/painter/transform/transform.ts:144-168`.

### 2.8 PDF and Excel export

Current PDF export:

- obtains bytes from the live `PDFViewer.pdfDocument`;
- loads the PDF with `pdf-lib`;
- validates that every input annotation has a supported parser, page, and
  rendered page viewport before changing the document;
- removes replaceable existing native annotation subtypes while retaining
  unsupported annotations;
- writes InkLayer annotations and returns PDF bytes;
- uses custom PDF markers to round-trip Cloud, FreeText, and Arrow behavior;
- deliberately exports Cloud and Arrow with Ink-based visual fidelity.

Evidence:

- Parser dispatch and replaceable subtype list:
  `inklayer-react/src/extensions/annotator/painter/annot/index.ts:24-62`.
- Preflight and byte generation:
  `inklayer-react/src/extensions/annotator/painter/annot/index.ts:114-163`.
- Round-trip tests:
  `inklayer-react/src/extensions/annotator/painter/annot/__tests__/pdf_export.test.ts:167-578`.

Current Excel export produces a flattened annotation/reply table, sorted by page
and descending date within a page. Stable annotation reference numbers are used
when available. Content generation still depends on framework i18n and shares a
module with browser download behavior.

Evidence: `inklayer-react/src/extensions/annotator/painter/annot/index.ts:179-242`.

Core decision: preserve byte-level and round-trip behavior, separate content
generation from download, accept translator-independent labels/options, and
place PDF/Excel code behind separate package entries.

### 2.9 Coordinate and scale contract

The observed persisted coordinate contract is:

1. Editor nodes and `konvaClientRect` use unscaled Konva Stage coordinates with
   a top-left origin.
2. The Stage itself carries the PDF viewport scale.
3. PDF.js native annotations are converted from PDF bottom-left coordinates into
   the unscaled top-left Stage space using `pageHeight = viewport.height / scale`.
4. Export applies group transforms in Stage space, multiplies points by viewport
   scale, and delegates final rotation/origin conversion to
   `viewport.convertToPdfPoint`.
5. Navigation similarly multiplies stored Stage coordinates by viewport scale
   before `convertToPdfPoint`.

Evidence:

- Stage scaling: `inklayer-react/src/extensions/annotator/painter/index.ts:348-359`.
- Native PDF to Stage conversion:
  `inklayer-react/src/extensions/annotator/painter/transform/decoder.ts:34-75`.
- Group transform and Stage-to-PDF conversion:
  `inklayer-react/src/extensions/annotator/painter/annot/geometry.ts:9-52`.
- Navigation conversion: `inklayer-react/src/extensions/annotator/painter/index.ts:1138-1158`.
- Scale regression tests:
  `inklayer-react/src/extensions/annotator/painter/__tests__/painter_navigation.test.ts:95-137`
  and `inklayer-vue/src/extensions/annotator/painter/__tests__/painter_highlight.test.ts:61-98`.

Core decision:

- Legacy `konvaClientRect` and renderer snapshots enter Core as `konva-stage`.
- They must never be relabeled as `pdf-user-space` without conversion.
- New geometry conversion will be centralized in `src/geometry/` and use PDF.js
  viewport conversion for rotation-aware boundaries.
- Exact renderer state remains necessary for paths, transforms, images, text
  markup groups, and Cloud/Arrow fidelity.

### 2.10 CSS and DOM behavior

Current Painter styles include wrapper positioning, author-label layering,
selection hover, painting z-index, and tool cursors. They are selected through
global state classes and consume a mix of app and PDF.js variables:

- `--accent-contrast`;
- `--editorHighlight-editing-cursor`;
- `--editorInk-editing-cursor`;
- `--editorFreeHighlight-editing-cursor`;
- `--InkLayer_Annotator-image-cursor`.

Evidence: `inklayer-react/src/extensions/annotator/painter/index.scss:1-91`.

React toggles painting state on `document.body`, and selector hover also uses a
body class. Cursor data is written to `document.documentElement`:

- `inklayer-react/src/extensions/annotator/painter/index.ts:426-440`.
- `inklayer-react/src/extensions/annotator/painter/editor/selector.tsx:489-497`.
- `inklayer-react/src/extensions/annotator/utils/utils.ts:96-111`.

Vue partially scopes Painter mode to the fixed `#InkLayer` element, but the fixed
ID still prevents robust multi-instance ownership. Vue's provider also adds a
global body class: `inklayer-vue/src/context/PdfViewerProvider.vue:335-336`.

Core decision: scope every dynamic class and `--inklayer-*` variable to an
instance root and provide fallback values for every engine variable.

## 3. Existing test baseline

Commands executed from the reference repositories:

```text
inklayer-react: npm test -- --runInBand
inklayer-vue:   npm test
```

Results on 2026-08-10:

- React: 45 suites passed, 228 tests passed, 0 snapshots, 23.3 seconds.
- Vue: 44 files passed, 301 tests passed, 7.96 seconds.
- React required permission to use a localhost port opened by its Sass tooling;
  the initial sandboxed run failed with `connect EPERM 127.0.0.1:62059` before
  Jest executed assertions.
- React emitted React 18 `act` deprecation and missing-i18n-instance warnings.
- Vue emitted Sass legacy API and missing translation-key warnings.
- Neither reference repository was modified by the test runs.

The green baseline does not prove the Core completion requirements. Missing or
mock-only coverage includes:

- a real PDF.js URL/data/range/fallback server path;
- worker conflicts and SSR-safe package import;
- two simultaneous Viewer/Painter instances;
- strict/lenient snapshot validation;
- unsupported native annotation isolation;
- full editor creation coverage for every tool;
- 100 create/destroy cycles and listener/timer/DOM stability;
- package exports and tarball consumer behavior.

## 4. Phase 0 implementation contracts

The following decisions are sufficiently evidenced to enter implementation:

1. Use one zero-based canonical `pageIndex`; legacy one-based `pageNumber` is
   confined to compatibility conversion.
2. Use explicit `konva-stage` and `pdf-user-space` coordinate spaces.
3. Preserve a versioned Konva renderer snapshot as canonical annotation data.
4. Treat `SELECT` as a tool, not an annotation type.
5. Preserve the eight permission actions and current owner-only semantics.
6. Preserve immutable comment/reference/numbering behavior.
7. Preserve Cloud and Arrow visual-fidelity export and their custom round-trip
   markers unless an ADR changes the external PDF behavior.
8. Mark PDF.js annotation storage only for successfully supported imports, via a
   separate explicit operation.
9. Use React's navigation/serialization tests and Vue's editor destruction and
   highlight regressions together; neither repository is a complete authority.
10. Do not copy the existing nominal Core model or global Adapter registry.

No product-semantic blocker requiring user input was found in Phase 0.
