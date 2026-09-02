/** @file Compile-time contract proof for the public framework-neutral Highlighter API. */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  CreateTextMarkupRangeInput,
  CreateKeywordHighlighter,
  KeywordHighlighter,
  KeywordHighlighterAnnotationPort,
  KeywordHighlighterViewerPort,
  KeywordHighlighterSnapshot,
  KeywordMatch,
  KeywordMatchPattern,
  KeywordPattern,
  KeywordRegexPattern,
  KeywordRule,
  PdfRegexSearchManyQuery,
  PdfRegexSearchOptions,
  PdfResolvedTextRange,
  PdfSearchManyInputQuery,
  PdfSearchManyQuery,
  PdfSearchManyResult,
  PdfTextHighlightLayer
} from '../../src/highlighter'
import type { AnnotationEngine } from '../../src/annotation'
import type { PdfViewerEngine } from '../../src/viewer'

describe('Highlighter public contracts', () => {
  it('remain framework-neutral and directly subscribable', () => {
    expectTypeOf<CreateKeywordHighlighter>().toBeFunction()
    expectTypeOf<KeywordHighlighter['getSnapshot']>().returns.toEqualTypeOf<KeywordHighlighterSnapshot>()
    expectTypeOf<KeywordHighlighter['subscribe']>().toBeFunction()
  })

  it('keep rules, search results, and geometry readonly', () => {
    expectTypeOf<KeywordRule['terms']>().toEqualTypeOf<readonly string[] | undefined>()
    expectTypeOf<KeywordRule['patterns']>()
      .toEqualTypeOf<readonly KeywordPattern[] | undefined>()
    expectTypeOf<PdfSearchManyResult['queries']>()
      .toEqualTypeOf<readonly PdfSearchManyResult['queries'][number][]>()
    expectTypeOf<PdfResolvedTextRange['rects']>()
      .toEqualTypeOf<readonly PdfResolvedTextRange['rects'][number][]>()
    expectTypeOf<PdfTextHighlightLayer['ranges']>()
      .toEqualTypeOf<readonly PdfTextHighlightLayer['ranges'][number][]>()
  })

  it('uses the Annotation Engine permanent-markup contract directly', () => {
    expectTypeOf<AnnotationEngine>().toMatchTypeOf<KeywordHighlighterAnnotationPort>()
    expectTypeOf<PdfViewerEngine>().toMatchTypeOf<KeywordHighlighterViewerPort>()
    expectTypeOf<CreateTextMarkupRangeInput['range']>().toEqualTypeOf<PdfResolvedTextRange>()
  })

  it('publishes serializable pattern-aware regex inputs and matches', () => {
    expectTypeOf<KeywordRegexPattern['kind']>().toEqualTypeOf<'regex'>()
    expectTypeOf<KeywordRegexPattern['source']>().toEqualTypeOf<string>()
    expectTypeOf<KeywordPattern>().toEqualTypeOf<KeywordRegexPattern>()
    expectTypeOf<KeywordMatchPattern['kind']>().toEqualTypeOf<'text' | 'regex'>()
    expectTypeOf<KeywordMatch['matchedText']>().toEqualTypeOf<string>()
    expectTypeOf<PdfRegexSearchOptions['flags']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<PdfRegexSearchManyQuery['kind']>().toEqualTypeOf<'regex'>()
    expectTypeOf<PdfSearchManyInputQuery>()
      .toEqualTypeOf<PdfSearchManyQuery | PdfRegexSearchManyQuery>()
  })
})
