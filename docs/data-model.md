# Annotation data model

`Annotation` is the serializable source of truth used by repositories, persistence, import, printing, and export. Save the complete object returned by Core; do not save DOM elements, Konva nodes, or temporary toolbar state in its place.

## Top-level structure

```ts
interface Annotation {
  id: string
  schemaVersion: 1
  type: AnnotationTypeId
  pageIndex: number
  bounds: AnnotationBounds
  coordinateSpace: AnnotationCoordinateSpace
  appearance: AnnotationAppearance
  comments: AnnotationComment[]
  author: User
  createdAt: string | null
  native: boolean
  rendererState: KonvaRendererState

  content?: AnnotationContent
  updatedAt?: string | null
  referenceNumber?: number
  source?: AnnotationSource
  typeData?: AnnotationTypeData
  extensions?: JsonObject
}
```

This is the complete top-level V1 shape. Nested objects contain text or image content, appearance, comments, custom-type data, and the renderer representation.

## Field meanings

| Field | Meaning |
| --- | --- |
| `id` | Stable annotation ID, unique within one document. |
| `schemaVersion` | Version of the complete annotation envelope; currently `1`. |
| `type` | One of the 16 built-in types or a namespaced `custom:<namespace>/<name>` ID. `select` is a tool, not an annotation type. |
| `pageIndex` | Zero-based PDF page index. |
| `bounds` | Finite, non-negative, axis-aligned bounds in `coordinateSpace`. |
| `appearance` | Fully resolved opacity, stroke, fill, and text appearance. |
| `content` | Optional semantic text, selected text, image, signature, or references. |
| `comments` | Comments and replies in stable order. |
| `author` | Creator identity used by application UI and permission checks. |
| `createdAt` / `updatedAt` | Timestamp strings, or `null` when unavailable. |
| `native` | Whether the annotation originated in the source PDF. |
| `referenceNumber` | Optional positive document-level display number. |
| `source` | Optional provenance such as `core`, `legacy`, or `pdf-native`. |
| `rendererState` | Versioned drawing representation required to redraw the annotation. |
| `typeData` | Versioned JSON owned by a custom annotation type. |
| `extensions` | Validated application JSON that Core preserves without interpreting. |

## Author and permissions

`author` is persisted on each annotation. Permission policy is not: it belongs to the current Core instance and is evaluated using the current user.

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotation: {
    currentUser: { id: 'alice', name: 'Alice' },
    permissions: { mode: 'owner-only' }
  }
})
```

With `owner-only`, Alice can edit annotations whose `author.id` is `alice`; another user sees the same saved annotation data but Core rejects protected operations. Change the active identity with `core.annotations.setCurrentUser(user)`. See [Persist annotations](./guide/persistence) for a complete example.

## Renderer state

```ts
interface KonvaRendererState {
  engine: 'konva'
  schemaVersion: 1
  serialized: string
}
```

`rendererState` is persisted data, not a disposable cache. Save it unchanged and let Core validate and update it. Applications should not parse or edit the serialized Konva representation.

If a custom annotation definition is unavailable, Core preserves its data and displays a safe bounds-based placeholder. Registering a compatible definition restores its normal renderer and interactions.

## Custom-type and application JSON

Custom annotation types store their own versioned payload in `typeData`:

```ts
interface AnnotationTypeData {
  schemaVersion: number
  payload: JsonValue
}
```

The owning type definition must declare support for that schema version and validate the payload. `extensions` is different: it is general application metadata that Core preserves but does not interpret.

`JsonValue` supports `null`, booleans, finite numbers, strings, arrays, and plain string-keyed objects. Functions, class instances, dates, maps, sets, circular references, accessors, and non-finite numbers are rejected.

## Coordinates

`konva-stage` uses an unscaled top-left origin. `pdf-user-space` uses the PDF bottom-left origin. Core handles conversion for rendering, import, printing, and export; applications should not infer a coordinate system from field names or mix values from the two spaces.

`bounds` are stored in page units and do not change when the Viewer zoom changes.

## Repository and synchronization

Repository getters and events return detached values, so changing a returned object does not mutate Core state. Use annotation-engine or repository methods to make changes.

Repository events describe local state changes; they are not a network synchronization protocol. An application that supports collaboration must still define transport, authentication, conflict resolution, ordering, and retry behavior.
