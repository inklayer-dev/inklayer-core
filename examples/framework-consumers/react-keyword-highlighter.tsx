/**
 * @file React consumption fixture for the public Highlighter Controller.
 * @description Demonstrates direct Controller ownership and immutable snapshot
 * subscription without publishing or depending on an InkLayer React adapter.
 */

import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactElement
} from 'react'
import {
  createKeywordHighlighter,
  type KeywordHighlighterAnnotationPort,
  type KeywordHighlighterViewerPort,
  type KeywordRule
} from '@inklayer-dev/core/highlighter'

export interface ReactKeywordHighlighterExampleProps {
  /** Ready Viewer behavior consumed directly by the Controller. */
  readonly viewer: KeywordHighlighterViewerPort
  /** Annotation behavior used for permanent reviewed matches. */
  readonly annotations: KeywordHighlighterAnnotationPort
  /** Stable application-owned rule collection. */
  readonly rules: readonly KeywordRule[]
  /** Product error boundary for asynchronous scan and apply actions. */
  readonly onError: (cause: unknown) => void
}

/** Directly consumes one Core Controller with React's external-store contract. */
export function ReactKeywordHighlighterExample({
  viewer,
  annotations,
  rules,
  onError
}: ReactKeywordHighlighterExampleProps): ReactElement {
  const controller = useMemo(
    () => createKeywordHighlighter({ viewer, annotations }),
    [viewer, annotations]
  )
  useEffect(() => {
    controller.setRules(rules)
  }, [controller, rules])
  useEffect(() => () => controller.destroy(), [controller])
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  )
  const run = (operation: Promise<unknown>): void => { void operation.catch(onError) }

  return <section aria-label="Keyword Highlighter">
    <header>
      <strong>{snapshot.includedCount} included</strong>
      <span>{snapshot.excludedCount} excluded</span>
    </header>
    <button
      type="button"
      disabled={snapshot.status === 'scanning' || snapshot.status === 'applying'}
      onClick={() => run(controller.scan())}
    >Scan</button>
    <button
      type="button"
      disabled={snapshot.status !== 'ready' || snapshot.includedCount === 0}
      onClick={() => run(controller.applyMatches())}
    >Apply included</button>
    <ul>
      {snapshot.matches.map((match) => <li key={match.id}>
        <input
          type="checkbox"
          checked={match.reviewState === 'included'}
          aria-label={`Include ${match.term} on page ${match.range.pageIndex + 1}`}
          onChange={(event) => {
            if (event.currentTarget.checked) controller.includeMatch(match.id)
            else controller.excludeMatch(match.id)
          }}
        />
        <button type="button" onClick={() => controller.activateMatch(match.id)}>
          Page {match.range.pageIndex + 1} · {match.preview}
        </button>
      </li>)}
    </ul>
  </section>
}
