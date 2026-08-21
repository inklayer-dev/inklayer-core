# Canonical Data Model

`Annotation` schema version 1 is the only persisted and collaborative model.

## Required semantics

- `id` is stable and unique within a document.
- `pageIndex` is zero-based.
- `type` is one of 16 protected built-ins or a bounded namespaced
  `custom:<namespace>/<name>` identity; `select` is not persisted.
- `bounds` are finite, axis-aligned, and non-negative.
- `coordinateSpace` is explicitly `konva-stage` or `pdf-user-space`.
- `comments`, `author`, `createdAt`, `native`, and `rendererState` are first-class.
- `referenceNumber` is an optional positive, document-scoped display number.
- `source` records `core`, `legacy`, or `pdf-native` provenance.
- `typeData` optionally preserves independently versioned, Definition-owned
  lossless JSON semantics.
- `extensions` preserves validated generic application JSON metadata.

## Renderer state

```ts
interface KonvaRendererState {
  engine: 'konva'
  schemaVersion: 1
  serialized: string
}
```

For built-ins this is not a disposable cache: it is the exact redraw
representation. Every built-in load, creation, transform, import, and export
path uses the same snapshot parser.
The protected Definition identifies this as the Core-private renderer strategy;
construction, restyling, content synchronization, hit testing, and transforms
resolve Definition metadata before reaching optimized snapshot helpers.
The parser bounds string length, depth, nodes, points, and data URLs; accepts only
verified classes and finite attributes; rejects prototype keys; and verifies the
root Group ID against the annotation ID.

When a custom Definition is missing or does not support the retained
`typeData.schemaVersion`, `rendererState` remains opaque preserved data. Core
does not pass it to Konva. It displays a Core-produced bounds placeholder, then
rebuilds a controlled scene from canonical data when compatible behavior becomes
available.

## Type-owned JSON

```ts
interface AnnotationTypeData {
  schemaVersion: number
  payload: JsonValue
}
```

`JsonValue` accepts only null, booleans, finite numbers, strings, arrays, and
plain string-keyed objects. Core bounds depth, total values, strings, and keys;
it rejects functions, undefined, symbols, class instances, Dates, Maps, Sets,
cycles, accessors, non-enumerable fields, dangerous prototype keys, and
non-finite numbers. Envelope parsing never depends on plugin availability.

For pointer-created custom annotations, a Definition may derive initial
`typeData` from normalized page-space gesture geometry. Core persists the
returned JSON only after envelope and codec validation. A pure transform reducer
may replace bounds and `typeData` together, keeping semantic measurements or
other domain values synchronized without treating renderer snapshots as source
data.

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
