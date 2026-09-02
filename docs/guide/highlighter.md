# Keyword Highlighter

New to this feature? Start with [Create your first keyword highlight](./first-keyword-highlight.md) to pass a prepared set of application terms directly to the Highlighter, or open the [Keyword Highlighter demo](https://core.inklayer.dev/demo/#highlighter).

The Keyword Highlighter is a headless workflow for turning application-owned
keyword rules into reviewed, permanent PDF highlight annotations. It composes
Viewer search and preview behavior with Annotation Engine persistence, while
leaving every button, panel, filter, and product decision to your application.

This guide builds the complete flow:

```text
rules → batch scan → temporary preview → review → permanent annotations → PDF export
```

If you only need one search box with next/previous navigation, use
[Search and text selection](./search-and-selection.md). If users manually
select text and click Highlight, use [Annotation tools and appearance](./annotations.md).
Use the Highlighter when one scan must find many terms, preview them by rule,
let a user review occurrences, and apply the accepted results in one operation.

## What the Highlighter owns

The Controller owns workflow state, not product UI and not the injected
engines:

```text
your panel or component
        ↓
KeywordHighlighter Controller
        ↓
Viewer: search · temporary layers · page navigation
Annotation Engine: permanent highlight annotations · repository · export
```

| Concern | Owner |
| --- | --- |
| Rule editor, result list, buttons, filters | Your application |
| Rules, matches, progress, review state, active match | Highlighter Controller |
| PDF text extraction and temporary preview layers | Viewer |
| Permanent Highlight annotations and duplicate detection | Annotation Engine |
| Saving application presets or server-side review state | Your application |

Core does not ship a fixed Highlighter panel. The same Controller can drive a
sidebar, table, command palette, modal review queue, or a framework component.

## Create the Controller

Install Core and create a normal composed instance first. This example uses
Page Flow so Canvas, TextLayer, and annotation surfaces are mounted for you:

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import {
  createKeywordHighlighter,
  type KeywordHighlighterSnapshot
} from '@inklayer-dev/core/highlighter'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

await core.load({ url: '/documents/review.pdf', range: 'auto' })

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})
```

`core.viewer` already provides batch search, range geometry, temporary layers,
document-generation tracking, and page navigation. `core.annotations` provides
canonical annotation lookup and batch text-markup creation. Passing these two
public engines directly is enough; do not pass PDF.js, Konva, DOM nodes, or
framework state into the Highlighter.

When using the low-level engines, provide objects that satisfy
`KeywordHighlighterViewerPort` and `KeywordHighlighterAnnotationPort`. The
maintained Vanilla example does this to connect page navigation to its own
single-page workspace.

## Define keyword rules

Rules are serializable application data. IDs must be stable and unique because
they participate in match identity, preview-layer identity, annotation
provenance, and duplicate detection.

```ts
import type { KeywordRule } from '@inklayer-dev/core/highlighter'

const rules: readonly KeywordRule[] = [
  {
    id: 'commercial-risk',
    label: 'Commercial risk',
    terms: ['liability', 'indemnity', 'termination'],
    color: '#ef4444',
    wholeWord: true,
    metadata: { category: 'legal-review' }
  },
  {
    id: 'dates',
    label: 'Important dates',
    terms: ['effective date', 'renewal date'],
    color: '#f59e0b',
    matchCase: false,
    maxResultsPerTerm: 250
  }
]

highlighter.setRules(rules)
```

| Field | Meaning |
| --- | --- |
| `id` | Stable unique rule identity |
| `label` | Product-facing group name |
| `terms` | Optional ordered literal terms searched in one shared batch |
| `patterns` | Optional ordered serializable regular-expression matchers |
| `color` | CSS color used for temporary and permanent highlights |
| `enabled` | Whether the rule participates in the next scan |
| `matchCase` | Require exact Unicode case |
| `wholeWord` | Reject matches next to word characters |
| `matchDiacritics` | Require exact Unicode diacritics |
| `maxResultsPerTerm` | Per-term safety limit |
| `metadata` | Bounded application-owned JSON data |

`setRules()` validates and normalizes the collection but does not scan. Empty
terms are removed, exact duplicates inside one rule are collapsed, and invalid
IDs, colors, limits, or rule counts throw a structured `InkLayerError`.

## Match structured values with regular expressions

Use `patterns` when a prepared review rule describes the shape of a value rather
than one fixed phrase. A rule may contain literal `terms`, regex `patterns`, or
both. At least one matcher must remain after normalization.

```ts
const structuredRules: readonly KeywordRule[] = [{
  id: 'structured-values',
  label: 'Dates and amounts',
  terms: ['payment due'],
  color: '#8b5cf6',
  patterns: [
    {
      id: 'iso-date',
      kind: 'regex',
      source: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
      flags: 'u',
      maxResults: 250
    },
    {
      id: 'rmb-amount',
      kind: 'regex',
      source: '(?:¥|RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
      flags: 'iu'
    }
  ]
}]

highlighter.setRules(structuredRules)
await highlighter.scan()
```

| Pattern field | Meaning |
| --- | --- |
| `id` | Stable identity unique within its owning rule |
| `kind` | Currently always `'regex'` |
| `source` | ECMAScript source without `/.../` delimiters |
| `flags` | Unique `i`, `m`, `s`, and `u` characters; normalized to `imsu` order |
| `maxResults` | Optional per-pattern retained-result limit |

Literal options such as `matchCase`, `wholeWord`, `matchDiacritics`, and
`maxResultsPerTerm` apply only to `terms`. A regex controls case through `i`
and its retained-result limit through `maxResults`. Prefer `u` for patterns
that may encounter Unicode text.

### Match semantics

Regex matching is page-scoped: one match cannot cross a PDF page boundary.
Results are ordered, non-overlapping complete matches. Capture groups are not
returned as separate results, and an expression that produces a zero-length
occurrence fails the scan explicitly.

Each `KeywordMatch` exposes both configured and observed values:

```ts
for (const match of highlighter.getSnapshot().matches) {
  console.log(match.pattern.id)       // stable application pattern ID
  console.log(match.pattern.source)   // configured term or regex source
  console.log(match.pattern.kind)     // 'text' or 'regex'
  console.log(match.matchedText)      // exact extracted PDF text
}
```

The compatibility field `match.term` contains the literal term or regex source.
New result UIs should display `matchedText` and use `pattern` for filters,
labels, and diagnostics. Pattern identity and semantics participate in stable
match and permanent-annotation IDs.

### Validation, execution, and CSP

`setRules()` validates pattern IDs, flags, syntax, source length, and limits
atomically. Direct Viewer `searchMany()` calls perform the same regex preflight
before extracting pages. Caller expressions execute in a dedicated,
terminable Worker with a per-page execution budget, so cancellation, document
replacement, and destruction do not wait for a long-running expression on the
UI thread.

Because the regex Worker is embedded in the package and created from a Blob
URL, a strict Content Security Policy must permit it, commonly with
`worker-src 'self' blob:`. This is separate from the configurable PDF.js Worker.
Treat imported expressions as code-like configuration: keep result limits,
surface structured errors, and do not silently retry a rejected pattern.

## Subscribe to immutable state

Every UI should render from `getSnapshot()` and `subscribe()`. Snapshots are
detached, immutable values; do not mutate matches or keep a second editable
copy of the workflow state.

```ts
let snapshot: KeywordHighlighterSnapshot = highlighter.getSnapshot()

function render(next: KeywordHighlighterSnapshot) {
  snapshot = next
  status.textContent = next.error?.message
    ?? (next.status === 'scanning'
      ? `Scanning ${next.progress?.percentage ?? 0}%`
      : `${next.includedCount} included · ${next.excludedCount} excluded`)

  progress.hidden = next.status !== 'scanning'
  progress.value = next.progress?.percentage ?? 0
  scanButton.disabled = next.status === 'scanning' || next.status === 'applying'
  cancelButton.disabled = next.status !== 'scanning'
  applyButton.disabled = next.status !== 'ready' || next.includedCount === 0
  renderMatches(next)
}

const unsubscribe = highlighter.subscribe(render)
render(highlighter.getSnapshot())
```

| Status | UI meaning |
| --- | --- |
| `idle` | Rules may be edited; no current review result |
| `scanning` | Show progress and enable cancellation |
| `ready` | Matches can be reviewed, activated, and applied |
| `applying` | Disable conflicting actions while geometry is resolved |
| `error` | Present `snapshot.error` and allow an explicit retry |
| `destroyed` | The Controller can no longer be used |

`generation` increases when committed workflow state changes. Use `match.id`,
not an array index, as the key for rendered result rows.

## Scan and cancel

Start one batch scan after the Viewer has a ready document:

```ts
scanButton.addEventListener('click', () => {
  void highlighter.scan({ maxTotalResults: 5_000 }).catch(showError)
})

cancelButton.addEventListener('click', () => {
  highlighter.cancelScan()
})
```

The Viewer shares page-text extraction across all terms and patterns instead of scanning the
document once per rule. Starting a new scan supersedes stale work. Replacing or
closing the document also invalidates pending work and clears Controller-owned
preview state.

`snapshot.truncated` becomes `true` when a per-term or batch-wide result limit
omits occurrences. Keep the retained matches usable, but tell the user that the
review is incomplete. Cancellation rejects with `PDF_FEATURE_CANCELLED`; treat
it as an expected user outcome rather than a broken document.

An external `AbortSignal` can be composed with the Controller-owned cancel
button:

```ts
const abortController = new AbortController()
const pendingScan = highlighter.scan({ signal: abortController.signal })

abortController.abort()
try {
  await pendingScan
} catch (error) {
  // Cancellation rejects with an InkLayer highlighter error.
  showError(error)
}
```

## Render and review matches

Matches are ordered deterministically by page, rule, matcher, and source offset.
Group them by `ruleId`, display `preview` as context, and expose the Controller
methods directly from product event handlers.

```ts
function renderMatches(current: KeywordHighlighterSnapshot) {
  results.replaceChildren()

  for (const rule of current.rules) {
    const matches = current.matches.filter(match => match.ruleId === rule.id)
    if (matches.length === 0) continue

    const group = document.createElement('section')
    const heading = document.createElement('h3')
    heading.textContent = `${rule.label} · ${matches.length}`
    group.append(heading)

    for (const match of matches) {
      const row = document.createElement('label')
      const include = document.createElement('input')
      const activate = document.createElement('button')

      include.type = 'checkbox'
      include.checked = match.reviewState === 'included'
      include.addEventListener('change', () => {
        if (include.checked) highlighter.includeMatch(match.id)
        else highlighter.excludeMatch(match.id)
      })

      activate.type = 'button'
      activate.textContent = `Page ${match.range.pageIndex + 1} · ${match.matchedText}`
      activate.title = match.preview
      activate.addEventListener('click', () => highlighter.activateMatch(match.id))

      row.classList.toggle('active', current.activeMatchId === match.id)
      row.append(include, activate)
      group.append(row)
    }

    results.append(group)
  }
}
```

`activateMatch(id)` marks the occurrence active and calls the Viewer port's
`goToPage()`. The application still owns focus, scrolling within its result
list, and whether the navigation panel closes on a narrow screen.

For group-level controls, call `includeRule(rule.id)` or
`excludeRule(rule.id)`. Excluding a match removes it from temporary preview and
from the next apply pass; it does not delete an annotation created earlier.

## Temporary preview versus permanent annotation

These are deliberately separate states:

| Behavior | Temporary preview | Permanent Highlight annotation |
| --- | --- | --- |
| Created by | `scan()` and review methods | `applyMatches()` |
| Owned by | Viewer text-highlight layers | Annotation repository |
| Saved or synchronized | No | Yes, when your repository is persisted |
| Included in PDF export | No | Yes |
| Removed by `clearPreview()` | Yes | No |
| Removed by `reset()` | Yes | No |

Temporary layers use semantic TextLayer marks and remain readable through a
translucent rule color. They are restored when a virtualized TextLayer remounts.
Permanent annotations use canonical page geometry, permissions, undo behavior,
repository events, printing, and PDF export.

## Apply reviewed matches

Apply only the currently included matches:

```ts
applyButton.addEventListener('click', () => {
  void highlighter.applyMatches({
    extensions: {
      review: { workflowId: 'contract-review-42' }
    }
  }).then(result => {
    console.log('Created', result.createdAnnotationIds)
    console.log('Already existed', result.skippedMatchIds)
  }).catch(showError)
})
```

The Controller resolves source ranges to unscaled page rectangles, then asks
the Annotation Engine to create standard `highlight` annotations. It generates
deterministic annotation IDs from document and match identity. Running the same
apply operation again skips existing annotations instead of duplicating them.

Application is intentionally not transactional. If a later batch fails after
earlier annotations were created, those canonical annotations remain and the
next snapshot reconciles their IDs. Display both `createdAnnotationIds` and
`skippedMatchIds` when that distinction matters to the user.

## Export a highlighted PDF

Temporary preview layers are DOM presentation and do not enter a PDF by themselves. Convert the reviewed matches to standard Highlight annotations, then use the normal annotated-PDF builder:

```ts
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

await highlighter.applyMatches()

const output = await buildAnnotatedPdf(
  sourcePdfBytes,
  core.annotations.repository.getAll(),
  { annotationTypes: core.annotationTypes }
)
```

This output keeps the original PDF text searchable and selectable. The [Keyword Highlighter demo](https://core.inklayer.dev/demo/#highlighter) performs the same conversion in a temporary export repository, so clicking **Export** does not add permanent annotations to the active review session.

## Clear, reset, replace, and destroy

Choose the operation that matches the user's intent:

| Operation | Rules | Matches and review | Temporary preview | Permanent annotations |
| --- | --- | --- | --- | --- |
| `clearPreview()` | Keep | Keep | Clear | Keep |
| `reset()` | Clear | Clear | Clear | Keep |
| Viewer document replacement | Keep rules | Clear stale results | Clear | Repository policy decides |
| `destroy()` | Release | Release | Clear owned layers | Keep |

Destroy in ownership order. The Controller does not own the Viewer or
Annotation Engine that were injected into it:

```ts
async function unmountHighlighter() {
  unsubscribe()
  highlighter.destroy()
  await core.destroy()
}
```

Always destroy the Highlighter before destroying the engines. Destruction
cancels pending work, removes only this Controller's preview layers, and makes
future method calls fail explicitly.

## Handle errors and limits

Present structured failures inside the Highlighter surface, while keeping the
loaded document usable whenever the error permits retry:

```ts
import { InkLayerError } from '@inklayer-dev/core'

function showError(cause: unknown) {
  if (cause instanceof InkLayerError) {
    if (cause.code === 'PDF_FEATURE_CANCELLED') {
      status.textContent = 'Scan cancelled.'
      return
    }
    status.textContent = cause.message
    status.dataset.state = 'error'
    return
  }
  status.textContent = 'Unexpected Highlighter failure.'
}
```

Common application mistakes are scanning before a document is ready, using
duplicate rule or pattern IDs, keeping no enabled matchers, passing invalid
regex syntax or a CSS color, and
destroying the Viewer before the Controller. Use result limits for untrusted or
very large rule sets, and show a warning whenever `snapshot.truncated` is true.

## Consume the same Controller from React or Vue

Do not create a second workflow model in a framework store. Subscribe to the
same immutable Controller snapshot and call Controller methods from event
handlers.

### React

```tsx
const controller = useMemo(
  () => createKeywordHighlighter({ viewer, annotations }),
  [viewer, annotations]
)

const snapshot = useSyncExternalStore(
  controller.subscribe,
  controller.getSnapshot,
  controller.getSnapshot
)

useEffect(() => () => controller.destroy(), [controller])
```

Keep `viewer` and `annotations` identities stable, use `match.id` as the React
key, and update rules in a separate effect. See the maintained
[React fixture](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/framework-consumers/react-keyword-highlighter.tsx).

### Vue

```ts
const controller = createKeywordHighlighter({ viewer, annotations })
const snapshot = shallowRef(controller.getSnapshot())
const unsubscribe = controller.subscribe(next => { snapshot.value = next })

onScopeDispose(() => {
  unsubscribe()
  controller.destroy()
})
```

Expose `readonly(snapshot)` to templates and watch application-owned rules
separately. See the maintained
[Vue fixture](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/framework-consumers/vue-keyword-highlighter.ts).

## Product extension points

The headless boundary leaves room for product-specific behavior without
forking Core:

- save and load rule presets in your own database;
- filter the rendered snapshot by rule, page, or review state;
- add keyboard navigation around `activateMatch()`;
- export match review data before or after permanent application;
- attach application metadata through rule `metadata` and apply `extensions`;
- use multiple independently owned Controllers over one Viewer;
- replace the sidebar with a table, command palette, or guided review flow.

Do not mutate `KeywordMatch` values, create permanent annotation geometry from
DOM rectangles yourself, or infer duplicate identity from array position. The
Controller and the two public engine ports already own those invariants.

## Integration checklist

- Create the Controller after Viewer and Annotation Engine are available.
- Give every rule a stable unique ID and valid CSS color.
- Render only from immutable snapshots and key rows by `match.id`.
- Show scanning, applying, error, cancellation, and truncation states.
- Keep included/excluded review controls separate from permanent annotations.
- Call `applyMatches()` only from an explicit product action.
- Explain created versus skipped duplicate results when relevant.
- Destroy subscriptions and the Controller before destroying Core.

For exact signatures, see the [Keyword Highlighter API](../api.md#keyword-highlighter).
For the complete product-owned panel, read the maintained
[Vanilla implementation](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/vanilla/src/ui/highlighter-panel.ts).
