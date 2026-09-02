/**
 * @file Serializable protocol and deterministic algorithm for regex page matching.
 * @description Keeps Worker messages independent from PDF.js and product state.
 */

/** One validated regex query sent to the isolated matcher. */
export interface RegexMatcherQuery {
  /** Stable caller identity returned with the query matches. */
  readonly id: string
  /** ECMAScript pattern source without delimiters. */
  readonly source: string
  /** Canonical flags containing only i, m, s, and u. */
  readonly flags: string
  /** Maximum matches to return for this page request. */
  readonly maxResults: number
}

/** One non-empty UTF-16 match returned by the isolated matcher. */
export interface RegexMatcherMatch {
  /** Zero-based source-text offset. */
  readonly start: number
  /** Positive source-text length. */
  readonly length: number
}

/** Ordered page matches for one regex query. */
export interface RegexMatcherQueryResult {
  /** Identity copied from the input query. */
  readonly id: string
  /** Non-overlapping matches in source order. */
  readonly matches: readonly RegexMatcherMatch[]
}

/** Request message sent to one regex Matcher Worker. */
export interface RegexMatcherRequest {
  /** Session-local request identity. */
  readonly requestId: number
  /** Extracted source text for one PDF page. */
  readonly text: string
  /** Ordered active regex queries. */
  readonly queries: readonly RegexMatcherQuery[]
}

/** Successful response from one regex Matcher Worker. */
export interface RegexMatcherSuccess {
  /** Session-local request identity. */
  readonly requestId: number
  /** Ordered results corresponding to the request queries. */
  readonly results: readonly RegexMatcherQueryResult[]
}

/** Failed response from one regex Matcher Worker. */
export interface RegexMatcherFailure {
  /** Session-local request identity. */
  readonly requestId: number
  /** Safe failure message without cloned Error state. */
  readonly error: string
}

/** Complete response union emitted by one regex Matcher Worker. */
export type RegexMatcherResponse = RegexMatcherSuccess | RegexMatcherFailure

/** Evaluates validated patterns deterministically for one extracted page. */
export function matchRegexPage(
  text: string,
  queries: readonly RegexMatcherQuery[]
): readonly RegexMatcherQueryResult[] {
  return queries.map((query) => {
    const expression = new RegExp(query.source, `${query.flags}g`)
    const matches: RegexMatcherMatch[] = []
    while (matches.length < query.maxResults) {
      const match = expression.exec(text)
      if (match === null) break
      const value = match[0]
      if (value.length === 0) {
        throw new TypeError(`Regex query "${query.id}" produced a zero-length match.`)
      }
      matches.push({ start: match.index, length: value.length })
    }
    return { id: query.id, matches }
  })
}
