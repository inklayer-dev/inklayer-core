# Save and restore annotations

Annotations live in `core.annotations.repository`. The Repository is the only annotation data source used by interaction, rendering, comments, print, and export. Save its detached values; do not save Canvas nodes, DOM rectangles, selection, hover, or toolbar state.

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
  void saveToServer(documentId, repository.getAll())
})
```

In a real product, debounce or batch requests and keep network status in application state. Repository events are synchronous document mutations, not a synchronization protocol.

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

## What to store

Store canonical `Annotation` values, including stable IDs, `pageIndex`, `type`, bounds, appearance, content, comments, permissions-related ownership, references, `typeData`, and renderer state. Keep product-only state—open panels, selected toolbar button, request status, search highlights, and hover—outside the annotation payload.

For collaboration or remote persistence, wrap these same Repository commands and events with your application policy. Do not mutate Konva or Repository internals.
