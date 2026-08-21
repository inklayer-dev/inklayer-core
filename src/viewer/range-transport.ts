/**
 * @file Validated PDF HTTP Range transport.
 * @description Probes server support, validates partial responses, propagates
 * cancellation, and distinguishes unsupported Range from network failures.
 */

import type { PDFDataRangeTransport } from 'pdfjs-dist'
import { InkLayerError } from '../domain/errors'

const DEFAULT_RANGE_CHUNK_SIZE = 65_536

/** Constructor surface of PDF.js `PDFDataRangeTransport`. */
export interface PdfDataRangeTransportConstructor {
  /** Constructs a PDF.js Range transport with optional initial bytes. */
  new(length: number, initialData: Uint8Array | null): PDFDataRangeTransport
}

/** Options used to probe and construct a validated Range transport. */
export interface PdfRangeTransportOptions {
  /** Absolute or relative PDF URL. */
  url: string
  /** Additional request headers. */
  headers?: Readonly<Record<string, string>>
  /** Fetch credential policy. */
  credentials?: RequestCredentials
  /** Range chunk size in bytes. */
  chunkSize?: number
  /** Abort signal owned by the Viewer load generation. */
  signal: AbortSignal
  /** Fetch implementation. */
  fetch: typeof globalThis.fetch
  /** PDF.js Range transport constructor from the dynamically loaded module. */
  Transport: PdfDataRangeTransportConstructor
  /** Receives asynchronous range request failures. */
  onError: (error: InkLayerError) => void
  /** Receives unique transferred-byte totals after each validated range. */
  onProgress?: (loaded: number, total: number) => void
}

/** Result of a successful HTTP Range capability probe. */
export interface PdfRangeProbe {
  /** Complete PDF byte length. */
  length: number
  /** Validated initial partial response bytes. */
  initialData: Uint8Array
}

/** Probes HTTP Range support with HEAD metadata and a validated partial GET. */
export async function probePdfRangeSupport(
  options: Omit<PdfRangeTransportOptions, 'Transport' | 'onError'>
): Promise<PdfRangeProbe> {
  const chunkSize = normalizeChunkSize(options.chunkSize)
  const fetch = options.fetch
  let head: Response
  try {
    head = await fetch(options.url, {
      method: 'HEAD',
      signal: options.signal,
      ...(options.headers === undefined ? {} : { headers: options.headers }),
      ...(options.credentials === undefined ? {} : { credentials: options.credentials })
    })
  } catch (cause) {
    throw rangeFailure('PDF Range HEAD request failed.', 'probePdfRangeSupport', cause)
  }
  if (head.status === 405 || head.status === 501) throw rangeUnsupported('Server rejects Range probing.')
  if (!head.ok) throw rangeFailure(`PDF Range HEAD returned HTTP ${head.status}.`, 'probePdfRangeSupport')
  const length = parseContentLength(head.headers.get('content-length'))
  if (length === null || head.headers.get('accept-ranges')?.toLowerCase() !== 'bytes') {
    throw rangeUnsupported('Server does not advertise byte ranges with a valid Content-Length.')
  }
  const end = Math.min(length, chunkSize) - 1
  const initialData = await fetchValidatedRange(options, length, 0, end + 1)
  return { length, initialData }
}

/** Creates a PDF.js transport after validating server Range behavior. */
export async function createPdfRangeTransport(
  options: PdfRangeTransportOptions
): Promise<PDFDataRangeTransport> {
  const probe = await probePdfRangeSupport(options)
  const received = new ReceivedByteTracker()
  options.onProgress?.(received.add(0, probe.initialData.byteLength), probe.length)
  const BaseTransport = options.Transport
  class ValidatedRangeTransport extends BaseTransport {
    /** Requests one validated byte range for PDF.js. */
    public override requestDataRange(begin: number, end: number): void {
      void fetchValidatedRange(options, probe.length, begin, end)
        .then((chunk) => {
          options.onProgress?.(received.add(begin, begin + chunk.byteLength), probe.length)
          this.onDataRange(begin, chunk)
        })
        .catch((cause: unknown) => {
          const error = cause instanceof InkLayerError
            ? cause
            : rangeFailure('PDF Range request failed.', 'requestDataRange', cause)
          options.onError(error)
        })
    }

    /** Aborts pending requests through the generation-owned signal. */
    public override abort(): void {
      super.abort()
    }
  }
  return new ValidatedRangeTransport(probe.length, probe.initialData)
}

/** Counts the union of received byte intervals without double-counting retries. */
class ReceivedByteTracker {
  private intervals: Array<{ begin: number; end: number }> = []

  /** Adds one half-open interval and returns the total unique byte count. */
  public add(begin: number, end: number): number {
    const ordered = [...this.intervals, { begin, end }]
      .sort((left, right) => left.begin - right.begin)
    const merged: Array<{ begin: number; end: number }> = []
    for (const interval of ordered) {
      const previous = merged.at(-1)
      if (previous === undefined || interval.begin > previous.end) {
        merged.push({ ...interval })
      } else {
        previous.end = Math.max(previous.end, interval.end)
      }
    }
    this.intervals = merged
    return merged.reduce((total, interval) => total + interval.end - interval.begin, 0)
  }
}

/** Fetches and validates one inclusive-exclusive byte range. */
async function fetchValidatedRange(
  options: Omit<PdfRangeTransportOptions, 'Transport' | 'onError'>,
  length: number,
  begin: number,
  end: number
): Promise<Uint8Array> {
  const fetch = options.fetch
  let response: Response
  try {
    response = await fetch(options.url, {
      method: 'GET',
      headers: { ...options.headers, Range: `bytes=${begin}-${end - 1}` },
      signal: options.signal,
      ...(options.credentials === undefined ? {} : { credentials: options.credentials })
    })
  } catch (cause) {
    throw rangeFailure('PDF Range GET request failed.', 'fetchPdfRange', cause)
  }
  if (response.status === 200) {
    await cancelResponseBody(response)
    throw rangeUnsupported('Server ignored the byte Range request.')
  }
  if (response.status !== 206) {
    await cancelResponseBody(response)
    throw rangeFailure(`PDF Range GET returned HTTP ${response.status}.`, 'fetchPdfRange')
  }
  const expected = `bytes ${begin}-${end - 1}/${length}`
  if (response.headers.get('content-range') !== expected) {
    await cancelResponseBody(response)
    throw rangeUnsupported('Server returned an invalid Content-Range header.')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength !== end - begin) {
    throw rangeFailure('PDF Range response length does not match Content-Range.', 'fetchPdfRange')
  }
  return bytes
}

/** Cancels an unused response body so fallback does not retain a download. */
async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The generation AbortController remains the authoritative cancellation path.
  }
}

/** Parses a positive safe Content-Length value. */
function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const length = Number(value)
  return Number.isSafeInteger(length) && length > 0 ? length : null
}

/** Normalizes a configured Range chunk size. */
function normalizeChunkSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RANGE_CHUNK_SIZE
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw rangeFailure('Range chunk size must be a positive safe integer.', 'rangeOptions')
  }
  return value
}

/** Creates a structured server-capability failure. */
function rangeUnsupported(message: string): InkLayerError {
  return new InkLayerError('PDF_RANGE_UNSUPPORTED', message, { operation: 'probePdfRangeSupport' })
}

/** Creates a structured Range network or validation failure. */
function rangeFailure(message: string, operation: string, cause?: unknown): InkLayerError {
  return new InkLayerError('PDF_RANGE_FAILED', message, {
    operation,
    ...(cause === undefined ? {} : { cause })
  })
}
