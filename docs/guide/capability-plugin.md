# Capability plugins

A Capability plugin connects one Core instance to services owned by your application. Core knows **when** it needs a service—for example, when a Free Text annotation needs an editor or a PDF request needs authentication—while the application decides **how** that work is performed.

The interaction is straightforward:

`Core needs a service → calls the registered Provider → the application performs the work`

Install plugins through `capabilities` when creating the instance:

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createLoggerCapability(appLogger)]
})
```

> [!IMPORTANT] A Capability does not create application UI
> Installing a Capability does not add toolbar buttons, dialogs, or panels. Your application still renders the UI and decides when user actions should call Core. A Capability only supplies a service or reusable behavior to the current Core instance.


## What the built-in Capabilities do

Use a built-in factory when Core's default browser behavior is unsuitable, or when the same application service should be available to Core and other plugins.

### Services used automatically by Core

Once installed, these services are used by the Viewer or Annotation engine at the appropriate time:

| Factory | When to use it | What happens after installation |
| --- | --- | --- |
| `createLoggerCapability()` | Send warnings and listener errors to your logger or monitoring service | Core reports relevant warnings and errors through the supplied logger |
| `createAnnotationRepositoryCapability()` | Keep annotations in an application-owned Repository, or reuse it across Core instances | The Annotation engine reads and writes that Repository; saving to a server is still the application's job |
| `createTextInputCapability()` | Replace Core's browser text editor with a React/Vue dialog or your own editor | Core requests text from the Provider when users create or edit Free Text and Note annotations |
| `createFetchCapability()` | Add authorization, use an application HTTP client, or route PDF requests through a proxy | The Viewer uses the supplied `fetch` implementation for URL and Range requests |
| `createClockCapability()` | Use controlled or deterministic timestamps | The Annotation engine uses the supplied clock when writing annotation and comment times |
| `createIdGeneratorCapability()` | Generate IDs according to application or server rules | The Annotation engine uses the supplied generator for annotations, comments, and related records |
| `createThumbnailSurfaceCapability()` | Supply a custom canvas surface in a non-standard host or test environment | The Viewer uses it when `renderThumbnail()` allocates and encodes a thumbnail surface |

You do not need to install these plugins to use the corresponding Core feature. Core already provides browser-oriented defaults where possible. Install one only when the application needs to replace or own that part of the behavior.

### Services called explicitly by the application

`createPrintCapability()` and `createDownloadCapability()` are different: installing them makes a print or download service available on the instance, but Core does not call either service automatically.

| Factory | Useful when | The application still needs to |
| --- | --- | --- |
| `createPrintCapability()` | Browser, Electron, WebView, or another host needs its own print implementation | Generate printable PDF content, then call `print()` from a Print button or command |
| `createDownloadCapability()` | The host has its own file picker, native save API, or download policy | Generate the content and filename, then call `download()` from a Download button or command |

For example, a Print button can retrieve the service registered on this instance:

```ts
import {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  createInkLayer,
  createPrintCapability
} from '@inklayer-dev/core/capabilities'
import { createBrowserPrintProvider } from '@inklayer-dev/core'
import { buildPrintablePdf } from '@inklayer-dev/core/export/pdf'

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createPrintCapability(createBrowserPrintProvider())]
})

printButton.onclick = async () => {
  const printablePdf = await buildPrintablePdf(
    sourceBytes,
    core.annotations.repository.getAll(),
    { annotationTypes: core.annotationTypes }
  )
  const print = core.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.print)
  await print?.print({ content: printablePdf })
}
```

`sourceBytes` contains the original PDF bytes retained by the application. If only one module uses the Provider and already holds it directly, it can call the Provider without installing a Capability. Registration is useful when multiple application modules or custom plugins need to discover the same instance-scoped service. See [Print, export, and watermark](./output-and-security) for other output paths.

## Example: connect an application logger

`createLoggerCapability()` forwards Core warnings and listener errors to the logger supplied by your application:

::: code-group

```ts [main.ts]
import { createInkLayer, createLoggerCapability } from '@inklayer-dev/core/capabilities'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const appLogger = {
  warn(message: string) {
    console.warn('[PDF]', message)
  },
  error(message: string, cause?: unknown) {
    console.error('[PDF]', message, cause)
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createLoggerCapability(appLogger)]
})

await core.load({ url: '/documents/review.pdf' })
```

:::

The logger applies only to this Core instance. If console output is sufficient, use `createLoggerCapability(console)`.

## Example: replace the text editor

By default, Core uses its browser text editor for Free Text and Note annotations. An application can replace it with its own modal or component:

```ts
import type { TextInputProvider } from '@inklayer-dev/core'
import { createTextInputCapability } from '@inklayer-dev/core/capabilities'

const textInput: TextInputProvider = {
  async requestText(request) {
    const value = await openTextDialog({
      initialValue: request.initialValue ?? '',
      signal: request.signal
    })
    return { value }
  }
}

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createTextInputCapability(textInput)]
})
```

Here, `openTextDialog()` represents a dialog implemented by the application. After the user activates the Free Text or Note tool and clicks the page, Core calls `requestText()`; the returned text is then written to the annotation. Returning `null` cancels the edit.

## Example: reuse an annotation Repository

To keep annotation data outside the Core lifecycle, create a Repository and install it as a Capability:

```ts
import { createMemoryAnnotationRepository } from '@inklayer-dev/core'
import { createAnnotationRepositoryCapability } from '@inklayer-dev/core/capabilities'

const repository = createMemoryAnnotationRepository()

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [createAnnotationRepositoryCapability(repository)]
})

await core.destroy()

console.log(repository.getAll())
```

The Repository is borrowed by default, so destroying Core does not destroy it. Pass `{ ownership: 'owned' }` only when Core should destroy it. The Capability does not persist annotations by itself; subscribe to changes and save the serializable data as described in [Persist annotations](./persistence).

## When to create a custom Capability

Create a custom Capability when you want to package reusable, instance-scoped integration behavior that is not covered by a built-in factory. For example, this plugin reports the page count to application code whenever a document is loaded:

::: code-group

```ts [document-loaded.ts]
import type { InkLayerCapability } from '@inklayer-dev/core/capabilities'

export function createDocumentLoadedCapability(
  onLoaded: (pageCount: number) => void
): InkLayerCapability {
  return {
    id: 'acme:document-loaded',
    setup(context) {
      context.onReady(({ viewer }) => {
        return viewer.subscribe(event => {
          if (event.type === 'documentLoaded') {
            onLoaded(event.document.numPages)
          }
        })
      })
    }
  }
}
```

```ts [main.ts]
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import { createDocumentLoadedCapability } from './document-loaded'

const pageCount = document.querySelector<HTMLOutputElement>('#page-count')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  capabilities: [
    createDocumentLoadedCapability(count => {
      pageCount.textContent = `${count} pages`
    })
  ]
})
```

:::

`onReady()` runs after the Viewer and Annotation engines exist. Because the plugin returns the function from `viewer.subscribe()`, Core automatically removes the subscription when `core.destroy()` runs.

For setup order, service sharing, and cleanup rules, continue with [Plugin lifecycle and services](./plugin-lifecycle).
