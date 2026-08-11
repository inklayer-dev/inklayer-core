# Canonical Data Model

`Annotation` schema version 1 is the only persisted and collaborative model.

## Required semantics

- `id` is stable and unique within a document.
- `pageIndex` is zero-based.
- `type` is one of 16 persisted tools; `select` is not persisted.
- `bounds` are finite, axis-aligned, and non-negative.
- `coordinateSpace` is explicitly `konva-stage` or `pdf-user-space`.
- `comments`, `author`, `createdAt`, `native`, and `rendererState` are first-class.
- `referenceNumber` is an optional positive, document-scoped display number.
- `source` records `core`, `legacy`, or `pdf-native` provenance.
- `extensions` preserves validated unknown application metadata.

## Renderer state

```ts
interface KonvaRendererState {
  engine: 'konva'
  schemaVersion: 1
  serialized: string
}
```

This is not a disposable cache: it is the exact redraw representation. Every
load, creation, transform, import, and export path uses the same snapshot parser.
The parser bounds string length, depth, nodes, points, and data URLs; accepts only
verified classes and finite attributes; rejects prototype keys; and verifies the
root Group ID against the annotation ID.

## Coordinates

Legacy and live Painter bounds use unscaled, top-left Stage coordinates. Native
PDF dictionaries use bottom-left PDF user space. Central geometry functions
convert points, rectangles, page boxes, scale-independent bounds, and rotations
0/90/180/270. Formats must never infer a coordinate space from field names.

## Collaboration

Comments and references use stable IDs plus readable labels. Reference label
synchronization can renumber visible `#N` text without losing the target ID.
Permissions use one action vocabulary and one mode/callback contract. Comment and
status mutations preserve exact renderer state.

All runtime entry points detach validated values; repository getters and events
do not expose mutable internal collections.
