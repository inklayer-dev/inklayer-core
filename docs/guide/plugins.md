# Plugin overview

InkLayer provides two ways to extend an individual Core instance: connect application services, or add a custom annotation type. Choose the extension point based on what you need to change.

## Connect application services

A Capability connects Core to an application-owned service such as a logger, annotation repository, text input, or download handler.

For example, this configuration sends Core diagnostics to the browser console:

```ts
import { createInkLayer, createLoggerCapability } from '@inklayer-dev/core/capabilities'

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createLoggerCapability(console)]
})
```

The logger belongs to this Core instance only. Another Viewer can use a different logger or omit the Capability entirely.

To install built-in Capabilities or write your own, continue with [Create a Capability plugin](./capability-plugin).

## Add an annotation type

An annotation type definition adds a new drawing tool, such as a review area or measurement box. It describes how the annotation is created, rendered, saved, printed, and exported.

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotationTypes: [reviewArea]
})

core.annotations.setTool('custom:acme/review-area')
```

Core continues to handle pointer interaction, selection, permissions, persistence, and PDF output. Your definition describes the annotation; it does not manipulate Konva or PDF.js internals.

For a complete drawing tool with custom data, see [Create a custom annotation type](./custom-annotation-type).

## Understand the boundaries

Plugins belong to a single Core instance. They do not share services or annotation types with other instances, and their resources are released when the instance is destroyed.

The 16 built-in annotation types cannot be replaced or removed. Toolbars, buttons, dialogs, and sidebars are application UI, not plugins; see [framework integration](./framework-integration).

For installation order, shared services, cleanup, and initialization failures, see [Plugin lifecycle and services](./plugin-lifecycle).
