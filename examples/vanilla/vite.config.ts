/**
 * @file Source-backed Vite configuration for the Vanilla development example.
 * @description Resolves public InkLayer package specifiers directly to current
 * source files so Core changes are visible without a preceding library build.
 * @remarks This configuration belongs to the example and does not alter the
 * published package resolution or production library build.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { createRangeSamplePdf } from './src/sample-pdf.js'

const projectRoot = resolve(import.meta.dirname, '../..')

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [rangeSamplePlugin()],
  resolve: {
    alias: [
      { find: /^@inklayer-dev\/core$/, replacement: resolve(projectRoot, 'src/index.ts') },
      {
        find: /^@inklayer-dev\/core\/viewer$/,
        replacement: resolve(projectRoot, 'src/viewer/index.ts')
      },
      {
        find: /^@inklayer-dev\/core\/annotation$/,
        replacement: resolve(projectRoot, 'src/annotation/index.ts')
      },
      {
        find: /^@inklayer-dev\/core\/annotation-types$/,
        replacement: resolve(projectRoot, 'src/annotation-types/index.ts')
      },
      {
        find: /^@inklayer-dev\/core\/import\/pdfjs$/,
        replacement: resolve(projectRoot, 'src/import/pdfjs/index.ts')
      },
      {
        find: /^@inklayer-dev\/core\/export\/pdf$/,
        replacement: resolve(projectRoot, 'src/export/pdf/index.ts')
      },
      {
        find: /^@inklayer-dev\/core\/export\/excel$/,
        replacement: resolve(projectRoot, 'src/export/excel/index.ts')
      },
      {
        find: /^@inklayer-dev\/core\/style$/,
        replacement: resolve(projectRoot, 'src/styles/engine.css')
      }
    ]
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  build: {
    copyPublicDir: false,
    sourcemap: true
  }
})

/** Serves one real same-origin PDF with deterministic HEAD and Range semantics. */
function rangeSamplePlugin(): Plugin {
  const bytes = createRangeSamplePdf()
  const failedRecoveryRequests = new Set<string>()
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void
  ): void => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const supportedPath = url.pathname === '/range-sample.pdf'
      || url.pathname === '/recovery-url.pdf'
      || url.pathname === '/recovery-range.pdf'
    if (!supportedPath) return next()
    const delay = boundedDelay(url.searchParams.get('delay'))
    const send = (): void => {
      if (response.destroyed) return
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Accept-Ranges', 'bytes')
      response.setHeader('Content-Type', 'application/pdf')
      if (request.method === 'HEAD') {
        response.setHeader('Content-Length', bytes.byteLength)
        response.writeHead(200).end()
        return
      }
      if (url.pathname.startsWith('/recovery-')) {
        const requestId = `${url.pathname}:${url.searchParams.get('request') ?? 'default'}`
        if (!failedRecoveryRequests.has(requestId)) {
          failedRecoveryRequests.add(requestId)
          if (url.pathname === '/recovery-url.pdf') {
            const invalidPdf = Buffer.from('Intentional invalid PDF fixture.')
            response.setHeader('Content-Length', invalidPdf.byteLength)
            response.writeHead(200).end(invalidPdf)
            return
          }
          response.writeHead(503).end('Intentional one-shot recovery failure.')
          return
        }
      }
      const range = parseHttpRange(request.headers.range, bytes.byteLength)
      if (range === null) {
        response.setHeader('Content-Length', bytes.byteLength)
        response.writeHead(200).end(Buffer.from(bytes))
        return
      }
      const body = bytes.subarray(range.begin, range.end)
      response.setHeader('Content-Length', body.byteLength)
      response.setHeader(
        'Content-Range',
        `bytes ${range.begin}-${range.end - 1}/${bytes.byteLength}`
      )
      response.writeHead(206).end(Buffer.from(body))
    }
    if (delay === 0) send()
    else setTimeout(send, delay)
  }
  return {
    name: 'inklayer-range-sample',
    /** Emits the Range fixture beside the nested production demo entry. */
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'range-sample.pdf', source: bytes })
    },
    configureServer: server => { server.middlewares.use(middleware) },
    configurePreviewServer: server => { server.middlewares.use(middleware) }
  }
}

/** Parses one ordinary closed HTTP byte range into half-open offsets. */
function parseHttpRange(
  value: string | undefined,
  length: number
): { begin: number; end: number } | null {
  const match = /^bytes=(\d+)-(\d+)$/u.exec(value ?? '')
  if (match === null) return null
  const begin = Number(match[1])
  const inclusiveEnd = Number(match[2])
  if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(inclusiveEnd)
    || begin < 0 || inclusiveEnd < begin || inclusiveEnd >= length) return null
  return { begin, end: inclusiveEnd + 1 }
}

/** Keeps the debugging delay useful without allowing an unbounded timer. */
function boundedDelay(value: string | null): number {
  if (value === null) return 0
  const delay = Number(value)
  return Number.isFinite(delay) ? Math.min(2_000, Math.max(0, delay)) : 0
}
