/**
 * @file Instance-owned browser free-text input.
 * @description Creates one textarea below the supplied engine root and removes
 * every listener and DOM node on submit, blur, escape, or abort.
 */

import type { TextInputProvider, TextInputRequest, TextInputResult } from '../../ports/text-input'

/** Creates the default browser textarea provider. */
export function createBrowserTextInputProvider(): TextInputProvider {
  return { requestText }
}

/** Runs one fully owned textarea input session. */
function requestText(request: TextInputRequest): Promise<TextInputResult> {
  return new Promise((resolve) => {
    const textarea = request.root.ownerDocument.createElement('textarea')
    textarea.className = 'inklayer-text-input'
    textarea.setAttribute('aria-label', 'Annotation text')
    textarea.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter Escape')
    textarea.value = request.initialValue ?? ''
    Object.assign(textarea.style, {
      position: 'absolute',
      left: `${request.bounds.x}px`,
      top: `${request.bounds.y}px`,
      width: `${Math.max(request.bounds.width, 80)}px`,
      minHeight: `${Math.max(request.bounds.height, 32)}px`
    })
    let settled = false

    /** Resolves once and releases all session resources. */
    function finish(value: string | null, restoreFocus = false): void {
      if (settled) return
      settled = true
      request.signal.removeEventListener('abort', handleAbort)
      textarea.removeEventListener('blur', handleBlur)
      textarea.removeEventListener('keydown', handleKeyDown)
      textarea.remove()
      if (restoreFocus && request.returnFocusTo?.isConnected === true) {
        queueMicrotask(() => request.returnFocusTo?.focus({ preventScroll: true }))
      }
      resolve({ value })
    }

    /** Cancels the session after engine abort. */
    function handleAbort(): void {
      finish(null)
    }

    /** Submits the current value on blur. */
    function handleBlur(): void {
      finish(textarea.value)
    }

    /** Handles escape cancellation and modifier-enter submission. */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(null, true)
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        finish(textarea.value, true)
      }
    }

    request.signal.addEventListener('abort', handleAbort, { once: true })
    textarea.addEventListener('blur', handleBlur)
    textarea.addEventListener('keydown', handleKeyDown)
    request.root.append(textarea)
    textarea.focus()
    if (request.initialValue !== undefined) textarea.select()
    if (request.signal.aborted) finish(null)
  })
}
