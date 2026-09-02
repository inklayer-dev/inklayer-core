/**
 * @file Dedicated browser Worker entry for interruptible regex matching.
 * @description Executes no PDF.js or DOM behavior and returns serializable ranges.
 */

import {
  matchRegexPage,
  type RegexMatcherRequest,
  type RegexMatcherResponse
} from './regex-matcher-protocol'

interface RegexWorkerScope {
  onmessage: ((event: MessageEvent<RegexMatcherRequest>) => void) | null
  postMessage(message: RegexMatcherResponse): void
}

const scope = globalThis as unknown as RegexWorkerScope

scope.onmessage = (event) => {
  const { requestId, text, queries } = event.data
  try {
    scope.postMessage({ requestId, results: matchRegexPage(text, queries) })
  } catch (cause) {
    scope.postMessage({
      requestId,
      error: cause instanceof Error ? cause.message : 'Regular-expression matching failed.'
    })
  }
}
