/**
 * @file Public framework-neutral Highlighter contracts.
 * @description Defines literal and regex rules, matches, snapshots, ports, and
 * lifecycle controls for the optional Highlighter package entry.
 */

import type { Annotation } from '../domain/annotation'
import type {
  CreateTextMarkupRangeInput,
  CreateTextMarkupsFromRangesOptions
} from '../annotation/annotation-engine'
import type { InkLayerError } from '../domain/errors'
import type { JsonObject } from '../domain/json-value'
import type {
  PdfSearchManyOptions,
  PdfSearchManyProgress,
  PdfSearchManyInputQuery,
  PdfSearchManyResult,
  PdfResolvedTextRange,
  PdfResolveTextRangesOptions,
  PdfTextHighlightLayer,
  PdfTextRange,
  PdfViewerSnapshot
} from '../viewer/types'
import type { PdfViewerListener } from '../viewer/events'

/** Viewer behavior required by the framework-neutral Highlighter Controller. */
export interface KeywordHighlighterViewerPort {
  /** Returns current lifecycle and document-generation identity. */
  getSnapshot(): PdfViewerSnapshot
  /** Observes document generation changes without taking Viewer ownership. */
  subscribe(listener: PdfViewerListener): () => void
  /** Searches ordered queries while sharing document extraction work. */
  searchMany(
    queries: readonly PdfSearchManyInputQuery[],
    options?: PdfSearchManyOptions
  ): Promise<PdfSearchManyResult>
  /** Resolves source text offsets to canonical page-local rectangles. */
  resolveTextRanges(
    ranges: readonly PdfTextRange[],
    options?: PdfResolveTextRangesOptions
  ): Promise<readonly PdfResolvedTextRange[]>
  /** Atomically replaces all temporary layers owned by the caller. */
  setTextHighlightLayers(layers: readonly PdfTextHighlightLayer[]): void
  /** Removes all layers, or only the supplied stable layer identities. */
  clearTextHighlightLayers(layerIds?: readonly string[]): void
  /** Navigates the owned Viewer to one zero-based page. */
  goToPage(pageIndex: number): void
}

/** Annotation behavior required by the framework-neutral Highlighter Controller. */
export interface KeywordHighlighterAnnotationPort {
  /** Returns detached canonical annotations for stable-ID duplicate checks. */
  getAnnotations(): readonly Annotation[]
  /** Creates canonical text markups through permissions and repository behavior. */
  createTextMarkupsFromRanges(
    type: 'highlight' | 'strikeout' | 'underline',
    inputs: readonly CreateTextMarkupRangeInput[],
    options?: CreateTextMarkupsFromRangesOptions
  ): readonly Annotation[]
}

/** Serializable group of related literal terms, patterns, and matching behavior. */
export interface KeywordRule {
  /** Stable unique identity used by matches, layers, and persistence. */
  readonly id: string
  /** User-visible group name. */
  readonly label: string
  /** Ordered literal search terms normalized by the Controller. */
  readonly terms?: readonly string[]
  /** Ordered structured matchers evaluated after literal terms. */
  readonly patterns?: readonly KeywordPattern[]
  /** CSS color used for preview and permanent highlights. */
  readonly color: string
  /** Whether this rule participates in scanning; defaults to true. */
  readonly enabled?: boolean
  /** Whether Unicode case must match exactly; defaults to false. */
  readonly matchCase?: boolean
  /** Whether adjacent word characters invalidate a match; defaults to false. */
  readonly wholeWord?: boolean
  /** Whether Unicode diacritics must match exactly; defaults to false. */
  readonly matchDiacritics?: boolean
  /** Maximum retained occurrences for each term; defaults to Core's search limit. */
  readonly maxResultsPerTerm?: number
  /** Bounded application data retained without interpretation. */
  readonly metadata?: JsonObject
}

/** One serializable regular-expression matcher owned by a Highlighter rule. */
export interface KeywordRegexPattern {
  /** Stable identity used in query, match, and permanent-annotation IDs. */
  readonly id: string
  /** Discriminator reserved for future matcher kinds. */
  readonly kind: 'regex'
  /** ECMAScript regular-expression source without slash delimiters. */
  readonly source: string
  /** ECMAScript flags limited to unique i, m, s, and u characters. */
  readonly flags?: string
  /** Maximum retained occurrences for this pattern. */
  readonly maxResults?: number
}

/** Matcher kinds accepted by the first pattern-aware Highlighter contract. */
export type KeywordPattern = KeywordRegexPattern

/** Serializable matcher identity attached to every pattern-aware match. */
export interface KeywordMatchPattern {
  /** Stable pattern identity within its owning rule. */
  readonly id: string
  /** Matcher implementation that produced the occurrence. */
  readonly kind: 'text' | 'regex'
  /** Literal term or regular-expression source used for the scan. */
  readonly source: string
  /** Canonical regular-expression flags; absent for literal terms. */
  readonly flags?: string
}

/** User-controlled eligibility of one keyword occurrence. */
export type KeywordMatchReviewState = 'included' | 'excluded'

/** One deterministic keyword occurrence projected into product state. */
export interface KeywordMatch {
  /** Stable document/rule/matcher/range-derived identity. */
  readonly id: string
  /** Rule that produced this occurrence. */
  readonly ruleId: string
  /** Literal term or regex source retained for compatibility. */
  readonly term: string
  /** Stable matcher identity and source used to produce this occurrence. */
  readonly pattern: KeywordMatchPattern
  /** Exact extracted PDF text covered by this occurrence. */
  readonly matchedText: string
  /** Source range suitable for temporary highlighting and later resolution. */
  readonly range: PdfTextRange
  /** Compact surrounding source text for framework result lists. */
  readonly preview: string
  /** Whether permanent application currently includes this occurrence. */
  readonly reviewState: KeywordMatchReviewState
  /** Existing or newly created deterministic annotation identity. */
  readonly annotationId?: string
}

/** Observable lifecycle state of one Highlighter Controller. */
export type KeywordHighlighterStatus =
  | 'idle'
  | 'scanning'
  | 'ready'
  | 'applying'
  | 'error'
  | 'destroyed'

/** Immutable detached state consumed directly by any UI framework. */
export interface KeywordHighlighterSnapshot {
  /** Current Controller lifecycle state. */
  readonly status: KeywordHighlighterStatus
  /** Monotonic generation guarding stale scan and apply work. */
  readonly generation: number
  /** Current normalized rules in caller order. */
  readonly rules: readonly KeywordRule[]
  /** Current deterministic matches in page/rule/term/source order. */
  readonly matches: readonly KeywordMatch[]
  /** Active match identity, or null when no match is active. */
  readonly activeMatchId: string | null
  /** Number of matches eligible for permanent application. */
  readonly includedCount: number
  /** Number of matches explicitly excluded by the user. */
  readonly excludedCount: number
  /** Page-level scan progress, or null outside scanning. */
  readonly progress: PdfSearchManyProgress | null
  /** Whether any per-term or batch-wide result limit omitted matches. */
  readonly truncated: boolean
  /** Last structured operation error, or null outside the error state. */
  readonly error: InkLayerError | null
}

/** Additional controls for one explicit Highlighter scan. */
export interface KeywordScanOptions {
  /** External cancellation composed with Controller-owned cancellation. */
  readonly signal?: AbortSignal
  /** Batch-wide safety limit applied in addition to rule term limits. */
  readonly maxTotalResults?: number
}

/** Controls conversion of reviewed keyword matches into annotations. */
export interface ApplyKeywordMatchesOptions {
  /** External cancellation for geometry resolution before repository mutation. */
  readonly signal?: AbortSignal
  /** Additional bounded application data merged with Core provenance. */
  readonly extensions?: JsonObject
}

/** Result of one permanent-annotation application pass. */
export interface ApplyKeywordMatchesResult {
  /** Canonical annotation identities created during this pass. */
  readonly createdAnnotationIds: readonly string[]
  /** Match identities skipped because their deterministic annotations exist. */
  readonly skippedMatchIds: readonly string[]
}

/** Construction dependencies for one independently owned Controller. */
export interface KeywordHighlighterOptions {
  /** Viewer search, geometry, preview, navigation, and generation behavior. */
  readonly viewer: KeywordHighlighterViewerPort
  /** Annotation lookup and permanent text-markup behavior. */
  readonly annotations: KeywordHighlighterAnnotationPort
  /** Receives listener failures without interrupting Controller state. */
  readonly onListenerError?: (cause: unknown) => void
}

/** Framework-neutral keyword-highlighting workflow Controller. */
export interface KeywordHighlighter {
  /** Returns the stable immutable snapshot until the next committed change. */
  readonly getSnapshot: () => KeywordHighlighterSnapshot
  /** Subscribes synchronously and returns an idempotent unsubscribe function. */
  readonly subscribe: (
    listener: (snapshot: KeywordHighlighterSnapshot) => void
  ) => () => void
  /** Replaces and normalizes all keyword rules without scanning automatically. */
  setRules(rules: readonly KeywordRule[]): void
  /** Scans the active document and atomically commits current matches. */
  scan(options?: KeywordScanOptions): Promise<void>
  /** Cancels current Controller-owned scan work idempotently. */
  cancelScan(): void
  /** Activates and navigates to one current match. */
  activateMatch(id: string): void
  /** Makes one current match eligible for permanent application. */
  includeMatch(id: string): void
  /** Excludes one current match from permanent application. */
  excludeMatch(id: string): void
  /** Includes every current match belonging to one rule. */
  includeRule(ruleId: string): void
  /** Excludes every current match belonging to one rule. */
  excludeRule(ruleId: string): void
  /** Resolves and creates permanent annotations for reviewed matches. */
  applyMatches(options?: ApplyKeywordMatchesOptions): Promise<ApplyKeywordMatchesResult>
  /** Removes Controller-owned temporary Viewer layers without deleting matches. */
  clearPreview(): void
  /** Clears rules, matches, review state, errors, and temporary layers. */
  reset(): void
  /** Cancels work and releases only resources owned by this Controller. */
  destroy(): void
}

/** Runtime factory signature retained before the package export is released. */
export type CreateKeywordHighlighter = (
  options: KeywordHighlighterOptions
) => KeywordHighlighter
