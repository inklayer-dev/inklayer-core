/**
 * @file Highlighter headless workflow integration tests.
 * @description Exercises scan, preview, navigation, review, apply, deduplication,
 * cancellation, partial failure, and multiple Controller ownership through ports.
 */

import { describe, expect, it, vi } from 'vitest'
import type { Annotation } from '../../../src/domain/annotation'
import { InkLayerError } from '../../../src/domain/errors'
import { createKeywordHighlighter } from '../../../src/highlighter'
import type {
  CreateTextMarkupRangeInput,
  CreateTextMarkupsFromRangesOptions,
  KeywordHighlighterAnnotationPort,
  KeywordHighlighterViewerPort,
  KeywordRule
} from '../../../src/highlighter'
import type {
  PdfResolvedTextRange,
  PdfSearchManyInputQuery,
  PdfSearchManyOptions,
  PdfSearchManyResult,
  PdfTextHighlightLayer,
  PdfTextRange,
  PdfViewerListener,
  PdfViewerSnapshot
} from '../../../src/viewer'

interface WorkflowPorts {
  readonly viewer: KeywordHighlighterViewerPort
  readonly annotations: KeywordHighlighterAnnotationPort
  readonly layers: () => readonly PdfTextHighlightLayer[]
  readonly annotationsList: () => readonly Annotation[]
  readonly setGeneration: (generation: number) => void
  readonly searchMany: ReturnType<typeof vi.fn>
  readonly resolveTextRanges: ReturnType<typeof vi.fn>
  readonly createTextMarkupsFromRanges: ReturnType<typeof vi.fn>
  readonly goToPage: ReturnType<typeof vi.fn>
}

const RULES: readonly KeywordRule[] = [
  { id: 'risk', label: 'Risk', terms: ['risk'], color: '#ef4444' },
  { id: 'date', label: 'Date', terms: ['date'], color: '#f59e0b' }
]

/** Creates stateful structural ports that mimic Viewer and Annotation ownership semantics. */
function createWorkflowPorts(options: {
  readonly create?: (
    type: 'highlight' | 'strikeout' | 'underline',
    inputs: readonly CreateTextMarkupRangeInput[],
    options?: CreateTextMarkupsFromRangesOptions,
    context?: { annotations: Annotation[] }
  ) => readonly Annotation[]
  readonly resolve?: (
    ranges: readonly PdfTextRange[],
    signal: AbortSignal | undefined
  ) => Promise<readonly PdfResolvedTextRange[]>
} = {}): WorkflowPorts {
  let generation = 7
  let currentLayers: readonly PdfTextHighlightLayer[] = []
  const storedAnnotations: Annotation[] = []
  const listeners = new Set<PdfViewerListener>()
  const snapshot = (): PdfViewerSnapshot => ({
    status: 'ready', generation,
    document: {
      document: {} as NonNullable<PdfViewerSnapshot['document']>['document'],
      numPages: 3,
      fingerprints: ['workflow-document'],
      permissions: {
        print: 'high-resolution', copy: true, copyForAccessibility: true,
        modify: true, annotate: true, fillForms: true, assemble: true
      },
      passwordProtected: false
    },
    error: null,
    progress: null
  })
  const searchMany = vi.fn(async (
    queries: readonly PdfSearchManyInputQuery[],
    searchOptions?: PdfSearchManyOptions
  ): Promise<PdfSearchManyResult> => {
    searchOptions?.onProgress?.({ completedPages: 0, totalPages: 3, percentage: 0 })
    searchOptions?.onProgress?.({ completedPages: 3, totalPages: 3, percentage: 100 })
    return {
      truncated: false,
      queries: queries.map((query) => {
        const source = 'kind' in query ? query.source : query.query
        const matchedText = source === 'date' ? 'date' : '¥1,200'
        return {
          id: query.id,
          query: source,
          truncated: false,
          matches: source === 'risk'
            ? [
                {
                  pageIndex: 0, matchIndex: 0, start: 2, length: 4,
                  text: 'risk', preview: 'risk one'
                },
                {
                  pageIndex: 2, matchIndex: 0, start: 8, length: 4,
                  text: 'risk', preview: 'risk two'
                }
              ]
            : [{
                pageIndex: 1, matchIndex: 0, start: 5, length: matchedText.length,
                text: matchedText, preview: `${matchedText} one`
              }]
        }
      })
    }
  })
  const resolveTextRanges = vi.fn(async (
    ranges: readonly PdfTextRange[],
    resolveOptions?: { signal?: AbortSignal }
  ): Promise<readonly PdfResolvedTextRange[]> => options.resolve?.(
    ranges, resolveOptions?.signal
  ) ?? ranges.map((range) => ({
    ...range,
    text: 'x'.repeat(range.length),
    rects: [{ x: range.start, y: 10 + range.pageIndex * 20, width: range.length * 5, height: 8 }]
  })))
  const createTextMarkupsFromRanges = vi.fn((
    type: 'highlight' | 'strikeout' | 'underline',
    inputs: readonly CreateTextMarkupRangeInput[],
    createOptions?: CreateTextMarkupsFromRangesOptions
  ): readonly Annotation[] => {
    if (options.create !== undefined) {
      return options.create(type, inputs, createOptions, { annotations: storedAnnotations })
    }
    const existing = new Set(storedAnnotations.map((annotation) => annotation.id))
    const created = inputs.flatMap((input) => existing.has(input.id)
      ? []
      : [{ id: input.id } as Annotation])
    storedAnnotations.push(...created)
    return created
  })
  const goToPage = vi.fn()
  return {
    viewer: {
      getSnapshot: snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      searchMany,
      resolveTextRanges,
      setTextHighlightLayers: (layers) => { currentLayers = structuredClone(layers) },
      clearTextHighlightLayers: (ids) => {
        currentLayers = ids === undefined
          ? []
          : currentLayers.filter((layer) => !new Set(ids).has(layer.id))
      },
      goToPage
    },
    annotations: {
      getAnnotations: () => structuredClone(storedAnnotations),
      createTextMarkupsFromRanges
    },
    layers: () => structuredClone(currentLayers),
    annotationsList: () => structuredClone(storedAnnotations),
    setGeneration: (next) => {
      generation = next
      for (const listener of listeners) listener({ type: 'stateChanged', snapshot: snapshot() })
    },
    searchMany,
    resolveTextRanges,
    createTextMarkupsFromRanges,
    goToPage
  }
}

describe('Highlighter workflow', () => {
  it('composes scan, colored preview, activation, and review state', async () => {
    const ports = createWorkflowPorts()
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    await controller.scan()

    expect(ports.layers()).toEqual([
      expect.objectContaining({
        ranges: [
          { pageIndex: 0, start: 2, length: 4 },
          { pageIndex: 2, start: 8, length: 4 }
        ],
        style: { color: '#ef4444' }, activeRangeIndex: null
      }),
      expect.objectContaining({
        ranges: [{ pageIndex: 1, start: 5, length: 4 }],
        style: { color: '#f59e0b' }, activeRangeIndex: null
      })
    ])
    const date = controller.getSnapshot().matches.find((match) => match.ruleId === 'date')
    if (date === undefined) throw new Error('Expected the date match.')
    controller.activateMatch(date.id)
    expect(controller.getSnapshot().activeMatchId).toBe(date.id)
    expect(ports.layers()[1]?.activeRangeIndex).toBe(0)
    expect(ports.goToPage).toHaveBeenLastCalledWith(1)

    controller.excludeMatch(date.id)
    expect(controller.getSnapshot()).toMatchObject({ includedCount: 2, excludedCount: 1 })
    expect(ports.layers()).toHaveLength(1)
    controller.includeRule('date')
    expect(controller.getSnapshot()).toMatchObject({ includedCount: 3, excludedCount: 0 })
    expect(ports.layers()).toHaveLength(2)
    controller.excludeRule('risk')
    expect(controller.getSnapshot()).toMatchObject({ includedCount: 1, excludedCount: 2 })

    controller.clearPreview()
    expect(ports.layers()).toEqual([])
    controller.includeRule('risk')
    expect(ports.layers()).toEqual([])
    expect(() => controller.excludeMatch('missing')).toThrowError(expect.objectContaining({
      code: 'PDF_FEATURE_FAILED', operation: 'excludeMatch'
    }))
    controller.destroy()
  })

  it('resolves only included matches, creates rule-colored annotations, and deduplicates reapply', async () => {
    const ports = createWorkflowPorts()
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    await controller.scan()
    const date = controller.getSnapshot().matches.find((match) => match.ruleId === 'date')
    if (date === undefined) throw new Error('Expected the date match.')
    controller.excludeMatch(date.id)

    const first = await controller.applyMatches({
      extensions: { workflow: { batchId: 'batch-1' }, highlighter: { unsafe: true } }
    })
    expect(first.createdAnnotationIds).toHaveLength(2)
    expect(first.skippedMatchIds).toEqual([])
    expect(ports.resolveTextRanges).toHaveBeenCalledWith([
      { pageIndex: 0, start: 2, length: 4 },
      { pageIndex: 2, start: 8, length: 4 }
    ], expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(ports.createTextMarkupsFromRanges).toHaveBeenCalledOnce()
    expect(ports.createTextMarkupsFromRanges).toHaveBeenCalledWith(
      'highlight',
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^highlighter-annotation-[0-9a-f]{16}$/),
          extensions: expect.objectContaining({
            workflow: { batchId: 'batch-1' },
            highlighter: expect.objectContaining({
              source: 'keyword-highlighter', ruleId: 'risk',
              matchId: expect.stringMatching(/^highlighter-match-/)
            })
          })
        })
      ]),
      { appearance: { fill: { color: '#ef4444' } } }
    )
    expect(controller.getSnapshot().matches.filter((match) => match.ruleId === 'risk'))
      .toEqual(expect.arrayContaining([expect.objectContaining({
        annotationId: expect.stringMatching(/^highlighter-annotation-/)
      })]))
    expect(controller.getSnapshot().matches.find((match) => match.id === date.id)?.annotationId)
      .toBeUndefined()

    ports.resolveTextRanges.mockClear()
    ports.createTextMarkupsFromRanges.mockClear()
    const second = await controller.applyMatches()
    expect(second.createdAnnotationIds).toEqual([])
    expect(second.skippedMatchIds).toHaveLength(2)
    expect(ports.resolveTextRanges).not.toHaveBeenCalled()
    expect(ports.createTextMarkupsFromRanges).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('carries regex identity and matched text through preview and permanent provenance', async () => {
    const ports = createWorkflowPorts()
    const controller = createKeywordHighlighter(ports)
    controller.setRules([{
      id: 'amounts',
      label: 'Amounts',
      color: '#facc15',
      patterns: [{
        id: 'currency', kind: 'regex', source: '(?:¥|RMB\\s*)\\d[\\d,]*', flags: 'ui'
      }]
    }])

    await controller.scan()

    expect(ports.searchMany).toHaveBeenCalledWith([{
      id: 'rule-0-pattern-0',
      kind: 'regex',
      source: '(?:¥|RMB\\s*)\\d[\\d,]*',
      options: { flags: 'iu' }
    }], expect.objectContaining({ signal: expect.any(AbortSignal) }))
    const match = controller.getSnapshot().matches[0]
    expect(match).toMatchObject({
      matchedText: '¥1,200',
      pattern: {
        id: 'currency', kind: 'regex', source: '(?:¥|RMB\\s*)\\d[\\d,]*', flags: 'iu'
      }
    })
    expect(ports.layers()).toEqual([expect.objectContaining({
      style: { color: '#facc15' },
      ranges: [match?.range]
    })])

    await controller.applyMatches()

    expect(ports.createTextMarkupsFromRanges).toHaveBeenCalledWith(
      'highlight',
      [expect.objectContaining({
        extensions: expect.objectContaining({
          highlighter: expect.objectContaining({
            matchedText: '¥1,200',
            pattern: {
              id: 'currency', kind: 'regex', source: '(?:¥|RMB\\s*)\\d[\\d,]*', flags: 'iu'
            }
          })
        })
      })],
      { appearance: { fill: { color: '#facc15' } } }
    )
    expect(controller.getSnapshot().matches[0]?.annotationId)
      .toMatch(/^highlighter-annotation-/)
    controller.destroy()
  })

  it('preserves partial permanent changes and completes them on a later retry', async () => {
    let createCall = 0
    const ports = createWorkflowPorts({
      create: (_type, inputs, _options, context) => {
        createCall += 1
        if (context === undefined) throw new Error('Missing annotation context.')
        if (createCall === 2) throw new InkLayerError('ANNOTATION_INVALID', 'denied')
        const created = inputs.map((input) => ({ id: input.id }) as Annotation)
        context.annotations.push(...created)
        return created
      }
    })
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    await controller.scan()
    await expect(controller.applyMatches()).rejects.toMatchObject({ code: 'ANNOTATION_INVALID' })
    expect(controller.getSnapshot().status).toBe('error')
    expect(ports.annotationsList()).toHaveLength(2)
    expect(controller.getSnapshot().matches.filter((match) => match.annotationId !== undefined))
      .toHaveLength(2)

    await controller.scan()
    const retry = await controller.applyMatches()
    expect(retry.createdAnnotationIds).toHaveLength(1)
    expect(retry.skippedMatchIds).toHaveLength(2)
    expect(ports.annotationsList()).toHaveLength(3)
    expect(controller.getSnapshot().matches.every((match) => match.annotationId !== undefined)).toBe(true)
    controller.destroy()
  })

  it('stops before the next rule when cancellation follows a partial commit', async () => {
    const external = new AbortController()
    const ports = createWorkflowPorts({
      create: (_type, inputs, _options, context) => {
        if (context === undefined) throw new Error('Missing annotation context.')
        const created = inputs.map((input) => ({ id: input.id }) as Annotation)
        context.annotations.push(...created)
        external.abort()
        return created
      }
    })
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    await controller.scan()

    await expect(controller.applyMatches({ signal: external.signal })).rejects.toMatchObject({
      code: 'PDF_FEATURE_CANCELLED', operation: 'applyMatches'
    })
    expect(ports.createTextMarkupsFromRanges).toHaveBeenCalledOnce()
    expect(ports.annotationsList()).toHaveLength(2)
    expect(controller.getSnapshot()).toMatchObject({ status: 'error' })
    expect(controller.getSnapshot().matches.filter((match) => match.annotationId !== undefined))
      .toHaveLength(2)
    controller.destroy()
  })

  it('cancels geometry before repository mutation and ignores stale document output', async () => {
    const ports = createWorkflowPorts({
      resolve: (_ranges, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new InkLayerError(
          'PDF_FEATURE_CANCELLED', 'cancelled', { operation: 'resolveTextRanges' }
        )), { once: true })
      })
    })
    const controller = createKeywordHighlighter(ports)
    controller.setRules(RULES)
    await controller.scan()
    const external = new AbortController()
    const cancelled = controller.applyMatches({ signal: external.signal })
    external.abort()
    await expect(cancelled).rejects.toMatchObject({ code: 'PDF_FEATURE_CANCELLED' })
    expect(controller.getSnapshot().status).toBe('error')
    expect(ports.createTextMarkupsFromRanges).not.toHaveBeenCalled()

    await controller.scan()
    const stale = controller.applyMatches()
    ports.setGeneration(8)
    await expect(stale).rejects.toMatchObject({ code: 'PDF_FEATURE_CANCELLED' })
    expect(controller.getSnapshot()).toMatchObject({ status: 'idle', matches: [] })
    expect(ports.layers()).toEqual([])
    expect(ports.createTextMarkupsFromRanges).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('aggregates previews for multiple Controllers and clears only the owner', async () => {
    const ports = createWorkflowPorts()
    const first = createKeywordHighlighter(ports)
    const second = createKeywordHighlighter(ports)
    first.setRules([RULES[0] as KeywordRule])
    second.setRules([RULES[1] as KeywordRule])
    await first.scan()
    expect(ports.layers()).toHaveLength(1)
    await second.scan()
    expect(ports.layers()).toHaveLength(2)
    first.clearPreview()
    expect(ports.layers()).toEqual([
      expect.objectContaining({ style: { color: '#f59e0b' } })
    ])
    first.destroy()
    expect(ports.layers()).toHaveLength(1)
    second.destroy()
    expect(ports.layers()).toEqual([])
  })
})
