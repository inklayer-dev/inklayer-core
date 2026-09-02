/**
 * @file PDF document sub-feature unit tests.
 * @description Verifies outline destination resolution, ordered search,
 * thumbnail caching, surface cleanup, validation, and generation cancellation.
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import { InkLayerError } from '../../../src/domain/errors'
import { PdfDocumentFeatures } from '../../../src/viewer/document-features'
import { createInlineRegexMatcher } from '../../../src/viewer/regex-matcher'
import type { RegexMatcherFactory } from '../../../src/viewer/regex-matcher'
import type { PdfThumbnailSurfaceProvider } from '../../../src/viewer/types'

interface FakePageSpec {
  text: string
  width?: number
  height?: number
  items?: readonly FakeTextItem[]
  viewportTransform?: readonly number[]
  viewportScales?: number[]
}

interface FakeTextItem {
  str: string
  dir?: string
  transform?: readonly number[]
  width?: number
  height?: number
  hasEOL?: boolean
}

/** Creates a minimal document proxy for document-feature tests. */
function createFeatureDocument(pages: readonly FakePageSpec[]): PDFDocumentProxy {
  return {
    numPages: pages.length,
    getOutline: vi.fn(async () => [{
      title: 'Chapter', bold: true, italic: false,
      color: new Uint8ClampedArray([17, 34, 51]),
      dest: 'chapter', url: null,
      items: [{
        title: 'Website', bold: false, italic: true,
        color: new Uint8ClampedArray([0, 0, 0]),
        dest: null, url: 'https://example.com', items: []
      }]
    }]),
    getDestination: vi.fn(async (name: string) => name === 'chapter'
      ? [{ num: 10, gen: 0 }, { name: 'XYZ' }, 12, 34, 1.5]
      : null),
    getPageIndex: vi.fn(async () => 1),
    getPage: vi.fn(async (pageNumber: number) => createFeaturePage(pages[pageNumber - 1]))
  } as unknown as PDFDocumentProxy
}

/** Creates the page operations used by search and thumbnail rendering. */
function createFeaturePage(spec: FakePageSpec | undefined): PDFPageProxy {
  if (spec === undefined) throw new RangeError('Missing fake page.')
  const width = spec.width ?? 400
  const height = spec.height ?? 600
  const items = spec.items ?? [{ str: spec.text }]
  return {
    getTextContent: vi.fn(async () => ({
      items: items.map((item) => ({
        str: item.str,
        dir: item.dir ?? 'ltr',
        transform: item.transform ?? [10, 0, 0, 10, 10, height - 20],
        width: item.width ?? Math.max(10, item.str.length * 10),
        height: item.height ?? 10,
        fontName: 'sans',
        hasEOL: item.hasEOL ?? false
      })),
      styles: {
        sans: { fontFamily: 'Fixture Sans', ascent: 0.8, descent: -0.2, vertical: false }
      },
      lang: null
    })),
    getViewport: vi.fn(({ scale }: { scale: number }) => {
      spec.viewportScales?.push(scale)
      return {
        width: width * scale,
        height: height * scale,
        userUnit: 1,
        transform: (spec.viewportTransform ?? [1, 0, 0, -1, 0, height])
          .map((value) => value * scale)
      }
    }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  } as unknown as PDFPageProxy
}

/** Creates a deterministic in-memory thumbnail surface provider. */
function createSurfaceProvider(release: () => void): PdfThumbnailSurfaceProvider {
  return {
    create: vi.fn((width: number, height: number) => ({
      canvas: { width, height } as HTMLCanvasElement,
      context: {} as CanvasRenderingContext2D,
      encode: vi.fn(async () => new Blob([`${width}x${height}`], { type: 'image/png' })),
      release
    }))
  }
}

describe('PDF document features', () => {
  it('normalizes recursive outlines and resolves named XYZ destinations', async () => {
    const features = new PdfDocumentFeatures(
      createFeatureDocument([{ text: 'one' }, { text: 'two' }]),
      undefined
    )
    await expect(features.getOutline()).resolves.toEqual([{
      title: 'Chapter', bold: true, italic: false, color: '#112233',
      target: { pageIndex: 1, left: 12, top: 34, zoom: 1.5 },
      url: null,
      items: [{
        title: 'Website', bold: false, italic: true, color: '#000000',
        target: null, url: 'https://example.com', items: []
      }]
    }])
    await expect(features.resolveDestination('missing')).resolves.toBeNull()
  })

  it('searches pages in order with case, word, preview, and result limits', async () => {
    const document = createFeatureDocument([
      { text: 'Core core score' },
      { text: 'Another Core result' }
    ])
    const features = new PdfDocumentFeatures(document, undefined)
    await expect(features.search('core', { wholeWord: true })).resolves.toMatchObject({
      query: 'core', truncated: false,
      matches: [
        { pageIndex: 0, matchIndex: 0, start: 0, length: 4 },
        { pageIndex: 0, matchIndex: 1, start: 5, length: 4 },
        { pageIndex: 1, matchIndex: 0, start: 8, length: 4 }
      ]
    })
    await expect(features.search('Core', { matchCase: true, maxResults: 1 })).resolves.toMatchObject({
      truncated: true,
      matches: [{ pageIndex: 0, start: 0 }]
    })
    expect(document.getPage).toHaveBeenCalledTimes(2)
  })

  it('folds Unicode diacritics by default and can require exact marks', async () => {
    const features = new PdfDocumentFeatures(createFeatureDocument([{
      text: 'Résumé resume café cafe'
    }]), undefined)

    await expect(features.search('resume')).resolves.toMatchObject({
      matches: [
        { start: 0, length: 6 },
        { start: 7, length: 6 }
      ]
    })
    await expect(features.search('resume', { matchDiacritics: true })).resolves.toMatchObject({
      matches: [{ start: 7, length: 6 }]
    })
    await expect(features.search('café', {
      matchCase: true,
      matchDiacritics: true
    })).resolves.toMatchObject({
      matches: [{ start: 14, length: 4 }]
    })

    const decomposed = new PdfDocumentFeatures(createFeatureDocument([{
      text: 'Cafe\u0301 noir resume'
    }]), undefined)
    await expect(decomposed.search('cafe')).resolves.toMatchObject({
      matches: [{ start: 0, length: 5 }]
    })
    await expect(decomposed.search('resume')).resolves.toMatchObject({
      matches: [{ start: 11, length: 6 }]
    })
  })

  it('searches ordered queries with one page extraction pass and monotonic progress', async () => {
    const document = createFeatureDocument([
      { text: 'Core core score' },
      { text: 'Another Core result' }
    ])
    const features = new PdfDocumentFeatures(document, undefined)
    const progress: Array<{ completedPages: number; percentage: number }> = []

    const result = await features.searchMany([
      { id: 'result', query: 'result' },
      { id: 'core', query: 'core', options: { wholeWord: true } },
      { id: 'empty', query: '   ' }
    ], {
      onProgress: (value) => progress.push({
        completedPages: value.completedPages,
        percentage: value.percentage
      })
    })

    expect(result).toEqual({
      queries: [
        {
          id: 'result', query: 'result', truncated: false,
          matches: [expect.objectContaining({ pageIndex: 1, matchIndex: 0, start: 13 })]
        },
        {
          id: 'core', query: 'core', truncated: false,
          matches: [
            expect.objectContaining({ pageIndex: 0, matchIndex: 0, start: 0 }),
            expect.objectContaining({ pageIndex: 0, matchIndex: 1, start: 5 }),
            expect.objectContaining({ pageIndex: 1, matchIndex: 0, start: 8 })
          ]
        },
        { id: 'empty', query: '', truncated: false, matches: [] }
      ],
      truncated: false
    })
    expect(progress).toEqual([
      { completedPages: 0, percentage: 0 },
      { completedPages: 1, percentage: 50 },
      { completedPages: 2, percentage: 100 }
    ])
    expect(document.getPage).toHaveBeenCalledTimes(2)
  })

  it('mixes literal and regex queries in one extraction pass', async () => {
    const document = createFeatureDocument([
      { text: 'Fee ¥1,200 is due on 2026-08-31.' },
      { text: 'Another fee is RMB 75.50.' }
    ])
    const features = new PdfDocumentFeatures(document, undefined, createInlineRegexMatcher)

    await expect(features.searchMany([
      { id: 'fee', query: 'fee' },
      {
        id: 'amount', kind: 'regex',
        source: '(?:¥|RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
        options: { flags: 'iu' }
      },
      {
        id: 'date', kind: 'regex', source: '\\d{4}-\\d{2}-\\d{2}',
        options: { flags: 'u' }
      }
    ])).resolves.toMatchObject({
      queries: [
        { id: 'fee', query: 'fee', matches: [{ pageIndex: 0 }, { pageIndex: 1 }] },
        {
          id: 'amount',
          query: '(?:¥|RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
          matches: [
            { pageIndex: 0, start: 4, length: 6 },
            { pageIndex: 1, start: 15, length: 9 }
          ]
        },
        {
          id: 'date', query: '\\d{4}-\\d{2}-\\d{2}',
          matches: [{ pageIndex: 0, start: 21, length: 10 }]
        }
      ],
      truncated: false
    })
    expect(document.getPage).toHaveBeenCalledTimes(2)
  })

  it('keeps regex matching page-scoped and returns exact matched source text', async () => {
    const features = new PdfDocumentFeatures(createFeatureDocument([
      { text: 'Split date 2026-' },
      { text: '08-31; valid 2026-09-01' }
    ]), undefined, createInlineRegexMatcher)

    await expect(features.searchMany([{
      id: 'date', kind: 'regex', source: '\\d{4}-\\d{2}-\\d{2}',
      options: { flags: 'u' }
    }])).resolves.toEqual({
      queries: [{
        id: 'date', query: '\\d{4}-\\d{2}-\\d{2}', truncated: false,
        matches: [{
          pageIndex: 1, matchIndex: 0, start: 13, length: 10,
          text: '2026-09-01', preview: '08-31; valid 2026-09-01'
        }]
      }],
      truncated: false
    })
  })

  it('applies regex per-query and batch truncation across pages', async () => {
    const document = createFeatureDocument([
      { text: '10 20 30' },
      { text: '40 50' }
    ])
    const features = new PdfDocumentFeatures(document, undefined, createInlineRegexMatcher)

    await expect(features.searchMany([
      { id: 'numbers', kind: 'regex', source: '\\d+', options: { flags: 'u', maxResults: 2 } },
      { id: 'tens', kind: 'regex', source: '[45]0', options: { flags: 'u' } }
    ], { maxTotalResults: 3 })).resolves.toMatchObject({
      queries: [
        {
          id: 'numbers', truncated: true,
          matches: [{ pageIndex: 0, text: '10' }, { pageIndex: 0, text: '20' }]
        },
        {
          id: 'tens', truncated: false,
          matches: [{ pageIndex: 1, text: '40' }]
        }
      ],
      truncated: true
    })
    expect(document.getPage).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid regex configuration before extracting pages', async () => {
    const document = createFeatureDocument([{ text: '2026-08-31' }])
    const features = new PdfDocumentFeatures(document, undefined, createInlineRegexMatcher)

    await expect(features.searchMany([
      { id: 'bad-flags', kind: 'regex', source: '\\d+', options: { flags: 'gg' } }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'searchMany' })
    await expect(features.searchMany([
      { id: 'bad-source', kind: 'regex', source: '(' }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'searchMany' })
    await expect(features.searchMany([
      { id: 'duplicate-flags', kind: 'regex', source: '\\d+', options: { flags: 'uu' } }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'searchMany' })
    await expect(features.searchMany([
      { id: 'blank-source', kind: 'regex', source: '   ' }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'searchMany' })
    expect(document.getPage).not.toHaveBeenCalled()
  })

  it('fails explicitly when a regex produces a zero-length occurrence', async () => {
    const features = new PdfDocumentFeatures(
      createFeatureDocument([{ text: 'alpha' }]),
      undefined,
      createInlineRegexMatcher
    )

    await expect(features.searchMany([
      { id: 'empty', kind: 'regex', source: '(?=alpha)', options: { flags: 'u' } }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'searchMany' })
  })

  it('forwards batch cancellation to active isolated regex work', async () => {
    let notifyStarted = (): void => undefined
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve
    })
    const destroy = vi.fn()
    const matcherFactory: RegexMatcherFactory = () => ({
      matchPage: async (_text, _queries, signal) => await new Promise((_, reject) => {
        notifyStarted()
        signal.addEventListener('abort', () => {
          reject(new InkLayerError('PDF_FEATURE_CANCELLED', 'Cancelled.', {
            operation: 'searchMany'
          }))
        }, { once: true })
      }),
      destroy
    })
    const features = new PdfDocumentFeatures(
      createFeatureDocument([{ text: 'alpha' }]),
      undefined,
      matcherFactory
    )
    const controller = new AbortController()
    const searching = features.searchMany([
      { id: 'letters', kind: 'regex', source: '[a-z]+', options: { flags: 'u' } }
    ], { signal: controller.signal })

    await started
    controller.abort()

    await expect(searching).rejects.toMatchObject({
      code: 'PDF_FEATURE_CANCELLED', operation: 'searchMany'
    })
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('applies per-query and batch result limits independently', async () => {
    const features = new PdfDocumentFeatures(createFeatureDocument([{
      text: 'alpha alpha beta beta gamma'
    }]), undefined)

    await expect(features.searchMany([
      { id: 'alpha', query: 'alpha', options: { maxResults: 1 } },
      { id: 'beta', query: 'beta' },
      { id: 'gamma', query: 'gamma' }
    ], { maxTotalResults: 2 })).resolves.toMatchObject({
      queries: [
        { id: 'alpha', truncated: true, matches: [{ start: 0 }] },
        { id: 'beta', truncated: false, matches: [{ start: 12 }] },
        { id: 'gamma', truncated: false, matches: [] }
      ],
      truncated: true
    })
  })

  it('stops extracting pages after every query reaches its own limit', async () => {
    const document = createFeatureDocument([
      { text: 'alpha' },
      { text: 'alpha' },
      { text: 'alpha' }
    ])
    const features = new PdfDocumentFeatures(document, undefined)
    const completedPages: number[] = []

    await expect(features.searchMany([
      { id: 'alpha', query: 'alpha', options: { maxResults: 1 } }
    ], {
      onProgress: (progress) => completedPages.push(progress.completedPages)
    })).resolves.toMatchObject({
      queries: [{ truncated: true, matches: [{ pageIndex: 0 }] }],
      truncated: false
    })
    expect(document.getPage).toHaveBeenCalledOnce()
    expect(completedPages).toEqual([0, 1])
  })

  it('validates query identities and batch-wide limits before extraction', async () => {
    const document = createFeatureDocument([{ text: 'one' }])
    const features = new PdfDocumentFeatures(document, undefined)

    await expect(features.searchMany([
      { id: 'same', query: 'one' },
      { id: 'same', query: 'two' }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'searchMany' })
    await expect(features.searchMany([
      { id: 'one', query: 'one' }
    ], { maxTotalResults: 0 })).rejects.toMatchObject({
      code: 'PDF_FEATURE_FAILED', operation: 'searchMany'
    })
    expect(document.getPage).not.toHaveBeenCalled()
  })

  it('cancels a pending batch search without waiting for page extraction', async () => {
    let resolveText: (value: { items: unknown[]; styles: object; lang: null }) => void = () => undefined
    const text = new Promise<{ items: unknown[]; styles: object; lang: null }>((resolve) => {
      resolveText = resolve
    })
    const document = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => await text)
      }))
    } as unknown as PDFDocumentProxy
    const features = new PdfDocumentFeatures(document, undefined)
    const controller = new AbortController()
    const searching = features.searchMany([
      { id: 'pending', query: 'pending' }
    ], { signal: controller.signal })
    await vi.waitFor(() => expect(document.getPage).toHaveBeenCalledOnce())
    controller.abort()
    await expect(searching).rejects.toMatchObject({
      code: 'PDF_FEATURE_CANCELLED', operation: 'searchMany'
    })
    resolveText({ items: [{ str: 'pending', hasEOL: false }], styles: {}, lang: null })
  })

  it('rejects an already-aborted batch without extracting text', async () => {
    const document = createFeatureDocument([{ text: 'pending' }])
    const features = new PdfDocumentFeatures(document, undefined)
    const controller = new AbortController()
    controller.abort()

    await expect(features.searchMany([
      { id: 'pending', query: 'pending' }
    ], { signal: controller.signal })).rejects.toMatchObject({
      code: 'PDF_FEATURE_CANCELLED', operation: 'searchMany'
    })
    expect(document.getPage).not.toHaveBeenCalled()
  })

  it('cancels pending batch search when its document generation is destroyed', async () => {
    let resolveText: (value: { items: unknown[]; styles: object; lang: null }) => void = () => undefined
    const text = new Promise<{ items: unknown[]; styles: object; lang: null }>((resolve) => {
      resolveText = resolve
    })
    const document = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => await text)
      }))
    } as unknown as PDFDocumentProxy
    const features = new PdfDocumentFeatures(document, undefined)
    const searching = features.searchMany([{ id: 'pending', query: 'pending' }])
    await vi.waitFor(() => expect(document.getPage).toHaveBeenCalledOnce())
    features.destroy()
    await expect(searching).rejects.toMatchObject({ code: 'PDF_FEATURE_CANCELLED' })
    resolveText({ items: [{ str: 'pending', hasEOL: false }], styles: {}, lang: null })
  })

  it('resolves one range across text items and an EOL in source order', async () => {
    const viewportScales: number[] = []
    const document = createFeatureDocument([{
      text: 'Alpha Beta\nGamma',
      viewportScales,
      items: [
        { str: 'Alpha ', transform: [10, 0, 0, 10, 10, 580], width: 60 },
        { str: 'Beta', transform: [10, 0, 0, 10, 70, 580], width: 40, hasEOL: true },
        { str: 'Gamma', transform: [10, 0, 0, 10, 10, 550], width: 50 }
      ]
    }])
    const features = new PdfDocumentFeatures(document, undefined)

    await expect(features.resolveTextRanges([
      { pageIndex: 0, start: 3, length: 9 }
    ])).resolves.toEqual([{
      pageIndex: 0,
      start: 3,
      length: 9,
      text: 'ha Beta\nG',
      rects: [
        { x: 40, y: 10, width: 30, height: 10 },
        { x: 70, y: 10, width: 40, height: 10 },
        { x: 10, y: 40, width: 10, height: 10 }
      ]
    }])
    expect(document.getPage).toHaveBeenCalledOnce()
    expect(viewportScales).toEqual([1])
  })

  it('preserves caller order across pages and projects rotation and RTL flow', async () => {
    const document = createFeatureDocument([
      {
        text: 'ABCD',
        items: [{ str: 'ABCD', dir: 'rtl', transform: [10, 0, 0, 10, 10, 580], width: 40 }]
      },
      {
        text: 'Turn', width: 400, height: 600,
        viewportTransform: [0, 1, 1, 0, 0, 0],
        items: [{ str: 'Turn', transform: [10, 0, 0, 10, 20, 30], width: 40 }]
      }
    ])
    const features = new PdfDocumentFeatures(document, undefined)

    await expect(features.resolveTextRanges([
      { pageIndex: 1, start: 0, length: 4 },
      { pageIndex: 0, start: 0, length: 1 }
    ])).resolves.toEqual([
      {
        pageIndex: 1, start: 0, length: 4, text: 'Turn',
        rects: [{ x: 30, y: 20, width: 10, height: 40 }]
      },
      {
        pageIndex: 0, start: 0, length: 1, text: 'A',
        rects: [{ x: 40, y: 10, width: 10, height: 10 }]
      }
    ])
  })

  it('shares cached extraction between search and text-range geometry', async () => {
    const document = createFeatureDocument([{ text: 'Shared geometry' }])
    const features = new PdfDocumentFeatures(document, undefined)

    const search = await features.search('geometry')
    await expect(features.resolveTextRanges(search.matches)).resolves.toMatchObject([{
      pageIndex: 0,
      text: 'geometry',
      rects: [{ width: 80, height: 10 }]
    }])
    expect(document.getPage).toHaveBeenCalledOnce()
  })

  it('uses proportional browser font advances for partial text-item geometry', async () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          font: '',
          measureText: (value: string) => ({
            width: [...value].reduce((width, character) => width + (character === 'W' ? 4 : 1), 0)
          })
        })
      })
    })
    try {
      const features = new PdfDocumentFeatures(createFeatureDocument([{
        text: 'iiiW',
        items: [{ str: 'iiiW', transform: [10, 0, 0, 10, 10, 580], width: 70 }]
      }]), undefined)

      await expect(features.resolveTextRanges([
        { pageIndex: 0, start: 3, length: 1 }
      ])).resolves.toMatchObject([{
        text: 'W',
        rects: [{ x: 40, width: 40 }]
      }])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects ranges that cannot map exactly to source text geometry', async () => {
    const features = new PdfDocumentFeatures(createFeatureDocument([{
      text: 'A\n😀',
      items: [
        { str: 'A', hasEOL: true },
        { str: '😀', transform: [], width: 20 }
      ]
    }]), undefined)

    await expect(features.resolveTextRanges([
      { pageIndex: 0, start: 1, length: 1 }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'resolveTextRanges' })
    await expect(features.resolveTextRanges([
      { pageIndex: 0, start: 3, length: 1 }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'resolveTextRanges' })
    await expect(features.resolveTextRanges([
      { pageIndex: 0, start: 2, length: 2 }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'resolveTextRanges' })
    await expect(features.resolveTextRanges([
      { pageIndex: 0, start: 10, length: 1 }
    ])).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED', operation: 'resolveTextRanges' })
  })

  it('cancels pending range resolution without waiting for text extraction', async () => {
    let resolveText: (value: { items: unknown[]; styles: object; lang: null }) => void = () => undefined
    const text = new Promise<{ items: unknown[]; styles: object; lang: null }>((resolve) => {
      resolveText = resolve
    })
    const document = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => await text),
        getViewport: vi.fn()
      }))
    } as unknown as PDFDocumentProxy
    const features = new PdfDocumentFeatures(document, undefined)
    const controller = new AbortController()
    const resolving = features.resolveTextRanges([
      { pageIndex: 0, start: 0, length: 1 }
    ], { signal: controller.signal })
    await vi.waitFor(() => expect(document.getPage).toHaveBeenCalledOnce())
    controller.abort()
    await expect(resolving).rejects.toMatchObject({
      code: 'PDF_FEATURE_CANCELLED', operation: 'resolveTextRanges'
    })
    resolveText({ items: [], styles: {}, lang: null })
  })

  it('renders and caches encoded thumbnails while always releasing surfaces', async () => {
    const release = vi.fn()
    const provider = createSurfaceProvider(release)
    const features = new PdfDocumentFeatures(
      createFeatureDocument([{ text: 'thumbnail', width: 400, height: 600 }]),
      provider
    )
    const first = await features.renderThumbnail({ pageIndex: 0, maxWidth: 100, pixelRatio: 2 })
    const second = await features.renderThumbnail({ pageIndex: 0, maxWidth: 100, pixelRatio: 2 })
    expect(first).toMatchObject({ pageIndex: 0, width: 100, height: 150 })
    expect(first.blob.type).toBe('image/png')
    expect(second.blob).toBe(first.blob)
    expect(provider.create).toHaveBeenCalledWith(200, 300)
    expect(provider.create).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects invalid pages and cancels all operations after destroy', async () => {
    const features = new PdfDocumentFeatures(createFeatureDocument([{ text: 'one' }]), undefined)
    await expect(features.renderThumbnail({ pageIndex: 1 })).rejects.toMatchObject({
      code: 'PDF_FEATURE_FAILED'
    })
    features.destroy()
    features.destroy()
    await expect(features.search('one')).rejects.toMatchObject({ code: 'PDF_FEATURE_FAILED' })
  })

  it('churns long-document text and thumbnail caches while releasing every surface', async () => {
    const pageCount = 96
    const release = vi.fn()
    const provider = createSurfaceProvider(release)
    const document = createFeatureDocument(Array.from({ length: pageCount }, (_, pageIndex) => ({
      text: `Lifecycle stress search token page ${pageIndex + 1}`,
      width: 420,
      height: 560
    })))
    const features = new PdfDocumentFeatures(document, provider)

    await expect(features.search('lifecycle stress search token', {
      maxResults: pageCount + 1
    })).resolves.toMatchObject({
      truncated: false,
      matches: Array.from({ length: pageCount }, (_, pageIndex) => ({ pageIndex }))
    })
    for (const maxWidth of [64, 96]) {
      await Promise.all(Array.from({ length: pageCount }, (_, pageIndex) =>
        features.renderThumbnail({ pageIndex, maxWidth, pixelRatio: 1 })))
    }
    await Promise.all(Array.from({ length: pageCount }, (_, pageIndex) =>
      features.renderThumbnail({ pageIndex, maxWidth: 64, pixelRatio: 1 })))

    expect(provider.create).toHaveBeenCalledTimes(pageCount * 2)
    expect(release).toHaveBeenCalledTimes(pageCount * 2)
    features.destroy()
    await expect(features.renderThumbnail({ pageIndex: 0 })).rejects.toMatchObject({
      code: 'PDF_FEATURE_FAILED'
    })
  })
})
