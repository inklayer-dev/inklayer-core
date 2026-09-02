/**
 * @file Highlighter Controller unit tests.
 * @description Covers rule normalization, scan state, immutable snapshots,
 * cancellation, stale generations, listeners, multiple instances, and destroy.
 */

import { describe, expect, it, vi } from 'vitest'
import { InkLayerError } from '../../../src/domain/errors'
import { createKeywordHighlighter } from '../../../src/highlighter'
import type {
  KeywordHighlighterAnnotationPort,
  KeywordHighlighterViewerPort,
  KeywordRule
} from '../../../src/highlighter/contracts'
import type {
  PdfSearchManyOptions,
  PdfSearchManyInputQuery,
  PdfSearchManyResult,
  PdfViewerSnapshot
} from '../../../src/viewer/types'

interface FakePorts {
  readonly viewer: KeywordHighlighterViewerPort
  readonly annotations: KeywordHighlighterAnnotationPort
  readonly setViewerGeneration: (generation: number) => void
  readonly searchMany: ReturnType<typeof vi.fn<(
    queries: readonly PdfSearchManyInputQuery[],
    options?: PdfSearchManyOptions
  ) => Promise<PdfSearchManyResult>>>
  readonly clearLayers: ReturnType<typeof vi.fn>
}

/** Creates structural ports without constructing a browser Viewer or Annotation Engine. */
function createPorts(
  searchImplementation: (
    queries: readonly PdfSearchManyInputQuery[],
    options?: PdfSearchManyOptions
  ) => Promise<PdfSearchManyResult> = async (queries, options) => {
    options?.onProgress?.({ completedPages: 0, totalPages: 2, percentage: 0 })
    options?.onProgress?.({ completedPages: 2, totalPages: 2, percentage: 100 })
    return {
      truncated: false,
      queries: queries.map((query, queryIndex) => {
        const source = 'kind' in query ? query.source : query.query
        return {
          id: query.id,
          query: source,
          truncated: queryIndex === 1,
          matches: queryIndex === 0
            ? [{
                pageIndex: 1, matchIndex: 0, start: 8, length: source.length,
                text: source, preview: 'later'
              }]
            : [{
                pageIndex: 0, matchIndex: 0, start: 3, length: source.length,
                text: source, preview: 'earlier'
              }]
        }
      })
    }
  }
): FakePorts {
  let viewerGeneration = 4
  const searchMany = vi.fn(searchImplementation)
  const clearLayers = vi.fn()
  const viewerListeners = new Set<Parameters<KeywordHighlighterViewerPort['subscribe']>[0]>()
  const snapshot = (): PdfViewerSnapshot => ({
    status: 'ready',
    generation: viewerGeneration,
    document: {
      document: {} as NonNullable<PdfViewerSnapshot['document']>['document'],
      numPages: 2,
      fingerprints: ['document-fingerprint'],
      permissions: {
        print: 'high-resolution', copy: true, copyForAccessibility: true,
        modify: true, annotate: true, fillForms: true, assemble: true
      },
      passwordProtected: false
    },
    error: null,
    progress: null
  })
  return {
    viewer: {
      getSnapshot: snapshot,
      subscribe: (listener) => {
        viewerListeners.add(listener)
        return () => viewerListeners.delete(listener)
      },
      searchMany,
      resolveTextRanges: vi.fn(),
      setTextHighlightLayers: vi.fn(),
      clearTextHighlightLayers: clearLayers,
      goToPage: vi.fn()
    },
    annotations: {
      getAnnotations: vi.fn(() => []),
      createTextMarkupsFromRanges: vi.fn(() => [])
    },
    setViewerGeneration: (generation) => {
      viewerGeneration = generation
      for (const listener of viewerListeners) {
        listener({ type: 'stateChanged', snapshot: snapshot() })
      }
    },
    searchMany,
    clearLayers
  }
}

const RULES: readonly KeywordRule[] = [{
  id: ' risk ',
  label: ' Risk terms ',
  terms: [' payment ', '', 'payment', 'Liability'],
  color: '#ef4444',
  metadata: { severity: 'high' }
}]

describe('Highlighter Controller', () => {
  it('normalizes and detaches rules while preserving stable snapshot identity', () => {
    const ports = createPorts()
    const controller = createKeywordHighlighter(ports)
    const mutableRules = structuredClone(RULES)
    const originalRule = mutableRules[0]
    if (originalRule === undefined) throw new Error('Expected the rule fixture.')
    const initial = controller.getSnapshot()
    expect(Object.isFrozen(initial)).toBe(true)
    expect(controller.getSnapshot()).toBe(initial)
    const listener = vi.fn()
    controller.subscribe(listener)

    controller.setRules(mutableRules)
    const normalized = controller.getSnapshot()
    expect(normalized).toMatchObject({ status: 'idle', generation: 1, matches: [] })
    expect(normalized.rules).toEqual([{
      id: 'risk', label: 'Risk terms', terms: ['payment', 'Liability'], color: '#ef4444',
      enabled: true, matchCase: false, wholeWord: false, matchDiacritics: false,
      metadata: { severity: 'high' }
    }])
    expect(Object.isFrozen(normalized.rules)).toBe(true)
    expect(Object.isFrozen(normalized.rules[0]?.metadata)).toBe(true)
    ;(originalRule.metadata as { severity: string }).severity = 'mutated'
    expect(controller.getSnapshot().rules[0]?.metadata).toEqual({ severity: 'high' })

    controller.setRules([{
      ...originalRule, id: 'risk', label: 'Risk terms', terms: ['payment', 'Liability'],
      metadata: { severity: 'high' }
    }])
    expect(controller.getSnapshot()).toBe(normalized)
    expect(listener).toHaveBeenCalledOnce()
    controller.destroy()
  })

  it('rejects duplicate IDs, empty terms, invalid options, colors, and metadata', () => {
    const controller = createKeywordHighlighter(createPorts())
    const invalidRules: readonly (readonly KeywordRule[])[] = [
      [{ id: 'same', label: 'A', terms: ['a'], color: '#fff' },
        { id: ' same ', label: 'B', terms: ['b'], color: '#000' }],
      [{ id: 'empty', label: 'Empty', terms: [' ', ''], color: '#fff' }],
      [{ id: 'limit', label: 'Limit', terms: ['a'], color: '#fff', maxResultsPerTerm: 0 }],
      [{ id: 'color', label: 'Color', terms: ['a'], color: '' }],
      [{ id: 'metadata', label: 'Metadata', terms: ['a'], color: '#fff',
        metadata: { bad: Number.NaN } }],
      [{ id: 'no-matchers', label: 'No matchers', color: '#fff' }],
      [{ id: 'bad-regex', label: 'Bad regex', color: '#fff', patterns: [
        { id: 'broken', kind: 'regex', source: '(', flags: 'u' }
      ] }],
      [{ id: 'duplicate-pattern', label: 'Duplicate pattern', color: '#fff', patterns: [
        { id: 'amount', kind: 'regex', source: '\\d+', flags: 'u' },
        { id: ' amount ', kind: 'regex', source: '\\d{2}', flags: 'u' }
      ] }]
    ]
    for (const rules of invalidRules) {
      expect(() => controller.setRules(rules)).toThrowError(expect.objectContaining({
        code: 'PDF_FEATURE_FAILED', operation: 'setRules'
      }))
    }
    expect(controller.getSnapshot().rules).toEqual([])
    controller.destroy()
  })

  it('scans enabled terms with progress and commits page-first deterministic matches', async () => {
    const ports = createPorts()
    const controller = createKeywordHighlighter(ports)
    controller.setRules([
      ...RULES,
      { id: 'disabled', label: 'Disabled', terms: ['ignored'], color: '#000', enabled: false }
    ])
    const snapshots: Array<{ status: string; progress: number | null }> = []
    controller.subscribe((snapshot) => snapshots.push({
      status: snapshot.status,
      progress: snapshot.progress?.percentage ?? null
    }))

    await controller.scan({ maxTotalResults: 500 })
    expect(ports.searchMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'rule-0-term-0', query: 'payment' }),
      expect.objectContaining({ id: 'rule-0-term-1', query: 'Liability' })
    ], expect.objectContaining({ maxTotalResults: 500, signal: expect.any(AbortSignal) }))
    expect(snapshots).toEqual([
      { status: 'scanning', progress: null },
      { status: 'scanning', progress: 0 },
      { status: 'scanning', progress: 100 },
      { status: 'ready', progress: null }
    ])
    const ready = controller.getSnapshot()
    expect(ready).toMatchObject({
      status: 'ready', generation: 2, includedCount: 2, excludedCount: 0,
      activeMatchId: null, truncated: true, error: null
    })
    expect(ready.matches.map((match) => ({
      ruleId: match.ruleId, term: match.term, pageIndex: match.range.pageIndex,
      start: match.range.start, reviewState: match.reviewState
    }))).toEqual([
      { ruleId: 'risk', term: 'Liability', pageIndex: 0, start: 3, reviewState: 'included' },
      { ruleId: 'risk', term: 'payment', pageIndex: 1, start: 8, reviewState: 'included' }
    ])
    expect(ready.matches[0]?.id).toMatch(/^highlighter-match-[0-9a-f]{16}$/)
    expect(Object.isFrozen(ready.matches[0]?.range)).toBe(true)

    const firstIds = ready.matches.map((match) => match.id)
    await controller.scan()
    expect(controller.getSnapshot().matches.map((match) => match.id)).toEqual(firstIds)
    ports.setViewerGeneration(5)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'idle', matches: [], activeMatchId: null, truncated: false, error: null
    })
    controller.destroy()
  })

  it('normalizes regex-only rules and publishes pattern-aware matches', async () => {
    const ports = createPorts()
    const controller = createKeywordHighlighter(ports)
    controller.setRules([{
      id: 'amounts',
      label: 'Amounts',
      color: '#facc15',
      patterns: [{
        id: 'currency', kind: 'regex', source: '(?:¥|RMB\\s*)\\d+', flags: 'ui', maxResults: 25
      }]
    }])

    expect(controller.getSnapshot().rules[0]).toEqual({
      id: 'amounts', label: 'Amounts', color: '#facc15', terms: [],
      patterns: [{
        id: 'currency', kind: 'regex', source: '(?:¥|RMB\\s*)\\d+', flags: 'iu', maxResults: 25
      }],
      enabled: true, matchCase: false, wholeWord: false, matchDiacritics: false
    })

    await controller.scan()

    expect(ports.searchMany).toHaveBeenCalledWith([{
      id: 'rule-0-pattern-0',
      kind: 'regex',
      source: '(?:¥|RMB\\s*)\\d+',
      options: { flags: 'iu', maxResults: 25 }
    }], expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(controller.getSnapshot().matches[0]).toMatchObject({
      ruleId: 'amounts',
      term: '(?:¥|RMB\\s*)\\d+',
      pattern: {
        id: 'currency', kind: 'regex', source: '(?:¥|RMB\\s*)\\d+', flags: 'iu'
      },
      matchedText: '(?:¥|RMB\\s*)\\d+'
    })
    expect(Object.isFrozen(controller.getSnapshot().matches[0]?.pattern)).toBe(true)
    controller.destroy()
  })

  it('keeps mixed matcher order and gives same-source patterns distinct identities', async () => {
    const ports = createPorts(async (queries) => ({
      truncated: false,
      queries: queries.map((query, queryIndex) => ({
        id: query.id,
        query: 'kind' in query ? query.source : query.query,
        truncated: false,
        matches: [{
          pageIndex: 0, matchIndex: 0, start: queryIndex * 10,
          length: 2, text: queryIndex === 0 ? '风险' : '42', preview: 'preview'
        }]
      }))
    }))
    const controller = createKeywordHighlighter(ports)
    controller.setRules([{
      id: 'mixed', label: 'Mixed', terms: ['风险'], color: '#facc15',
      patterns: [
        { id: 'amount-primary', kind: 'regex', source: '\\d+', flags: 'u' },
        { id: 'amount-secondary', kind: 'regex', source: '\\d+', flags: 'u' }
      ]
    }])

    await controller.scan()

    expect(ports.searchMany.mock.calls[0]?.[0].map((query) => query.id)).toEqual([
      'rule-0-term-0', 'rule-0-pattern-1', 'rule-0-pattern-2'
    ])
    const matches = controller.getSnapshot().matches
    expect(matches.map((match) => match.pattern.kind)).toEqual(['text', 'regex', 'regex'])
    expect(matches[1]?.pattern.id).toBe('amount-primary')
    expect(matches[2]?.pattern.id).toBe('amount-secondary')
    expect(new Set(matches.map((match) => match.id)).size).toBe(3)
    controller.destroy()
  })

  it('keeps regex identities stable across rescans and changes them with pattern semantics', async () => {
    const ports = createPorts()
    const controller = createKeywordHighlighter(ports)
    const createRule = (source: string, flags: string): KeywordRule => ({
      id: 'structured', label: 'Structured', color: '#facc15',
      patterns: [{ id: 'value', kind: 'regex', source, flags }]
    })
    controller.setRules([createRule('\\d+', 'u')])
    await controller.scan()
    const firstId = controller.getSnapshot().matches[0]?.id
    await controller.scan()
    expect(controller.getSnapshot().matches[0]?.id).toBe(firstId)

    controller.setRules([createRule('\\d{2}', 'u')])
    await controller.scan()
    const changedSourceId = controller.getSnapshot().matches[0]?.id
    expect(changedSourceId).not.toBe(firstId)

    controller.setRules([createRule('\\d{2}', 'iu')])
    await controller.scan()
    expect(controller.getSnapshot().matches[0]?.id).not.toBe(changedSourceId)
    controller.destroy()
  })

  it('rejects regex boundary violations atomically without replacing valid rules', () => {
    const controller = createKeywordHighlighter(createPorts())
    controller.setRules(RULES)
    const valid = controller.getSnapshot()
    const invalidPatterns: readonly KeywordRule[] = [
      { id: 'flags', label: 'Flags', color: '#fff', patterns: [
        { id: 'bad', kind: 'regex', source: '\\d+', flags: 'g' }
      ] },
      { id: 'duplicate-flags', label: 'Duplicate flags', color: '#fff', patterns: [
        { id: 'bad', kind: 'regex', source: '\\d+', flags: 'uu' }
      ] },
      { id: 'blank', label: 'Blank', color: '#fff', patterns: [
        { id: 'bad', kind: 'regex', source: '   ' }
      ] },
      { id: 'limit', label: 'Limit', color: '#fff', patterns: [
        { id: 'bad', kind: 'regex', source: '\\d+', maxResults: 100_001 }
      ] }
    ]

    for (const rule of invalidPatterns) {
      expect(() => controller.setRules([rule])).toThrowError(expect.objectContaining({
        code: 'PDF_FEATURE_FAILED', operation: 'setRules'
      }))
      expect(controller.getSnapshot()).toBe(valid)
    }
    controller.destroy()
  })

  it('isolates listener failures and supports idempotent unsubscription', () => {
    const ports = createPorts()
    const listenerError = vi.fn()
    const controller = createKeywordHighlighter({ ...ports, onListenerError: listenerError })
    const good = vi.fn()
    controller.subscribe(() => { throw new Error('listener') })
    const unsubscribe = controller.subscribe(good)
    controller.setRules(RULES)
    expect(listenerError).toHaveBeenCalledOnce()
    expect(good).toHaveBeenCalledOnce()
    unsubscribe()
    unsubscribe()
    controller.reset()
    expect(good).toHaveBeenCalledOnce()
    controller.destroy()
  })

  it('cancels Controller-owned scanning without entering error state', async () => {
    const ports = createPorts((_queries, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new InkLayerError(
        'PDF_FEATURE_CANCELLED', 'cancelled', { operation: 'searchMany' }
      )), { once: true })
    }))
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    const pending = controller.scan()
    expect(controller.getSnapshot().status).toBe('scanning')
    controller.cancelScan()
    controller.cancelScan()
    await expect(pending).rejects.toMatchObject({ code: 'PDF_FEATURE_CANCELLED' })
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', error: null, progress: null })
    controller.destroy()
  })

  it('reports caller cancellation and arbitrary port failures as error state', async () => {
    const external = new AbortController()
    const ports = createPorts((_queries, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new InkLayerError(
        'PDF_FEATURE_CANCELLED', 'cancelled', { operation: 'searchMany' }
      )), { once: true })
    }))
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    const pending = controller.scan({ signal: external.signal })
    external.abort()
    await expect(pending).rejects.toMatchObject({ code: 'PDF_FEATURE_CANCELLED' })
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error', error: expect.objectContaining({ code: 'PDF_FEATURE_CANCELLED' })
    })
    controller.destroy()

    let attempts = 0
    const failed = createKeywordHighlighter(createPorts(async (queries) => {
      attempts += 1
      if (attempts === 1) throw new Error('port')
      return {
        truncated: false,
        queries: queries.map((query) => ({
          id: query.id,
          query: 'kind' in query ? query.source : query.query,
          truncated: false,
          matches: []
        }))
      }
    }))
    failed.setRules(RULES)
    await expect(failed.scan()).rejects.toMatchObject({
      code: 'PDF_FEATURE_FAILED', operation: 'scan'
    })
    expect(failed.getSnapshot().status).toBe('error')
    await failed.scan()
    expect(failed.getSnapshot()).toMatchObject({ status: 'ready', matches: [], error: null })
    failed.destroy()
  })

  it('validates scan controls even when every rule is disabled', async () => {
    const ports = createPorts()
    const controller = createKeywordHighlighter(ports)
    controller.setRules([{ id: 'off', label: 'Off', terms: ['term'], color: '#fff', enabled: false }])
    await expect(controller.scan({ maxTotalResults: 0 })).rejects.toMatchObject({
      code: 'PDF_FEATURE_FAILED', operation: 'scan'
    })
    expect(ports.searchMany).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('prevents stale document work from publishing into a new Viewer generation', async () => {
    let resolveSearch: ((result: PdfSearchManyResult) => void) | undefined
    const ports = createPorts(() => new Promise((resolve) => { resolveSearch = resolve }))
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    const pending = controller.scan()
    ports.setViewerGeneration(5)
    resolveSearch?.({ queries: [], truncated: false })
    await expect(pending).rejects.toMatchObject({ code: 'PDF_FEATURE_CANCELLED' })
    expect(controller.getSnapshot()).toMatchObject({
      status: 'idle', matches: [], activeMatchId: null, error: null
    })
    controller.destroy()
  })

  it('keeps multiple Controllers independent and destroys only owned state', async () => {
    const ports = createPorts()
    const first = createKeywordHighlighter(ports)
    const second = createKeywordHighlighter(ports)
    first.setRules(RULES)
    second.setRules([{ id: 'other', label: 'Other', terms: ['other'], color: '#000' }])
    await first.scan()
    expect(first.getSnapshot().matches).toHaveLength(2)
    expect(second.getSnapshot()).toMatchObject({ status: 'idle', matches: [] })
    first.destroy()
    expect(first.getSnapshot()).toMatchObject({ status: 'destroyed', rules: [], matches: [] })
    expect(second.getSnapshot().rules[0]?.id).toBe('other')
    expect(ports.viewer.getSnapshot().status).toBe('ready')
    second.destroy()
  })

  it('publishes one final destroyed snapshot and rejects subsequent operations', () => {
    const controller = createKeywordHighlighter(createPorts())
    controller.setRules(RULES)
    const listener = vi.fn()
    controller.subscribe(listener)
    controller.destroy()
    const destroyed = controller.getSnapshot()
    expect(destroyed).toMatchObject({
      status: 'destroyed', rules: [], matches: [], activeMatchId: null, error: null
    })
    expect(listener).toHaveBeenCalledOnce()
    controller.destroy()
    expect(listener).toHaveBeenCalledOnce()
    expect(() => controller.setRules([])).toThrowError(expect.objectContaining({
      code: 'ENGINE_DESTROYED', operation: 'setRules'
    }))
    expect(() => controller.subscribe(vi.fn())).toThrowError(expect.objectContaining({
      code: 'ENGINE_DESTROYED', operation: 'subscribe'
    }))
    expect(controller.getSnapshot()).toBe(destroyed)
  })

  it('rejects workflow operations before a scan is ready', async () => {
    const controller = createKeywordHighlighter(createPorts())
    for (const operation of [
      () => controller.activateMatch('match'),
      () => controller.includeMatch('match'),
      () => controller.excludeMatch('match'),
      () => controller.includeRule('rule'),
      () => controller.excludeRule('rule')
    ]) {
      expect(operation).toThrowError(expect.objectContaining({ code: 'PDF_FEATURE_FAILED' }))
    }
    await expect(controller.applyMatches()).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED' })
    controller.destroy()
  })
})
