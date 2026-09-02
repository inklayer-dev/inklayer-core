/**
 * @file Deterministic regular-expression matcher protocol tests.
 * @description Verifies exact UTF-16 ranges, ECMAScript flags, non-overlap,
 * complete-match projection, result bounds, ordering, and zero-length failure.
 */

import { describe, expect, it } from 'vitest'
import { matchRegexPage } from '../../../src/viewer/regex-matcher-protocol'

describe('regex matcher protocol', () => {
  it('returns exact amount and date ranges after astral Unicode text', () => {
    const text = '😀 金额 ¥1,200.50，日期 2026-08-31'

    expect(matchRegexPage(text, [
      {
        id: 'amount',
        source: '(?:¥|RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
        flags: 'iu',
        maxResults: 10
      },
      {
        id: 'date',
        source: '\\d{4}-\\d{2}-\\d{2}',
        flags: 'u',
        maxResults: 10
      }
    ])).toEqual([
      { id: 'amount', matches: [{ start: text.indexOf('¥'), length: '¥1,200.50'.length }] },
      { id: 'date', matches: [{ start: text.indexOf('2026'), length: '2026-08-31'.length }] }
    ])
    expect(text.indexOf('¥')).toBe(6)
  })

  it('honors i, m, s, and u without changing the complete-match result shape', () => {
    const text = '标题\nBEGIN\n风险😀值\nEND'

    expect(matchRegexPage(text, [{
      id: 'block',
      source: '^begin$(.*)^end$',
      flags: 'imsu',
      maxResults: 5
    }])).toEqual([{
      id: 'block',
      matches: [{
        start: text.indexOf('BEGIN'),
        length: 'BEGIN\n风险😀值\nEND'.length
      }]
    }])
  })

  it('returns non-overlapping complete matches and ignores capture groups', () => {
    expect(matchRegexPage('ababa aa aa', [
      { id: 'overlap', source: '(a)(ba)', flags: 'u', maxResults: 10 },
      { id: 'adjacent', source: '(a)(a)', flags: 'u', maxResults: 10 }
    ])).toEqual([
      { id: 'overlap', matches: [{ start: 0, length: 3 }] },
      { id: 'adjacent', matches: [{ start: 6, length: 2 }, { start: 9, length: 2 }] }
    ])
  })

  it('preserves query order and bounds each query independently', () => {
    expect(matchRegexPage('1 2 3 alpha beta', [
      { id: 'words', source: '[a-z]+', flags: 'u', maxResults: 1 },
      { id: 'digits', source: '\\d', flags: 'u', maxResults: 2 }
    ])).toEqual([
      { id: 'words', matches: [{ start: 6, length: 5 }] },
      { id: 'digits', matches: [{ start: 0, length: 1 }, { start: 2, length: 1 }] }
    ])
  })

  it('fails if any occurrence is zero-length, including after a valid match', () => {
    expect(() => matchRegexPage('ab', [{
      id: 'eventually-empty', source: 'a|(?=b)', flags: 'u', maxResults: 10
    }])).toThrowError('Regex query "eventually-empty" produced a zero-length match.')
  })
})
