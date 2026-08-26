# Architecture overview

InkLayer Core separates PDF and annotation behavior from product UI. React, Vue, or Vanilla JavaScript renders the toolbar, sidebar, dialogs, and application layout; Core provides the same document behavior and data model in every integration.

<div class="architecture-map" role="img" aria-label="InkLayer Core architecture, from application UI through public APIs and internal modules to application-provided services">
  <div class="architecture-map__layer architecture-map__layer--app">
    <span>Application UI</span>
    <strong>React · Vue · Vanilla JavaScript</strong>
    <small>Toolbar · sidebar · dialogs · routing</small>
  </div>
  <div class="architecture-map__arrow" aria-hidden="true">↓ calls</div>
  <div class="architecture-map__grid architecture-map__grid--two">
    <div class="architecture-map__card">
      <span>Core instance</span>
      <strong><code>createInkLayer()</code></strong>
      <small>Viewer · Page Flow · annotations · annotation types</small>
    </div>
    <div class="architecture-map__card">
      <span>Standalone entries</span>
      <strong>Import · PDF export · Excel export</strong>
      <small>Loaded only when the application needs them</small>
    </div>
  </div>
  <div class="architecture-map__arrow" aria-hidden="true">↓ implemented by</div>
  <div class="architecture-map__grid architecture-map__grid--three">
    <div class="architecture-map__card architecture-map__card--muted">
      <strong>Viewer</strong>
      <small>PDF.js · loading · pages · search · text layers</small>
    </div>
    <div class="architecture-map__card architecture-map__card--muted">
      <strong>Annotations</strong>
      <small>Repository · geometry · interaction · Konva renderer</small>
    </div>
    <div class="architecture-map__card architecture-map__card--muted">
      <strong>Import and export</strong>
      <small>PDF.js · pdf-lib · ExcelJS</small>
    </div>
  </div>
  <div class="architecture-map__arrow" aria-hidden="true">↑ optional providers</div>
  <div class="architecture-map__layer architecture-map__layer--services">
    <span>Application services through Capabilities</span>
    <strong>Fetch · logger · text input · Repository · clock · IDs</strong>
    <small>Print and download services are called explicitly by the application</small>
  </div>
</div>

## Start with the public surface

Most applications only need the following public surfaces:

| Surface | Purpose |
| --- | --- |
| `createInkLayer()` | Creates one instance and connects its Viewer, Annotation engine, Page Flow, and installed Capabilities |
| `core.viewer` | Loads PDFs and handles pages, zoom, navigation, search, selection, outlines, and thumbnails |
| `core.annotations` | Selects tools, creates and edits annotations, and exposes the annotation Repository |
| `core.annotationTypes` | Registers and inspects built-in or custom annotation types |
| `core.capabilities` | Exposes services installed for this instance |
| Secondary import/export entries | Import native PDF annotations or generate PDF/Excel output without adding those heavier dependencies to the main Viewer path |

The internal PDF.js and Konva objects are implementation details. Applications work through Core's public APIs and receive detached, serializable data instead of renderer nodes or mutable internal collections.

## How data moves through Core

1. The application gives `core.load()` a URL or PDF bytes. The Viewer uses PDF.js to open the document.
2. Page Flow creates page shells and mounts the PDF canvas, text layer, and annotation layer only where needed.
3. Annotation operations update `core.annotations.repository`. The Konva renderer projects that canonical data onto the page; the canvas is not the source of truth.
4. Importers convert native PDF annotations into the same annotation model. Exporters read the source PDF bytes and current annotations, then return new PDF or Excel bytes.
5. The application decides whether generated output is downloaded, uploaded, or printed.

This separation is why annotation data can be saved without serializing Canvas nodes, and why React, Vue, and Vanilla integrations can share the same behavior.

## Dependency direction

Core keeps its internal dependencies pointing in one direction:

| Layer | Responsibility and allowed dependencies |
| --- | --- |
| Domain and Repository | Serializable annotation data and storage operations; no DOM, PDF.js, or Konva dependency |
| Geometry | Coordinate, transform, and color calculations; independent of rendering frameworks |
| Viewer | PDF.js loading, page rendering, text layers, search, outlines, thumbnails, and document lifecycle |
| Annotation and Konva renderer | Annotation interaction and visual projection; depends on the domain, geometry, Repository, and Konva |
| Import and export | Converts between external files and the canonical model; published as separate package entries |
| Browser platform and Capabilities | Connects environment-specific actions and application-provided services to one instance |

`npm run check:dependencies` checks local TypeScript imports for cycles, forbidden layer edges, and accidental framework dependencies.

## Instance ownership and cleanup

Each Core instance owns its document loading tasks, rendered pages, text layers, annotation layers, event listeners, and temporary browser resources. Replacing a document releases resources belonging to the previous document. Calling `core.destroy()` releases everything owned by that instance and is safe to call more than once.

An annotation Repository is the main ownership exception: it can be owned by Core or borrowed from the application. A borrowed Repository remains available after the Core instance is destroyed. See [Save and restore annotations](./guide/persistence) for the persistence model.

## Where the framework boundary sits

The boundary is based on responsibility, not visibility. A search feature, for example, is split across both sides: Core extracts text, finds matches, and navigates to a result; the application renders the search field and result list.

Continue with [Core boundary](./core-boundary) for a feature-by-feature responsibility table and the rules used to decide where new behavior belongs.
