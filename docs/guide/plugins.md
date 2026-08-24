# Plugin overview

Plugins let one InkLayer instance connect to your product or add a new annotation tool. They do not replace PDF coordinates, validation, permissions, or other behavior that must remain identical across frameworks.

## Choose the plugin you need

| You want to… | Use | Start here |
|---|---|---|
| Send logs to your logger | Capability plugin | [Your first Capability plugin](./capability-plugin.md) |
| Save annotations in an application-owned Repository | Repository Capability | [Save and restore annotations](./persistence.md) |
| Replace the FreeText editor, print action, download action, fetch, clock, IDs, or thumbnail surface | Built-in Capability factory | [Your first Capability plugin](./capability-plugin.md) |
| Run product behavior after the engines are ready | Custom Capability with `onReady()` | [Lifecycle and services](./plugin-lifecycle.md) |
| Add a new persisted drawing tool | Annotation Type Definition | [Custom annotation type](./custom-annotation-type.md) |
| Change toolbar layout, icons, dialogs, or panels | Framework UI—not a Core plugin | [Framework integration](./framework-integration.md) |

## Two extension points

### Ability plugins

A Capability is an instance-level plugin for an environment service or product integration. Common services already have factory functions, so most applications configure them without writing lifecycle code:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [
    createLoggerCapability(appLogger),
    createAnnotationRepositoryCapability(repository),
    createTextInputCapability(textInput)
  ]
})
```

Capabilities affect only this instance and are cleaned up with it.

### Annotation type plugins

An Annotation Type Definition adds a namespaced tool such as `custom:acme/review-area`. It declares how the tool is created, which appearance and transform controls it supports, what controlled scene it renders, and how it reaches PDF output.

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotationTypes: [reviewArea]
})

core.annotations.setTool('custom:acme/review-area')
```

Core still owns pointer input, validation, hit testing, transforms, persistence, print, export, and cleanup. The plugin never receives Konva or PDF.js private objects.

## Plugins are instance-scoped

Two viewers can install different plugins without sharing registries or mutable state. If installation fails, `createInkLayer()` rolls back already-created plugin resources before returning the error.

The 16 built-in annotation types use the same Definition model internally, but they are protected Core behavior and cannot be replaced or unregistered.

Continue with [Your first Capability plugin](./capability-plugin.md) or [Custom annotation type](./custom-annotation-type.md).
