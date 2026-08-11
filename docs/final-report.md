# InkLayer Core Final Implementation Report

Date: 2026-08-11
Status: **Complete — Phase 7, boundary correction, and extended Viewer verified**
Runtime used for the final gate: macOS arm64, Node 24.18.0

> The 2026-08-11 boundary correction added real TextLayer selection,
> first-class thumbnail/outline/search services, and geometry-specific annotation
> transforms. The extended Viewer work added password/permissions, watermark,
> virtual continuous pages, cross-page selection, and secure raster print.
> `docs/core-boundary.md` is the normative ongoing contract.

## Scope and changed files

Only `inklayer-core` was changed. The implementation adds or updates:

- package/tooling: `package.json`, `package-lock.json`, TypeScript, Vite, Vitest,
  Playwright, ESLint, CI, package checks, dependency checks, benchmark scripts,
  comment checks, and `.gitignore`;
- production source: `src/domain`, `src/repository`, `src/compat`, `src/geometry`,
  `src/viewer`, `src/annotation`, `src/renderer`, `src/import`, `src/export`,
  `src/platform`, `src/ports`, `src/styles`, and all public entry files;
- verification: unit/integration/browser tests and fixtures under `tests`;
- consumer evidence: the complete framework-free application under
  `examples/vanilla`;
- documentation: `README.md`, source audit records, architecture, API, data model,
  CSS contract, legacy compatibility, future framework integration, performance,
  implementation progress, and this report.

`inklayer-react` and `inklayer-vue` were read and tested as references and have
clean worktrees. No package was published, no release was created, and nothing was
pushed.

## Public API and package exports

The packed package exposes real ESM, CommonJS, and declaration targets for:

| Export | Responsibility |
|---|---|
| `inklayer-core` | Domain, validation, repository, collaboration, factories, errors, browser ports |
| `inklayer-core/viewer` | PDF.js loading, Range, outline, search, thumbnails, TextLayer, lifecycle |
| `inklayer-core/annotation` | Annotation facade, tools, events, snapshot validation and ports |
| `inklayer-core/import/pdfjs` | Native PDF.js decoding, metadata recovery and confirmed-ID hiding |
| `inklayer-core/export/pdf` | Canonical annotations to PDF bytes |
| `inklayer-core/export/excel` | Canonical annotations/comments to XLSX bytes |
| `inklayer-core/style` | Generated instance-scoped engine CSS plus declarations |

The root entry is safe to import in Node/SSR. PDF.js, Konva, pdf-lib, and ExcelJS
execute only behind the relevant runtime operation or secondary entry. Detailed
contracts and examples are in `docs/api.md`.

## Architecture result

One validated canonical `Annotation` model and one repository are the data source
of truth. The public Annotation Engine owns interaction state and delegates drawing
to an internal Konva Painter. Viewer owns PDF.js resources. Native import and
format exporters translate only at explicit boundaries. Legacy storage fields are
isolated under `compat/legacy`.

The source graph contains 48 production implementation files with no cycle,
framework dependency, or forbidden dependency edge. Two type-only cycles found by
the Phase 7 audit were removed by relocating shared event and target types.

React and Vue therefore need to implement product UI composition and wiring:
toolbars, dialogs, sidebars, routing, product state, authorization presentation,
and subscriptions to Core events. They do **not** need to reimplement Viewer
lifecycle, annotation pointer gestures, selection/transform behavior, Painter,
thumbnail/outline/search semantics, TextLayer geometry,
comments/permissions/reference semantics, native import, or PDF/Excel generation.

## Removed legacy debt

- global body classes, fixed editor IDs, shared DOM registries, and singleton
  browser state were replaced with instance ownership;
- duplicated framework stores, Painter/editor implementations, coordinate/color
  logic, and snapshot parsing were replaced with single Core implementations;
- unsafe unbounded Konva JSON parsing now crosses one validated versioned boundary;
- Viewer loading uses generation guards, explicit Range fallback classification,
  worker ownership, cancellation, and idempotent cleanup;
- unsupported native annotations are preserved and never hidden by speculative
  decoding;
- format exporters return bytes and no longer own filenames or downloads;
- CSS is scoped below `.inklayer-engine` and has documented variable fallbacks;
- no Stub, empty entry, `_pending`, production exclusion, copied dead utility, or
  broad `any` workaround remains.

The React/Vue comparison and source evidence are recorded in
`docs/source-behavior-baseline.md`, `docs/source-difference-matrix.md`, and
`docs/source-debt-inventory.md`.

## Tests and actual results

Final reproducible gate:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24.18.0
npm run check
```

Actual result:

- production and test TypeScript checks passed in strict mode;
- ESLint passed with unused-disable reporting;
- comment audit passed for 87 maintained code files;
- dependency audit passed for 48 source files with no cycles or forbidden edges;
- Vitest: 22 files passed, 91 tests passed;
- Playwright Chromium: 2 tests passed;
- library and Vanilla production builds passed;
- package check passed for 20 export targets and 152 packed files;
- temporary tarball consumer typecheck, Vite production build, CSS import, every
  entry import, and Node root import passed.

Additional security check:

```bash
npm audit --omit=dev
```

Actual result: zero vulnerabilities.

## Build, package and bundle evidence

The library build produces root and feature ESM/CommonJS chunks, declarations,
and `dist/inklayer-core.css`. The Vanilla build emits its PDF.js worker and keeps
PDF/Excel exporters in dynamic chunks. The largest ExcelJS-backed secondary chunk
is expected and does not enter initial UI or Viewer code.

Final transitive Core entry sizes from `node --expose-gc scripts/benchmark.mjs`:

| Entry | Bytes |
|---|---:|
| Viewer | 27,506 |
| Annotation | 64,586 |
| PDF export | 29,543 |
| Excel export | 16,741 |

The package dry run contains 152 files and excludes source/tests. A real tarball is
installed into a fresh temporary consumer during `npm run check:consumer`.

## Vanilla E2E and browser evidence

The Vanilla application creates a PDF at runtime and mounts two independent
Viewer/Annotation instances. Automated Chromium coverage verifies PDF opening,
page render, thumbnails, outline/search navigation, real TextLayer markup, zoom,
all 16 annotation types, pointer creation, selection, tool-specific transform,
delete, FreeText overlay, comments, reload, PDF/Excel export status, distinct CSS
variables/cursors, two-instance isolation, destroy/remount, mobile layout, and a
clean console.

Manual in-app browser QA repeated the desktop interaction path and a 390×844 mobile
layout check with no horizontal overflow. Screenshots are stored outside the
package source tree as local review evidence.

## Performance baseline

The final local measurements are:

| Workload | Result |
|---|---:|
| Repository replace, 100 annotations | 0.48 ms |
| Repository replace, 1,000 annotations | 3.69 ms |
| PDF.js import, 100 annotations | 1.88 ms |
| PDF export, 100 annotations | 6.68 ms |
| Annotation create/destroy, 100 cycles | 1.11 ms |
| Browser initial two-instance load | 228.35 ms |
| Browser zoom and page reattach | 99.89 ms |
| Browser destroy/remount | 126.87 ms |

After forced GC, the 100-cycle lifecycle workload recorded a 72,680-byte heap
delta including warmed runtime caches. Cleanup correctness is asserted separately
for listeners, roots, DOM, repositories, pending inputs, nodes, and stages. These
numbers are reproducible local baselines, not cross-machine budgets.

## Residual risks

- Private production payloads and PDF fixtures were unavailable, so legacy
  compatibility claims are bounded by checked-in source-derived fixtures.
- Browser E2E currently targets Chromium; WebKit/Firefox require a compatibility
  matrix if they are declared supported release targets.
- PDF dictionary/round-trip structure is tested, but appearance regeneration—most
  notably stamps—may vary among third-party PDF readers.
- Performance values are machine-specific. Regressions should compare repeated
  runs in a stable CI environment rather than enforce these exact timings.
- Secure raster printing intentionally flattens text, links, forms, and vectors
  into a transient unencrypted PDF; vector-preserving encrypted output requires
  a trusted decrypt/re-encrypt backend.

These risks do not represent missing Whitepaper capabilities, but they should be
addressed before declaring broader production compatibility.

## Whitepaper completion checklist

### Scope

- [x] Only `inklayer-core` modified; React/Vue remain clean.
- [x] No publish, push, or release.

### Architecture

- [x] Enforced directory/dependency structure with documented architecture.
- [x] Canonical Annotation is the sole Engine model; legacy exists only in compat.
- [x] One Repository; Painter internal; usable Annotation facade.
- [x] No framework dependency or circular dependency.

### Viewer

- [x] URL/data/Range/fallback, race, cancel/retry, worker conflict, idempotent
  destroy, multi-instance behavior, and SSR-safe import.
- [x] Outline/destination, search, cached thumbnail, real TextLayer selection,
  generation cancellation, and framework-neutral typed results.

### Annotation

- [x] All tools and create/load/update/select/transform/delete operations.
- [x] Select-only dragging, continuous creation feedback, page constraints, and
  box/proportional/endpoint/vertex transform affordances by geometry.
- [x] Text selection, navigation, hover, labels, comments, permissions,
  references, and numbering.
- [x] Legacy `konvaString` migration, versioned renderer state, and exact reload.

### Safety and lifecycle

- [x] Runtime and Konva snapshot validation; strict/lenient paths.
- [x] Unsupported native annotations preserved; structured errors; scoped state.
- [x] Listener, timer, DOM, Stage, pending task/input cleanup and 100-cycle stress.

### Import/export

- [x] Native import, PDF byte export, Excel byte export, all-type fixtures,
  rotation/scale, comments/author/date.
- [x] Heavy format dependencies excluded from Viewer and initial Vanilla code.

### CSS

- [x] Real scoped CSS entry, `--inklayer-*` variables with fallbacks, cursors,
  contract documentation, and two-instance E2E.

### Build, tests and package

- [x] Strict typecheck for every production source with no production exclusion.
- [x] Lint and comment gate; English file headers, named-function/method/constructor
  JSDoc, public-field documentation, and contract-focused comments.
- [x] Unit, integration, browser E2E, and packed-package consumer tests.
- [x] No empty chunk; every export/declaration/CSS target exists.
- [x] Tarball install, Node-safe root import, and Vanilla production build.

### Quality

- [x] No required Stub, `_pending`, broad `any`, duplicate Store/Repository,
  duplicate color/geometry/snapshot parser, unused Port, or copied dead utility.
- [x] Documentation matches the final implementation and measurements.
- [x] Performance baseline and reproducible final report are present.
