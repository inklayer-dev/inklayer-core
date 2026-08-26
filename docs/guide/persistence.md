# Save and restore annotations

Annotations live in `core.annotations.repository`. This data store is shared by
interaction, rendering, comments, print, and export. Its `getAll()` method
returns independent, serializable `Annotation` values. Save those values rather
than Canvas nodes or other UI state.

An `Annotation` contains its identity, page and geometry, appearance, content,
comments, author, timestamps, and the data required to draw it again. The
complete field definitions are documented in the [Canonical Data Model](../data-model.md).
You normally do not construct this object for persistence—save the values
returned by the Repository and restore them as a complete collection.

## Read the current annotations

```ts
const annotations = core.annotations.repository.getAll()
const json = JSON.stringify(annotations)
```

The returned array and its values are detached from internal state, so serialization cannot mutate the running engine.

## Save after changes

```ts
const repository = core.annotations.repository
const stopSaving = repository.subscribe(event => {
  if (event.type === 'selection' || event.type === 'destroy') return
  void saveToServer(documentId, repository.getAll()) // Save asynchronously without waiting here.
})
```

In a real product, debounce or batch requests and keep network status in application state. Repository events are synchronous document mutations, not a synchronization protocol.
Call `stopSaving()` when the component or application scope that created the
subscription is disposed.

## Restore saved data

```ts
const saved = await loadFromServer(documentId)
core.annotations.repository.replaceAll(saved)
```

`replaceAll()` validates the full collection and duplicate IDs before replacing current state. Treat server data as untrusted and handle validation failures visibly.

## Keep data across engine instances

Create and provide your own Repository when it must outlive one Viewer mount:

```ts
import { createMemoryAnnotationRepository } from '@inklayer-dev/core'
import {
  createAnnotationRepositoryCapability,
  createInkLayer
} from '@inklayer-dev/core/capabilities'

const repository = createMemoryAnnotationRepository()
repository.replaceAll(saved)

const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [createAnnotationRepositoryCapability(repository)]
})
```

Capability-provided repositories are borrowed by default, so `core.destroy()` does not destroy this one. Use `{ ownership: 'owned' }` only when the Core instance should own its final cleanup.

## Configure authors and permissions

The application supplies the signed-in user and the permission rule when it
creates the Core instance:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotation: {
    currentUser: {
      id: currentUser.id,
      name: currentUser.name
    },
    permissions: {
      mode: 'owner-only'
    }
  }
})
```

New annotations record `currentUser` as their `author`. With `owner-only`, any
signed-in user can create annotations and add comments, but only the annotation
author can edit, move, delete, or change the status of that annotation. A comment
can be edited or deleted only by its own author.

Core checks these rules when an operation is performed and prevents disallowed
direct interactions. The application should also hide or disable unavailable
controls so the UI reflects the same rule, but UI state is not the security
boundary. A backend that accepts saved annotations must enforce authorization
again when processing writes. If `permissions` is omitted, annotation operations
are unrestricted.

To make every annotation operation read-only, provide a custom decision:

```ts
annotation: {
  currentUser,
  permissions: {
    can: () => false
  }
}
```

If the signed-in user or policy changes without recreating the instance, call
`core.annotations.setCurrentUser(nextUser)` or
`core.annotations.setPermissions(nextPermissions)`.

## What to store

Store each complete `Annotation` returned by the Repository. Its top-level shape
is:

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

`author` records the identity associated with the annotation. Permission mode
and custom permission callbacks are runtime configuration and are not part of
the saved annotation. References live inside `content` or individual comments
rather than as a top-level field. Preserve `rendererState` as opaque data because
Core needs it for exact redraw, and preserve `typeData` when present for custom
annotation types.

Keep product-only state—open panels, the selected toolbar button, request
status, search highlights, selection, and hover—outside the annotation payload.

For collaboration or remote persistence, wrap these same Repository commands and events with your application policy. Do not mutate Konva or Repository internals.
