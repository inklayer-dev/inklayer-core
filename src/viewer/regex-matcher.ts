/**
 * @file Interruptible browser Worker adapter for page-scoped regex matching.
 * @description Isolates caller patterns from the UI thread and terminates them
 * on cancellation, destruction, Worker failure, or execution-budget expiry.
 */

import { InkLayerError } from '../domain/errors'
import RegexMatcherWorker from './regex-matcher-worker.ts?worker&inline'
import {
  matchRegexPage,
  type RegexMatcherQuery,
  type RegexMatcherQueryResult,
  type RegexMatcherResponse
} from './regex-matcher-protocol'

const REGEX_PAGE_EXECUTION_BUDGET_MS = 2_000

/** One independently cancellable regex scan session. */
export interface RegexMatcherSession {
  /** Matches all active regex queries against one page of extracted text. */
  matchPage(
    text: string,
    queries: readonly RegexMatcherQuery[],
    signal: AbortSignal
  ): Promise<readonly RegexMatcherQueryResult[]>
  /** Terminates owned execution resources idempotently. */
  destroy(): void
}

/** Creates one independently owned regex matcher session. */
export type RegexMatcherFactory = () => RegexMatcherSession

/** Creates the production browser Worker matcher lazily for one batch scan. */
export function createBrowserRegexMatcher(): RegexMatcherSession {
  if (typeof Worker === 'undefined') {
    throw new InkLayerError(
      'ENVIRONMENT_UNSUPPORTED',
      'Regular-expression PDF search requires browser Worker support.',
      { operation: 'searchMany' }
    )
  }
  return new BrowserRegexMatcherSession(new RegexMatcherWorker({
    name: 'inklayer-regex-matcher'
  }))
}

/** Creates a deterministic non-isolated matcher for unit tests only. */
export function createInlineRegexMatcher(): RegexMatcherSession {
  let destroyed = false
  return {
    /** Runs the shared Worker algorithm synchronously around cancellation checks. */
    matchPage: async (text, queries, signal) => {
      if (destroyed || signal.aborted) throw regexCancelled()
      const results = matchRegexPage(text, queries)
      if (destroyed || signal.aborted) throw regexCancelled()
      return results
    },
    /** Marks this test session as unavailable. */
    destroy: () => {
      destroyed = true
    }
  }
}

/** Browser Worker session with one sequential page request at a time. */
class BrowserRegexMatcherSession implements RegexMatcherSession {
  private readonly worker: Worker
  private nextRequestId = 0
  private destroyed = false

  /** Retains the Worker owned exclusively by this batch scan. */
  public constructor(worker: Worker) {
    this.worker = worker
  }

  /** Matches one page or terminates the session when work cannot safely finish. */
  public async matchPage(
    text: string,
    queries: readonly RegexMatcherQuery[],
    signal: AbortSignal
  ): Promise<readonly RegexMatcherQueryResult[]> {
    if (this.destroyed || signal.aborted) throw regexCancelled()
    const requestId = this.nextRequestId += 1
    return await new Promise((resolve, reject) => {
      const finish = (): void => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', cancel)
        this.worker.removeEventListener('message', receive)
        this.worker.removeEventListener('error', fail)
      }
      const cancel = (): void => {
        finish()
        this.destroy()
        reject(regexCancelled())
      }
      const receive = (event: MessageEvent<RegexMatcherResponse>): void => {
        if (event.data.requestId !== requestId) return
        finish()
        if ('error' in event.data) {
          reject(regexFailure(event.data.error))
        } else {
          resolve(event.data.results)
        }
      }
      const fail = (): void => {
        finish()
        this.destroy()
        reject(regexFailure('Regular-expression Matcher Worker failed.'))
      }
      const timeout = setTimeout(() => {
        finish()
        this.destroy()
        reject(regexFailure('Regular-expression matching exceeded its page execution budget.'))
      }, REGEX_PAGE_EXECUTION_BUDGET_MS)
      signal.addEventListener('abort', cancel, { once: true })
      this.worker.addEventListener('message', receive)
      this.worker.addEventListener('error', fail, { once: true })
      this.worker.postMessage({ requestId, text, queries })
    })
  }

  /** Terminates this scan's Worker idempotently. */
  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.worker.terminate()
  }
}

/** Creates the cancellation error shared with batch search. */
function regexCancelled(): InkLayerError {
  return new InkLayerError('PDF_FEATURE_CANCELLED', 'PDF batch search was cancelled.', {
    operation: 'searchMany'
  })
}

/** Creates one structured isolated-matcher failure. */
function regexFailure(message: string): InkLayerError {
  return new InkLayerError('PDF_FEATURE_FAILED', message, { operation: 'searchMany' })
}
