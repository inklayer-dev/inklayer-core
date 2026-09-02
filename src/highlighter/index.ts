/** @file Public optional entry for the framework-neutral Highlighter workflow. */

export { createKeywordHighlighter } from './controller'

export type {
  ApplyKeywordMatchesOptions,
  ApplyKeywordMatchesResult,
  CreateKeywordHighlighter,
  KeywordHighlighter,
  KeywordHighlighterAnnotationPort,
  KeywordHighlighterOptions,
  KeywordHighlighterSnapshot,
  KeywordHighlighterStatus,
  KeywordHighlighterViewerPort,
  KeywordMatch,
  KeywordMatchPattern,
  KeywordMatchReviewState,
  KeywordPattern,
  KeywordRegexPattern,
  KeywordRule,
  KeywordScanOptions
} from './contracts'

export type {
  CreateTextMarkupRangeInput,
  CreateTextMarkupsFromRangesOptions
} from '../annotation/annotation-engine'

export type {
  PdfResolvedTextRange,
  PdfResolveTextRangesOptions,
  PdfRegexSearchManyQuery,
  PdfRegexSearchOptions,
  PdfSearchManyInputQuery,
  PdfSearchManyOptions,
  PdfSearchManyProgress,
  PdfSearchManyQuery,
  PdfSearchManyQueryResult,
  PdfSearchManyResult,
  PdfTextHighlightLayer,
  PdfTextHighlightStyle,
  PdfTextRange
} from '../viewer/types'
