/**
 * @file Browser PDF print provider.
 * @description Owns a hidden iframe and object URL, invokes the system dialog,
 * and releases temporary browser resources after printing.
 */

import type { PrintProvider, PrintRequest } from '../../ports/print'

/** Browser dependencies injectable for deterministic tests and alternate hosts. */
export interface BrowserPrintEnvironment {
  /** Document receiving the temporary print iframe. */
  document?: Document
  /** Object URL implementation used for printable PDF content. */
  url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
}

/** Creates an instance-free provider that owns each print job independently. */
export function createBrowserPrintProvider(
  environment: BrowserPrintEnvironment = {}
): PrintProvider {
  return {
    print: async (request) => printPdfBlob(request, environment)
  }
}

/** Prints PDF content through a temporary hidden iframe. */
export async function printPdfBlob(
  request: PrintRequest,
  environment: BrowserPrintEnvironment = {}
): Promise<void> {
  if (request.signal?.aborted === true) throw printCancelled()
  const document = environment.document ?? globalThis.document
  const url = environment.url ?? globalThis.URL
  if (document === undefined || typeof url?.createObjectURL !== 'function') {
    throw new Error('Browser PDF printing is unavailable.')
  }
  const blob = request.content instanceof Blob
    ? request.content
    : new Blob([new Uint8Array(request.content)], { type: 'application/pdf' })
  const objectUrl = url.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.hidden = true
  iframe.setAttribute('aria-hidden', 'true')
  iframe.src = objectUrl
  const cleanup = (): void => {
    iframe.remove()
    url.revokeObjectURL(objectUrl)
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const cancel = (): void => reject(printCancelled())
      request.signal?.addEventListener('abort', cancel, { once: true })
      iframe.addEventListener('load', () => {
        request.signal?.removeEventListener('abort', cancel)
        const target = iframe.contentWindow
        if (target === null) return reject(new Error('Print frame is unavailable.'))
        target.addEventListener('afterprint', cleanup, { once: true })
        target.focus()
        target.print()
        resolve()
      }, { once: true })
      iframe.addEventListener('error', () => reject(new Error('Print frame failed to load.')), {
        once: true
      })
      document.body.append(iframe)
    })
  } catch (cause) {
    cleanup()
    throw cause instanceof Error ? cause : new Error('PDF print dialog could not be opened.')
  }
}

/** Creates a credential-free cancellation error. */
function printCancelled(): DOMException {
  return new DOMException('PDF printing was cancelled.', 'AbortError')
}
