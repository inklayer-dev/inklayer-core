/**
 * @file PDF document sub-feature unit tests.
 * @description Verifies outline destination resolution, ordered search,
 * thumbnail caching, surface cleanup, validation, and generation cancellation.
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import { PdfDocumentFeatures } from '../../../src/viewer/document-features'
import type { PdfThumbnailSurfaceProvider } from '../../../src/viewer/types'

interface FakePageSpec {
  text: string
  width?: number
  height?: number
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
  return {
    getTextContent: vi.fn(async () => ({
      items: [{ str: spec.text, hasEOL: false }],
      styles: {}, lang: null
    })),
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: width * scale,
      height: height * scale
    })),
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
