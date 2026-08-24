/**
 * @file Repeatable Core performance and bundle baseline.
 * @description Measures repository/import/export workloads, transitive entry
 * bytes, browser load/zoom/remount, and heap change after 100 lifecycle cycles.
 */

import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { chromium } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const projectRoot = resolve(import.meta.dirname, '..')
const distRoot = resolve(projectRoot, 'dist')
const exampleRoot = resolve(projectRoot, 'dist-example')

/** Measures the median elapsed milliseconds for one sync or async operation. */
async function measure(operation, rounds = 5) {
  const samples = []
  for (let round = 0; round < rounds; round += 1) {
    const start = performance.now()
    await operation()
    samples.push(performance.now() - start)
  }
  samples.sort((left, right) => left - right)
  return Number((samples[Math.floor(samples.length / 2)] ?? 0).toFixed(2))
}

/** Creates one complete canonical benchmark annotation. */
function annotation(index) {
  const id = `benchmark-${index}`
  return {
    id,
    schemaVersion: 1,
    type: 'rectangle',
    pageIndex: index % 10,
    bounds: { x: index, y: index, width: 20, height: 10 },
    coordinateSpace: 'konva-stage',
    content: { text: '' },
    comments: [],
    author: { id: 'benchmark', name: 'Benchmark' },
    createdAt: null,
    native: false,
    rendererState: {
      engine: 'konva', schemaVersion: 1,
      serialized: JSON.stringify({ className: 'Group', attrs: { id } })
    }
  }
}

/** Creates the minimal reversible root surface used by a detached engine lifecycle. */
function engineRoot() {
  const classes = new Set()
  return {
    dataset: {},
    classList: {
      add: (...tokens) => tokens.forEach((token) => classes.add(token)),
      remove: (...tokens) => tokens.forEach((token) => classes.delete(token))
    }
  }
}

/** Returns the unique static transitive ESM byte size for one built entry. */
async function transitiveEntryBytes(entry) {
  const visited = new Set()

  /** Visits one built module and its relative static imports. */
  async function visit(file) {
    if (visited.has(file)) return 0
    visited.add(file)
    const content = await readFile(file, 'utf8')
    let bytes = (await stat(file)).size
    const specifiers = [...content.matchAll(/(?:from\s*|import\s*)["'](\.\.?\/[^"']+)["']/g)]
      .map((match) => match[1])
    for (const specifier of specifiers) {
      if (specifier !== undefined) bytes += await visit(resolve(file, '..', specifier))
    }
    return bytes
  }

  return visit(resolve(distRoot, entry))
}

/** Starts a minimal static server for the already-built Vanilla example. */
async function startExampleServer() {
  const mime = new Map([
    ['.html', 'text/html'], ['.js', 'text/javascript'], ['.mjs', 'text/javascript'],
    ['.css', 'text/css'], ['.map', 'application/json']
  ])
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const file = resolve(exampleRoot, pathname === '/' ? 'index.html' : `.${pathname}`)
      if (file !== exampleRoot && !file.startsWith(`${exampleRoot}/`)) throw new Error('Invalid static path.')
      response.setHeader('content-type', mime.get(extname(file)) ?? 'application/octet-stream')
      response.end(await readFile(file))
    } catch {
      response.statusCode = 404
      response.end('Not found')
    }
  })
  await new Promise((resolveListening) => server.listen(0, '127.0.0.1', resolveListening))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Benchmark server address is unavailable.')
  return { server, url: `http://127.0.0.1:${address.port}` }
}

/** Waits until the single Vanilla workspace reports ready. */
async function waitForReady(page) {
  await page.waitForFunction(() => {
    const statuses = [...globalThis.document.querySelectorAll('.instance-status')]
    return statuses.length === 1 && statuses.every((status) => status.textContent?.startsWith('Ready'))
  })
}

const core = await import(resolve(distRoot, 'index.js'))
const nativeImport = await import(resolve(distRoot, 'import/pdfjs.js'))
const pdfExport = await import(resolve(distRoot, 'export/pdf.js'))
const sets = {
  100: Array.from({ length: 100 }, (_, index) => annotation(index)),
  1000: Array.from({ length: 1_000 }, (_, index) => annotation(index))
}
const pageBox = { xMin: 0, yMin: 0, xMax: 600, yMax: 800, rotation: 0 }
const nativeAnnotations = Array.from({ length: 100 }, (_, index) => ({
  id: `native-${index}`, annotationType: 5, rect: [10, 10, 30, 30]
}))
const pdfDocument = await PDFDocument.create()
pdfDocument.addPage([600, 800])
const pdfBytes = await pdfDocument.save()
const exportAnnotations = sets[100].map((value) => ({ ...value, pageIndex: 0 }))
globalThis.gc?.()
const lifecycleHeapBefore = process.memoryUsage().heapUsed
const lifecycleStart = performance.now()
for (let cycle = 0; cycle < 100; cycle += 1) {
  const engine = core.createAnnotationEngine({ root: engineRoot() })
  engine.destroy()
}
const lifecycleDuration = performance.now() - lifecycleStart
globalThis.gc?.()
const lifecycleHeapAfter = process.memoryUsage().heapUsed

const metrics = {
  bundleBytes: {
    viewer: await transitiveEntryBytes('viewer.js'),
    annotation: await transitiveEntryBytes('annotation.js'),
    pdfExport: await transitiveEntryBytes('export/pdf.js'),
    excelExport: await transitiveEntryBytes('export/excel.js')
  },
  milliseconds: {
    repositoryLoad100: await measure(() => {
      const repository = core.createMemoryAnnotationRepository()
      repository.replaceAll(sets[100])
      repository.destroy()
    }),
    repositoryLoad1000: await measure(() => {
      const repository = core.createMemoryAnnotationRepository()
      repository.replaceAll(sets[1000])
      repository.destroy()
    }),
    pdfImport100: await measure(() => nativeImport.importPdfJsAnnotations([
      { pageIndex: 0, pageBox, annotations: nativeAnnotations }
    ])),
    pdfExport100: await measure(() => pdfExport.buildAnnotatedPdf(pdfBytes, exportAnnotations)),
    annotationLifecycle100: Number(lifecycleDuration.toFixed(2))
  },
  heapBytesAfter100AnnotationLifecycles: lifecycleHeapAfter - lifecycleHeapBefore
}

const { server, url } = await startExampleServer()
const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`Browser benchmark error: ${message.text()}\n`)
  })
  page.on('pageerror', (error) => process.stderr.write(`Browser benchmark page error: ${error.message}\n`))
  const loadStart = performance.now()
  await page.goto(`${url}/?clean=1`)
  await waitForReady(page)
  metrics.milliseconds.browserInitialLoad = Number((performance.now() - loadStart).toFixed(2))
  const zoomStart = performance.now()
  await page.locator('.instance-card').first().getByRole('button', { name: 'Zoom +' }).click()
  await page.locator('.instance-card').first().locator('.pdf-canvas[width="525"]').waitFor({ state: 'visible' })
  metrics.milliseconds.zoomAndPageReattach = Number((performance.now() - zoomStart).toFixed(2))
  const previousInstance = await page.locator('.instance-card').first().getAttribute('data-inklayer-instance')
  const remountStart = performance.now()
  await page.getByRole('button', { name: 'Restart Core' }).click()
  await page.waitForFunction((instance) =>
    globalThis.document.querySelector('.instance-card')?.getAttribute('data-inklayer-instance') !== instance,
  previousInstance)
  await waitForReady(page)
  metrics.milliseconds.browserDestroyRemount = Number((performance.now() - remountStart).toFixed(2))
} finally {
  await browser.close()
  await new Promise((resolveClosed, rejectClosed) => server.close((error) => {
    if (error === undefined) resolveClosed()
    else rejectClosed(error)
  }))
}

process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`)
