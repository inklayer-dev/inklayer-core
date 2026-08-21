/**
 * @file Local deterministic HTTP Range integration server.
 * @description Serves real HEAD, full-body, partial, delayed, unsupported, and
 * failing responses without depending on external network infrastructure.
 */

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/** One request observed by the local Range fixture. */
export interface HttpRangeRequestRecord {
  /** Normalized HTTP request method. */
  method: string
  /** URL pathname without query or origin. */
  pathname: string
  /** Headers received by the real Node HTTP server. */
  headers: IncomingHttpHeaders
}

/** Running local server and its deterministic PDF-like byte source. */
export interface HttpRangeTestServer {
  /** Loopback origin containing the assigned ephemeral port. */
  origin: string
  /** Complete deterministic PDF-like response bytes. */
  bytes: Uint8Array
  /** Mutable request journal reset between scenarios. */
  requests: HttpRangeRequestRecord[]
  clearRequests(): void
  close(): Promise<void>
}

/** Starts a loopback-only server on an operating-system assigned port. */
export async function startHttpRangeTestServer(): Promise<HttpRangeTestServer> {
  const bytes = Uint8Array.from({ length: 160_000 }, (_value, index) => index % 251)
  const requests: HttpRangeRequestRecord[] = []
  const server = createServer((request, response) => {
    const method = request.method ?? 'GET'
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    requests.push({ method, pathname, headers: { ...request.headers } })

    if (pathname === '/failure.pdf') {
      response.writeHead(503).end()
      return
    }
    if (pathname === '/unsupported.pdf') {
      if (method === 'HEAD') {
        response.writeHead(200, { 'Content-Length': bytes.byteLength }).end()
      } else {
        response.writeHead(200, {
          'Content-Length': bytes.byteLength,
          'Content-Type': 'application/pdf'
        }).end(Buffer.from(bytes))
      }
      return
    }
    if (pathname === '/head-405.pdf') {
      if (method === 'HEAD') response.writeHead(405).end()
      else response.writeHead(200, { 'Content-Length': bytes.byteLength }).end(Buffer.from(bytes))
      return
    }
    if (method === 'HEAD') {
      response.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': bytes.byteLength,
        'Content-Type': 'application/pdf'
      }).end()
      return
    }
    const range = parseRange(request.headers.range, bytes.byteLength)
    if (range === null) {
      response.writeHead(416, { 'Content-Range': `bytes */${bytes.byteLength}` }).end()
      return
    }
    const body = bytes.subarray(range.begin, range.end)
    const send = (): void => {
      if (response.destroyed) return
      response.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Content-Length': body.byteLength,
        'Content-Range': `bytes ${range.begin}-${range.end - 1}/${bytes.byteLength}`,
        'Content-Type': 'application/pdf'
      }).end(Buffer.from(body))
    }
    if (pathname === '/slow.pdf') setTimeout(send, 250)
    else send()
  })
  await listen(server)
  const address = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${address.port}`,
    bytes,
    requests,
    clearRequests: () => { requests.splice(0) },
    close: async () => await close(server)
  }
}

/** Parses one single inclusive HTTP byte range into half-open offsets. */
function parseRange(value: string | undefined, length: number): { begin: number; end: number } | null {
  const match = /^bytes=(\d+)-(\d+)$/u.exec(value ?? '')
  if (match === null) return null
  const begin = Number(match[1])
  const inclusiveEnd = Number(match[2])
  if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(inclusiveEnd)
    || begin < 0 || inclusiveEnd < begin || inclusiveEnd >= length) return null
  return { begin, end: inclusiveEnd + 1 }
}

/** Resolves after the loopback listener is ready. */
async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

/** Stops accepting connections and waits for active fixture requests to end. */
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
    server.closeAllConnections()
  })
}
