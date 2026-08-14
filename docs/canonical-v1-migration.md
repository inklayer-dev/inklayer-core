# Canonical V1 Migration Guide

InkLayer Core V1 owns PDF loading, page rendering, TextLayer selection, annotation state, Konva interaction, printing, watermark composition, and PDF import/export. React and Vue own product UI only.

## Stable entry points

- `inklayer-core/viewer`: loading, password, progress, Range, pages, search, selection and zoom.
- `inklayer-core/annotation`: repository, tools, appearance, comments, permissions and events.
- `inklayer-core/import/pdfjs`: native PDF annotation decoding.
- `inklayer-core/export/pdf` and `inklayer-core/export/excel`: output backends; import these lazily.
- `inklayer-core/style`: Core overlay styles and CSS variables.

Do not import `src/**`, `internal/**`, Konva nodes, PDF.js private viewer classes, or renderer JSON builders from an adapter.

## Legacy data

Use `parseLegacyAnnotation` once at the persistence boundary, then save canonical `Annotation[]`. Do not keep a framework store and canonical annotations in parallel. Renderer state is Core-owned.

## Content and appearance

- Use `updateContent` or `requestEditText` for body changes.
- Use `updateAppearance` for an existing annotation.
- Use `setToolAppearance` for future creations.
- Use `transformAnnotation` only with renderer state emitted by Core interaction.

Generic `updateAnnotation` rejects identity, type, page, bounds, coordinate-space and renderer-state changes. It synchronizes allowed content and appearance edits into the renderer snapshot.

## Signature and Stamp

Signature V1 has explicit image and ink variants. Applications implement draw/type/upload dialogs, then call `setImageAsset('signature', asset)` or create an annotation with `content.signature`. Stamp pickers use the same `setImageAsset('stamp', asset)` placement path. Assets contain a bounded PNG/JPEG data URL and desired page dimensions; Core centers them at the click, constrains them to the page, renders, transforms, prints, persists and exports their PDF appearance streams. A click without a prepared asset emits `imageAssetRequired`.

Core also generates an instance-scoped thumbnail cursor from the prepared image. Interactive Signature and Stamp placement defaults to `once`: the created annotation is selected and the tool returns to Select. Applications may override this through `creationModes` without reimplementing selection or Tag behavior.

## Adapter events and deletion UI

`selectionChanged` carries `source` and `isClick`. `hoverChanged` is coordinated by source. Core retains bounded deletion history through `canUndoDeletion` and `undoLastDeletion`; frameworks control Snackbar wording and duration without retaining a second deleted-object store.
