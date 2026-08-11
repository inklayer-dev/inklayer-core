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
})
