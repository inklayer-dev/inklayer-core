# Create your first keyword highlight

Continue with the same `core` instance from [Getting started](./getting-started.md). In this tutorial, your application already has a set of terms from a policy, review standard, or system configuration. You will pass those terms to Core and highlight every occurrence in the PDF.

Open the [Keyword Highlighter demo](https://core.inklayer.dev/demo/#highlighter) to review prepared matches, print them, or export a searchable PDF with editable Highlight annotations.

> [!IMPORTANT] NOTE
> Keyword highlights are temporary previews. They do not change the PDF or create saved annotations.

## Prepare the keywords

Define the terms your application needs to find. This example uses contract-review terms, but the array could also come from an API or saved system settings:

```ts
const contractRiskTerms = [
  'liability',
  'termination',
  'indemnity'
]
```

## Highlight the keywords

Create the Highlighter, pass in the prepared terms, and scan the loaded PDF:

```ts
import { createKeywordHighlighter } from '@inklayer-dev/core/highlighter'

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})

highlighter.setRules([{
  id: 'contract-risks',
  label: 'Contract risks',
  terms: contractRiskTerms,
  color: '#facc15'
}])

await highlighter.scan()

const { matches } = highlighter.getSnapshot()
console.log(`Found ${matches.length} matches`)

if (matches[0]) {
  highlighter.activateMatch(matches[0].id)
}
```

`setRules()` accepts the prepared keyword group. `scan()` finds every occurrence and immediately displays the results as temporary yellow highlights. `activateMatch()` then moves the Viewer to the first result.

The rule `id` should remain stable when the same rule is reused. The `label` is a name your application can show to users, while `color` controls the preview color.

## Highlight prepared structured values

Some review standards define values by shape rather than by a fixed word. If your application already has prepared amount or date patterns, pass them as serializable `patterns` in exactly the same workflow:

```ts
import type { KeywordRule } from '@inklayer-dev/core/highlighter'

const structuredReviewRules: readonly KeywordRule[] = [{
  id: 'structured-values',
  label: 'Dates and amounts',
  color: '#8b5cf6',
  patterns: [
    {
      id: 'iso-date',
      kind: 'regex',
      source: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
      flags: 'u'
    },
    {
      id: 'rmb-amount',
      kind: 'regex',
      source: '(?:¥|RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
      flags: 'iu'
    }
  ]
}]

highlighter.setRules(structuredReviewRules)
await highlighter.scan()
```

Pass the regular-expression source without `/.../` delimiters. Keep each pattern `id` stable just like a rule ID. Core returns the exact PDF text in `match.matchedText`, so a result list can show `RMB 1,200.50` instead of displaying the expression itself. For supported flags, limits, page boundaries, and safety behavior, continue with the [complete Keyword Highlighter guide](./highlighter.md#match-structured-values-with-regular-expressions).

## Clean up

Release the Highlighter before destroying Core:

```ts
highlighter.destroy()
await core.destroy()
```

You now have a working keyword highlighter driven by application rules. To add multiple colored groups, a result list, review controls, cancellation, or permanent annotations, continue with the [complete Keyword Highlighter guide](./highlighter.md). To turn reviewed matches into an image-only document with no extractable page text, continue with [Create your first keyword redaction](./first-keyword-redaction.md).
