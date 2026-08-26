# Plugin lifecycle and services

Capability plugins run in two stages: `setup()` runs before Core creates its engines, and `onReady()` runs afterward. Understanding the distinction lets you register services, subscribe to Viewer events, and clean up resources at the right time.

## Run setup before the engines exist

`setup(context)` runs in the order plugins appear in the `capabilities` array. Use it to provide services, register annotation types, or attach resources that do not require the Viewer or annotation engine:

```ts
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const resizePlugin: InkLayerCapability = {
  id: 'acme:resize-listener',
  setup(context) {
    function onResize() {
      console.log('Viewer container resized')
    }

    window.addEventListener('resize', onResize)

    context.lifecycle.add(() => {
      window.removeEventListener('resize', onResize)
    })
  }
}
```

`context.lifecycle.add()` registers cleanup with the current instance. Do not access `viewer` or `annotations` in `setup()`; they have not been created yet.

## Run an effect after the engines are ready

Use `context.onReady()` when a plugin needs the Viewer or annotation engine. Returning a subscription disposer lets Core remove it automatically:

```ts
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const progressPlugin: InkLayerCapability = {
  id: 'acme:load-progress',
  setup(context) {
    context.onReady(({ viewer }) => {
      return viewer.subscribe(event => {
        if (event.type === 'loadProgress') {
          console.log('PDF loading:', event.progress.percentage)
        }
      })
    })
  }
}
```

Ready callbacks run in plugin order. If a callback fails, `createInkLayer()` rejects and releases the resources that were already installed.

## Share a service between plugins

One plugin can provide an instance-specific service, and a later plugin can read it. The provider must appear first in the `capabilities` array:

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const reviewPolicy = { mode: 'internal' }

const providePolicy: InkLayerCapability = {
  id: 'acme:provide-policy',
  setup(context) {
    context.provide('acme:review-policy', reviewPolicy)
  }
}

const usePolicy: InkLayerCapability = {
  id: 'acme:use-policy',
  setup(context) {
    const policy = context.get<typeof reviewPolicy>('acme:review-policy')
    if (!policy) throw new Error('Review policy is not installed')

    context.root.dataset.reviewMode = policy.mode
    return () => { delete context.root.dataset.reviewMode }
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [providePolicy, usePolicy]
})
```

Plugin IDs and service names must be unique within an instance. Registering the same ID or service twice fails instead of silently replacing the previous value.

## Clean up when the instance is destroyed

Plugins are installed in array order and cleaned up in reverse order:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [providePolicy, usePolicy]
})

await core.destroy()
```

Core cleans up `usePolicy` before `providePolicy`. Cleanup functions returned by `setup()` or `onReady()`, together with functions registered through `context.lifecycle.add()`, are called automatically. If one cleanup fails, Core continues cleaning up the remaining resources.

An annotation repository installed with `createAnnotationRepositoryCapability(repository)` is borrowed by default and survives `core.destroy()`. Pass `{ ownership: 'owned' }` to have Core destroy it with the instance.

## Keep instances independent

Do not store instance-specific services, listeners, registries, or engines in shared module-level variables. Install them through the Capability context so multiple viewers can run and shut down independently.

For all built-in service names and factories, see [Public API: Composition Root and Capabilities](../api#composition-root-and-capabilities).
