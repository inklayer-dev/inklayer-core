# Your first Capability plugin

An ability plugin connects one InkLayer instance to an environment service or product behavior. Start with the provided factories; write a custom Capability only when a factory does not cover the integration.

## Send diagnostics to your logger

```ts
import {
  createInkLayer,
  createLoggerCapability
} from '@inklayer-dev/core/capabilities'

const appLogger = {
  warn(message: string, context?: unknown) {
    console.warn('[PDF]', message, context)
  },
  error(message: string, context?: unknown) {
    console.error('[PDF]', message, context)
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container },
  capabilities: [createLoggerCapability(appLogger)]
})
```

That is the complete Logger plugin setup. It applies only to `core`; another instance can use another logger.

## Provide product-owned annotation data

```ts
import { createMemoryAnnotationRepository } from '@inklayer-dev/core'
import { createAnnotationRepositoryCapability } from '@inklayer-dev/core/capabilities'

const repository = createMemoryAnnotationRepository()
const repositoryPlugin = createAnnotationRepositoryCapability(repository)
```

Install `repositoryPlugin` in the same `capabilities` array. It is borrowed by default, which lets your application reuse it after the Viewer unmounts. See [Save and restore annotations](./persistence.md).

## Other ready-made plugins

```ts
const capabilities = [
  createTextInputCapability(textInputProvider),
  createPrintCapability(printProvider),
  createDownloadCapability(downloadProvider),
  createFetchCapability(fetchImplementation),
  createClockCapability(clock),
  createIdGeneratorCapability(idGenerator),
  createThumbnailSurfaceCapability(thumbnailSurfaceProvider)
]
```

These are explicit, testable instance settings—not global configuration.

## Write a small custom plugin

Use `onReady()` when your integration needs the finished engines:

```ts
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

const escapeToSelect: InkLayerCapability = {
  id: 'acme:escape-to-select',
  setup(context) {
    context.onReady(({ annotations }) => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') annotations.setTool('select')
      }
      context.root.addEventListener('keydown', onKeyDown)
      return () => context.root.removeEventListener('keydown', onKeyDown)
    })
  }
}
```

The returned cleanup runs automatically. Continue with [Lifecycle and services](./plugin-lifecycle.md) for setup order, service conflicts, rollback, and ownership.
