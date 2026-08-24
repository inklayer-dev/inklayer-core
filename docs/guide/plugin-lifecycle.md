# Plugin lifecycle and services

Read this page after installing a basic Capability. It explains when plugin code runs, how plugins share services, and why cleanup remains reliable when setup fails.

## Setup before engines

`setup(context)` runs in array order before Viewer and Annotation Engine creation. Use it to provide a service, consume an earlier service, register a custom annotation type, or add owned cleanup to the plugin lifecycle.

```ts
const plugin: InkLayerCapability = {
  id: 'acme:feature',
  setup(context) {
    const resource = createResource()
    context.lifecycle.add(() => resource.destroy(), 'feature-resource')
  }
}
```

Do not access Viewer or Annotation Engine during setup: they do not exist yet.

## Run after engines are ready

```ts
setup(context) {
  context.onReady(({ viewer, annotations }) => {
    const stop = viewer.subscribe(handleViewerEvent)
    annotations.setCurrentUser(currentUser)
    return stop
  })
}
```

Ready effects run in Capability order. A failure rejects `createInkLayer()` and rolls back the complete instance.

## Provide and consume services

```ts
setup(context) {
  context.provide('acme:review-policy', reviewPolicy)
}
```

A later Capability can read it:

```ts
setup(context) {
  const policy = context.get<ReviewPolicy>('acme:review-policy')
}
```

Capability IDs and single-provider service keys must be unique within an instance. Duplicate claims fail loudly instead of changing behavior by load order.

## Cleanup order

Capabilities install in array order and dispose in reverse order. Core aborts new work first, continues cleanup after an individual disposer fails, and aggregates cleanup failures into a structured error. Returned cleanup functions and `context.lifecycle.add()` are both idempotently owned by the instance.

Borrowed services are not destroyed by Core. Owned subscriptions or listeners created by a plugin still are. Repository Capability ownership is borrowed by default and can explicitly become `owned`.

## Keep plugins isolated

Never store a Registry, service, listener, or current engine in module-global mutable state. Install it through the instance context. This keeps simultaneous viewers, teardown, tests, and future framework adapters independent.

For all service keys and typed factories, see [Public API: Composition Root and Capabilities](../api.md#composition-root-and-capabilities).
