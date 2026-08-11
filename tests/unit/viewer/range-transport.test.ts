/**
 * @file Validated HTTP Range transport tests.
 * @description Covers HEAD and GET status, Content-Length, Content-Range,
 * credentials, headers, abort signals, unsupported servers, and network errors.
 */

import { describe, expect, it, vi } from 'vitest'
import type { InkLayerError } from '../../../src/domain/errors'
import {
  createPdfRangeTransport,
  probePdfRangeSupport
} from '../../../src/viewer/range-transport'

/** Creates a successful HTTP response with supplied status and headers. */
function response(status: number, body: Uint8Array | null, headers: Record<string, string>): Response {
  const responseBody = body === null ? null : new Uint8Array(body).buffer
  return new Response(responseBody, { status, headers })
}

describe('PDF Range probing', () => {
  it('validates metadata and an initial 206 response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(200, null, {
        'content-length': '4',
        'accept-ranges': 'bytes'
      }))
      .mockResolvedValueOnce(response(206, new Uint8Array([1, 2, 3, 4]), {
        'content-range': 'bytes 0-3/4'
      }))
    const controller = new AbortController()
    await expect(probePdfRangeSupport({
      url: '/document.pdf',
      headers: { Authorization: 'Bearer token' },
      credentials: 'include',
      chunkSize: 4,
      signal: controller.signal,
      fetch
    })).resolves.toEqual({ length: 4, initialData: new Uint8Array([1, 2, 3, 4]) })
    expect(fetch).toHaveBeenNthCalledWith(2, '/document.pdf', expect.objectContaining({
      credentials: 'include',
      signal: controller.signal,
      headers: { Authorization: 'Bearer token', Range: 'bytes=0-3' }
    }))
  })

  it.each([
    response(200, null, { 'content-length': '4' }),
    response(200, null, { 'content-length': 'invalid', 'accept-ranges': 'bytes' }),
    response(405, null, {})
  ])('classifies unsupported HEAD responses', async (head) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(head)
    await expect(probePdfRangeSupport({
      url: '/document.pdf', signal: new AbortController().signal, fetch
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_RANGE_UNSUPPORTED'
    }))
  })

  it('classifies ignored and malformed partial responses as unsupported', async () => {
    const head = response(200, null, { 'content-length': '4', 'accept-ranges': 'bytes' })
    const ignoredFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(response(200, new Uint8Array([1, 2, 3, 4]), {}))
    await expect(probePdfRangeSupport({
      url: '/document.pdf', signal: new AbortController().signal, fetch: ignoredFetch
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_RANGE_UNSUPPORTED'
    }))

    const malformedFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(head)
      .mockResolvedValueOnce(response(206, new Uint8Array([1, 2, 3, 4]), {
        'content-range': 'bytes 1-4/4'
      }))
    await expect(probePdfRangeSupport({
      url: '/document.pdf', signal: new AbortController().signal, fetch: malformedFetch
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_RANGE_UNSUPPORTED'
    }))
  })

  it('keeps ordinary network errors distinct from unsupported servers', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('offline'))
    await expect(probePdfRangeSupport({
      url: '/document.pdf', signal: new AbortController().signal, fetch
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({ code: 'PDF_RANGE_FAILED' }))
  })

  it('reports unique validated bytes without double-counting overlapping requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(200, null, {
        'content-length': '8',
        'accept-ranges': 'bytes'
      }))
      .mockResolvedValueOnce(response(206, new Uint8Array([1, 2, 3, 4]), {
        'content-range': 'bytes 0-3/8'
      }))
      .mockImplementation(async () => response(206, new Uint8Array([3, 4, 5, 6]), {
        'content-range': 'bytes 2-5/8'
      }))
    const progress: number[] = []
    class MockTransport {
      /** Accepts PDF.js transport construction. */
      public constructor(_length: number, _initialData: Uint8Array | null) {}

      /** Accepts a validated byte range. */
      public onDataRange(_begin: number, _chunk: Uint8Array): void {}
    }
    const transport = await createPdfRangeTransport({
      url: '/document.pdf',
      signal: new AbortController().signal,
      fetch,
      chunkSize: 4,
      Transport: MockTransport as never,
      onError: vi.fn(),
      onProgress: (loaded) => progress.push(loaded)
    })
    const rangeTransport = transport as unknown as { requestDataRange(begin: number, end: number): void }
    rangeTransport.requestDataRange(2, 6)
    await vi.waitFor(() => expect(progress).toEqual([4, 6]))
    rangeTransport.requestDataRange(2, 6)
    await vi.waitFor(() => expect(progress).toEqual([4, 6, 6]))
  })
})
