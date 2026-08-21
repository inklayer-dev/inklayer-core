/**
 * @file Real local HTTP Range integration coverage.
 * @description Verifies protocol bytes, progress, overlap accounting, abort,
 * fallback, headers, credentials, and failures through loopback Fetch requests.
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InkLayerError } from '../../../src/domain/errors'
import { createPdfViewerEngine } from '../../../src/viewer/pdf-viewer-engine'
import {
  createPdfRangeTransport,
  probePdfRangeSupport
} from '../../../src/viewer/range-transport'
import {
  startHttpRangeTestServer,
  type HttpRangeTestServer
} from '../../helpers/http-range-server'

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }))

/** Creates the PDF.js surface dynamically consumed by the Viewer. */
function createPdfJsMock(): object {
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    PasswordResponses: { NEED_PASSWORD: 1, INCORRECT_PASSWORD: 2 },
    PermissionFlag: {
      PRINT: 4,
      MODIFY_CONTENTS: 8,
      COPY: 16,
      MODIFY_ANNOTATIONS: 32,
      FILL_INTERACTIVE_FORMS: 256,
      COPY_FOR_ACCESSIBILITY: 512,
      ASSEMBLE: 1024,
      PRINT_HIGH_QUALITY: 2048
    },
    PDFDataRangeTransport: class MockPdfDataRangeTransport {
      /** Accepts PDF.js transport construction. */
      public constructor(_length: number, _initialData: Uint8Array | null) {}

      /** Accepts validated PDF.js bytes. */
      public onDataRange(_begin: number, _bytes: Uint8Array): void {}

      /** Matches the real transport cancellation surface. */
      public abort(): void {}
    },
    getDocument: mocks.getDocument
  }
}

vi.mock('pdfjs-dist', createPdfJsMock)
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', createPdfJsMock)

let fixture: HttpRangeTestServer

beforeAll(async () => {
  fixture = await startHttpRangeTestServer()
})

afterAll(async () => {
  await fixture.close()
})

beforeEach(() => {
  fixture.clearRequests()
  mocks.getDocument.mockReset()
})

describe('real local HTTP Range transport', () => {
  it('serves HEAD and 206 bytes with headers, credentials, and unique overlap progress', async () => {
    const fetchCalls: RequestInit[] = []
    const observedFetch: typeof globalThis.fetch = async (input, init) => {
      fetchCalls.push({ ...init })
      return await fetch(input, init)
    }
    const progress: number[] = []
    const received: Array<{ begin: number; bytes: Uint8Array }> = []
    TestRangeTransport.onRange = (begin, bytes) => { received.push({ begin, bytes }) }
    const transport = await createPdfRangeTransport({
      url: `${fixture.origin}/range.pdf`,
      headers: { Authorization: 'Bearer local-test', 'X-InkLayer-Test': 'range' },
      credentials: 'include',
      chunkSize: 65_536,
      signal: new AbortController().signal,
      fetch: observedFetch,
      Transport: TestRangeTransport as never,
      onError: vi.fn(),
      onProgress: loaded => { progress.push(loaded) }
    })
    expect(progress).toEqual([65_536])
    const rangeTransport = transport as unknown as {
      requestDataRange(begin: number, end: number): void
    }

    rangeTransport.requestDataRange(32_768, 98_304)
    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]).toEqual({
      begin: 32_768,
      bytes: fixture.bytes.slice(32_768, 98_304)
    })
    expect(progress.at(-1)).toBe(98_304)

    rangeTransport.requestDataRange(98_304, 131_072)
    await vi.waitFor(() => expect(received).toHaveLength(2))
    expect(progress.at(-1)).toBe(131_072)
    expect(fetchCalls).toHaveLength(4)
    expect(fetchCalls.every(call => call.credentials === 'include')).toBe(true)
    expect(fixture.requests.map(request => request.method)).toEqual(['HEAD', 'GET', 'GET', 'GET'])
    expect(fixture.requests.every(request => request.headers.authorization === 'Bearer local-test'))
      .toBe(true)
    expect(fixture.requests.every(request => request.headers['x-inklayer-test'] === 'range'))
      .toBe(true)
  })

  it('aborts a delayed partial response without classifying it as unsupported', async () => {
    const controller = new AbortController()
    const pending = probePdfRangeSupport({
      url: `${fixture.origin}/slow.pdf`,
      chunkSize: 32_768,
      signal: controller.signal,
      fetch
    })
    await vi.waitFor(() => expect(fixture.requests.map(request => request.method))
      .toEqual(['HEAD', 'GET']))
    controller.abort()
    await expect(pending).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_RANGE_FAILED',
      operation: 'fetchPdfRange'
    }))
  })

  it('emits Viewer progress from the exact initial bytes served over HTTP', async () => {
    mocks.getDocument.mockReturnValueOnce(createResolvedTask(createDocument('real-range-progress')))
    const engine = createPdfViewerEngine()
    const progress: Array<{
      phase: string
      loaded: number
      total: number | null
      range: boolean
    }> = []
    engine.subscribe(event => {
      if (event.type === 'loadProgress') progress.push({
        phase: event.progress.phase,
        loaded: event.progress.loaded,
        total: event.progress.total,
        range: event.progress.range
      })
    })

    await engine.load({
      url: `${fixture.origin}/range.pdf`,
      range: true,
      rangeChunkSize: 24_000
    })
    expect(progress).toContainEqual({
      phase: 'downloading',
      loaded: 24_000,
      total: fixture.bytes.byteLength,
      range: true
    })
    expect(fixture.requests.map(request => request.headers.range ?? null))
      .toEqual([null, 'bytes=0-23999'])
    expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      disableStream: true,
      disableAutoFetch: true,
      rangeChunkSize: 24_000
    }))
    await engine.destroy()
  })

  it.each(['/unsupported.pdf', '/head-405.pdf'])(
    'falls back to direct PDF.js URL loading for unsupported endpoint %s',
    async (pathname) => {
      const task = createResolvedTask(createDocument(`fallback:${pathname}`))
      mocks.getDocument.mockReturnValueOnce(task)
      const engine = createPdfViewerEngine()
      const progress: Array<{ phase: string; range: boolean }> = []
      engine.subscribe(event => {
        if (event.type === 'loadProgress') progress.push({
          phase: event.progress.phase,
          range: event.progress.range
        })
      })

      await engine.load({ url: `${fixture.origin}${pathname}`, range: 'auto' })
      expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({
        url: `${fixture.origin}${pathname}`,
        disableRange: false
      }))
      expect(progress).toContainEqual({ phase: 'downloading', range: false })
      expect(fixture.requests).toHaveLength(1)
      expect(fixture.requests[0]?.method).toBe('HEAD')
      await engine.destroy()
    }
  )

  it('does not hide an actual HTTP failure behind direct-loading fallback', async () => {
    const engine = createPdfViewerEngine()
    await expect(engine.load({
      url: `${fixture.origin}/failure.pdf`, range: 'auto'
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_RANGE_FAILED', operation: 'probePdfRangeSupport'
    }))
    expect(mocks.getDocument).not.toHaveBeenCalled()
    expect(fixture.requests).toHaveLength(1)
    expect(fixture.requests[0]?.method).toBe('HEAD')
    await engine.destroy()
  })
})

/** Minimal PDF.js Range base with an observable delivery hook. */
class TestRangeTransport {
  public static onRange: (begin: number, bytes: Uint8Array) => void = () => undefined

  /** Accepts PDF.js transport construction. */
  public constructor(_length: number, _initialData: Uint8Array | null) {}

  /** Delivers validated bytes to the current test observer. */
  public onDataRange(begin: number, bytes: Uint8Array): void {
    TestRangeTransport.onRange(begin, bytes)
  }

  /** Matches the real transport cancellation surface. */
  public abort(): void {}
}

/** Creates one minimal ready document. */
function createDocument(id: string): PDFDocumentProxy {
  return {
    numPages: 1,
    fingerprints: [id, null],
    getPermissions: vi.fn(async () => null)
  } as unknown as PDFDocumentProxy
}

/** Creates one immediately resolved loading task. */
function createResolvedTask(document: PDFDocumentProxy): PDFDocumentLoadingTask {
  return {
    promise: Promise.resolve(document),
    destroy: vi.fn(async () => undefined)
  } as unknown as PDFDocumentLoadingTask
}
