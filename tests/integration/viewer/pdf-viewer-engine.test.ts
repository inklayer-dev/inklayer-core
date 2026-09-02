/**
 * @file PDF Viewer Engine lifecycle integration tests with PDF.js module seams.
 * @description Covers byte and URL loading, replacement, cancellation, retry,
 * listener isolation, web resource detachment, and idempotent destruction.
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InkLayerError } from '../../../src/domain/errors'
import { createPdfViewerEngine } from '../../../src/viewer/pdf-viewer-engine'

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  worker: { workerSrc: '' },
  viewerSetDocument: vi.fn(),
  linkSetDocument: vi.fn(),
  linkSetViewer: vi.fn()
}))

/** Creates the shared standard and Node-legacy PDF.js module mock. */
function createPdfJsMock(): object {
  return {
    GlobalWorkerOptions: mocks.worker,
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
    /** Creates the mocked transport. */
      public constructor(_length: number, _initialData: Uint8Array | null) {}

    /** Accepts a mocked data range. */
      public onDataRange(_begin: number, _chunk: Uint8Array | null): void {}

    /** Provides a mocked range request hook. */
      public requestDataRange(_begin: number, _end: number): void {}

    /** Aborts the mocked transport. */
      public abort(): void {}
    },
    getDocument: mocks.getDocument
  }
}

vi.mock('pdfjs-dist', createPdfJsMock)
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', createPdfJsMock)

vi.mock('pdfjs-dist/web/pdf_viewer.mjs', () => ({
  EventBus: class MockEventBus {
    private readonly listeners = new Map<string, Set<(event: unknown) => void>>()

    /** Adds one PDF.js-compatible event listener. */
    public on(name: string, listener: (event: unknown) => void): void {
      const listeners = this.listeners.get(name) ?? new Set()
      listeners.add(listener)
      this.listeners.set(name, listeners)
    }

    /** Removes one PDF.js-compatible event listener. */
    public off(name: string, listener: (event: unknown) => void): void {
      this.listeners.get(name)?.delete(listener)
    }
  },
  PDFLinkService: class MockLinkService {
    /** Creates the mocked link service. */
    public constructor(_options: unknown) {}

    /** Records Viewer attachment. */
    public setViewer(viewer: unknown): void {
      mocks.linkSetViewer(viewer)
    }

    /** Records document attachment and detachment. */
    public setDocument(document: unknown): void {
      mocks.linkSetDocument(document)
    }
  },
  PDFViewer: class MockViewer {
    private scale = 1
    private scaleValue = 'auto'

    /** Returns the resolved numeric mock scale. */
    public get currentScale(): number { return this.scale }

    /** Applies a numeric scale and leaves adaptive preset mode. */
    public set currentScale(value: number) {
      this.scale = value
      this.scaleValue = String(value)
    }

    /** Returns the requested numeric or adaptive mock scale. */
    public get currentScaleValue(): string { return this.scaleValue }

    /** Applies one requested preset or numeric string. */
    public set currentScaleValue(value: string) {
      this.scaleValue = value
      const numeric = Number.parseFloat(value)
      if (Number.isFinite(numeric) && numeric > 0) this.scale = numeric
    }

    /** Creates the mocked web viewer. */
    public constructor(_options: unknown) {}

    /** Records document attachment and detachment. */
    public setDocument(document: unknown): void {
      mocks.viewerSetDocument(document)
    }
  }
}))

/** Creates the minimal document proxy observed by the engine. */
function createDocument(id: string): PDFDocumentProxy {
  return {
    numPages: 2,
    fingerprints: [id, null],
    getPermissions: vi.fn(async () => null),
    getPage: vi.fn(async (pageNumber: number) => {
      const text = `Shared keyword on page ${pageNumber}`
      return {
        getTextContent: vi.fn(async () => ({
        items: [{
          str: text, dir: 'ltr', transform: [10, 0, 0, 10, 20, 580],
          width: text.length * 8, height: 10, fontName: 'sans', hasEOL: false
        }],
        styles: {}, lang: null
        })),
        getViewport: vi.fn(() => ({
          width: 400, height: 600, userUnit: 1,
          transform: [1, 0, 0, -1, 0, 600]
        }))
      }
    })
  } as unknown as PDFDocumentProxy
}

/** Creates a loading task that accepts one known password and reports retries. */
function createPasswordTask(document: PDFDocumentProxy, expected: string): PDFDocumentLoadingTask {
  let resolvePromise: (value: PDFDocumentProxy) => void = () => undefined
  let rejectPromise: (cause: unknown) => void = () => undefined
  let callback: ((update: (password: string) => void, reason: number) => void) | null = null
  const promise = new Promise<PDFDocumentProxy>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  const request = (reason: number): void => {
    queueMicrotask(() => callback?.((password) => {
      if (password === expected) resolvePromise(document)
      else request(2)
    }, reason))
  }
  const task = {
    promise,
    destroy: vi.fn(async () => rejectPromise(new Error('cancelled'))),
    set onPassword(value: (update: (password: string) => void, reason: number) => void) {
      callback = value
      request(1)
    }
  }
  return task as unknown as PDFDocumentLoadingTask
}

/** Creates a resolved PDF.js loading task with a destroy spy. */
function createResolvedTask(document: PDFDocumentProxy): PDFDocumentLoadingTask {
  return {
    promise: Promise.resolve(document),
    destroy: vi.fn(async () => undefined)
  } as unknown as PDFDocumentLoadingTask
}

/** Creates a task whose destroy operation rejects its pending load. */
function createPendingTask(): { task: PDFDocumentLoadingTask; destroy: ReturnType<typeof vi.fn> } {
  let rejectPromise: (cause: unknown) => void = () => undefined
  const promise = new Promise<PDFDocumentProxy>((_resolve, reject) => {
    rejectPromise = reject
  })
  const destroy = vi.fn(async () => {
    rejectPromise(new Error('cancelled'))
  })
  return {
    task: { promise, destroy } as unknown as PDFDocumentLoadingTask,
    destroy
  }
}

/** Creates a controllable loading task with a real PDF.js-style progress callback. */
function createProgressTask(document: PDFDocumentProxy): {
  task: PDFDocumentLoadingTask
  report: (loaded: number, total: number) => void
  resolve: () => void
} {
  let resolvePromise: (value: PDFDocumentProxy) => void = () => undefined
  let progress: ((value: { loaded: number; total: number }) => void) | null = null
  const promise = new Promise<PDFDocumentProxy>((resolve) => {
    resolvePromise = resolve
  })
  return {
    task: {
      promise,
      destroy: vi.fn(async () => undefined),
      set onProgress(value: (progress: { loaded: number; total: number }) => void) {
        progress = value
      }
    } as unknown as PDFDocumentLoadingTask,
    report: (loaded, total) => progress?.({ loaded, total }),
    resolve: () => resolvePromise(document)
  }
}

beforeEach(() => {
  mocks.getDocument.mockReset()
  mocks.viewerSetDocument.mockReset()
  mocks.linkSetDocument.mockReset()
  mocks.linkSetViewer.mockReset()
})

describe('PDF Viewer Engine lifecycle', () => {
  it('copies byte input, loads a document, and destroys its task once', async () => {
    const document = createDocument('bytes')
    const task = createResolvedTask(document)
    mocks.getDocument.mockReturnValue(task)
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    const bytes = new Uint8Array([1, 2, 3])
    const loadPromise = engine.load({ data: bytes })
    bytes[0] = 9
    const handle = await loadPromise
    const parameters = mocks.getDocument.mock.calls[0]?.[0] as { data: Uint8Array }
    expect(parameters.data).not.toBe(bytes)
    expect(parameters.data).toEqual(new Uint8Array([1, 2, 3]))
    expect(handle).toMatchObject({ numPages: 2, fingerprints: ['bytes', null] })
    expect(engine.getSnapshot().status).toBe('ready')
    await engine.destroy()
    await engine.destroy()
    expect(task.destroy).toHaveBeenCalledOnce()
    expect(engine.getSnapshot().status).toBe('destroyed')
  })

  it('exposes generation-scoped batch search through the Viewer facade', async () => {
    const document = createDocument('batch-search')
    mocks.getDocument.mockReturnValue(createResolvedTask(document))
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    await engine.load({ data: new Uint8Array([1]) })

    await expect(engine.searchMany([
      { id: 'shared', query: 'shared' },
      { id: 'second-page', query: 'page 2', options: { matchCase: true } }
    ])).resolves.toMatchObject({
      queries: [
        { id: 'shared', matches: [{ pageIndex: 0 }, { pageIndex: 1 }] },
        { id: 'second-page', matches: [{ pageIndex: 1 }] }
      ],
      truncated: false
    })
    expect(document.getPage).toHaveBeenCalledTimes(2)
    await engine.destroy()
  })

  it('resolves search matches through the Viewer geometry facade', async () => {
    const document = createDocument('range-geometry')
    mocks.getDocument.mockReturnValue(createResolvedTask(document))
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    await engine.load({ data: new Uint8Array([1]) })

    const search = await engine.search('keyword', { maxResults: 1 })
    await expect(engine.resolveTextRanges(search.matches)).resolves.toEqual([{
      pageIndex: 0,
      start: 7,
      length: 7,
      text: 'keyword',
      rects: [{ x: 76, y: 10, width: 56, height: 10 }]
    }])
    expect(document.getPage).toHaveBeenCalledOnce()
    await engine.destroy()
  })

  it('exposes validated temporary text-highlight layer lifecycle', async () => {
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    expect(() => engine.setTextHighlightLayers([])).toThrow(expect.objectContaining({
      code: 'PDF_FEATURE_FAILED', operation: 'setTextHighlightLayers'
    }))
    mocks.getDocument.mockReturnValue(createResolvedTask(createDocument('layer-state')))
    await engine.load({ data: new Uint8Array([1]) })

    expect(() => engine.setTextHighlightLayers([{
      id: 'risk',
      ranges: [{ pageIndex: 0, start: 0, length: 6 }],
      style: { color: '#ef4444', activeColor: '#b91c1c' },
      activeRangeIndex: 0
    }])).not.toThrow()
    expect(() => engine.setTextHighlightLayers([
      { id: 'same', ranges: [], style: { color: '#ef4444' } },
      { id: 'same', ranges: [], style: { color: '#f59e0b' } }
    ])).toThrow(expect.objectContaining({
      code: 'PDF_FEATURE_FAILED', operation: 'setTextHighlightLayers'
    }))
    expect(() => engine.clearTextHighlightLayers(['risk'])).not.toThrow()
    expect(() => engine.clearTextHighlightLayers()).not.toThrow()
    await engine.destroy()
    expect(() => engine.clearTextHighlightLayers()).toThrow(expect.objectContaining({
      code: 'ENGINE_DESTROYED'
    }))
  })

  it('cancels and destroys pending loads without stale state updates', async () => {
    const cancelled = createPendingTask()
    const destroyed = createPendingTask()
    mocks.getDocument.mockReturnValueOnce(cancelled.task).mockReturnValueOnce(destroyed.task)
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    const cancelledLoad = engine.load({ data: new Uint8Array([1]) })
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1))
    await engine.cancelLoad()
    await expect(cancelledLoad).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_LOAD_CANCELLED', operation: 'load'
    }))
    expect(engine.getSnapshot().status).toBe('idle')
    const destroyedLoad = engine.load({ data: new Uint8Array([2]) })
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(2))
    await engine.destroy()
    await expect(destroyedLoad).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_LOAD_FAILED'
    }))
    expect(engine.getSnapshot().status).toBe('destroyed')
    expect(cancelled.destroy).toHaveBeenCalledOnce()
    expect(destroyed.destroy).toHaveBeenCalledOnce()
  })

  it('cancels an older load before a replacement becomes ready', async () => {
    const pending = createPendingTask()
    const nextTask = createResolvedTask(createDocument('next'))
    mocks.getDocument.mockReturnValueOnce(pending.task).mockReturnValueOnce(nextTask)
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    const firstLoad = engine.load({ data: new Uint8Array([1]) })
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledTimes(1))
    const secondLoad = engine.load({ data: new Uint8Array([2]) })
    await expect(firstLoad).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_LOAD_FAILED'
    }))
    await expect(secondLoad).resolves.toMatchObject({ fingerprints: ['next', null] })
    expect(pending.destroy).toHaveBeenCalledOnce()
    expect(engine.getSnapshot()).toMatchObject({ status: 'ready', generation: 2 })
    await engine.destroy()
  })

  it('supports explicit no-Range URL loading and automatic unsupported fallback', async () => {
    mocks.getDocument
      .mockReturnValueOnce(createResolvedTask(createDocument('direct')))
      .mockReturnValueOnce(createResolvedTask(createDocument('fallback')))
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(null, { status: 200, headers: { 'content-length': '10' } })
    )
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs', fetch })
    await engine.load({ url: '/direct.pdf', range: false, headers: { 'X-Test': 'yes' } })
    expect(mocks.getDocument).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: '/direct.pdf', disableRange: true, httpHeaders: { 'X-Test': 'yes' }
    }))
    await engine.load({ url: '/fallback.pdf', range: 'auto' })
    expect(mocks.getDocument).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: '/fallback.pdf', disableRange: false
    }))
    await engine.destroy()
  })

  it('emits direct download and parsing progress for the current generation', async () => {
    const controlled = createProgressTask(createDocument('progress'))
    mocks.getDocument.mockReturnValue(controlled.task)
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    const progress: Array<{ phase: string; percentage: number | null }> = []
    engine.subscribe((event) => {
      if (event.type === 'loadProgress') {
        progress.push({ phase: event.progress.phase, percentage: event.progress.percentage })
      }
    })
    const loading = engine.load({ url: '/document.pdf', range: false })
    await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalledOnce())
    controlled.report(25, 100)
    controlled.report(100, 100)
    expect(engine.getSnapshot().progress).toMatchObject({ phase: 'parsing', percentage: 100 })
    controlled.resolve()
    await loading
    expect(progress).toEqual([
      { phase: 'downloading', percentage: null },
      { phase: 'downloading', percentage: 25 },
      { phase: 'parsing', percentage: 100 }
    ])
    expect(engine.getSnapshot().progress).toBeNull()
    await engine.destroy()
  })

  it('requests, retries, and submits passwords without exposing credentials', async () => {
    const document = createDocument('protected')
    mocks.getDocument.mockReturnValue(createPasswordTask(document, 'correct-secret'))
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    const requests: Array<{ requestId: string; reason: string; attempt: number }> = []
    engine.subscribe((event) => {
      if (event.type === 'passwordRequired') requests.push({ ...event.request })
    })
    const loading = engine.load({ data: new Uint8Array([1]) })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(engine.getSnapshot().status).toBe('awaiting-password')
    engine.submitPassword(requests[0]?.requestId ?? '', 'wrong-secret')
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toMatchObject({ reason: 'incorrect', attempt: 2 })
    expect(JSON.stringify(requests)).not.toContain('wrong-secret')
    engine.submitPassword(requests[1]?.requestId ?? '', 'correct-secret')
    await expect(loading).resolves.toMatchObject({
      passwordProtected: true,
      permissions: { print: 'high-resolution', copy: true }
    })
    await engine.destroy()
  })

  it('cancels a password request and rejects stale password UI input', async () => {
    mocks.getDocument.mockReturnValue(createPasswordTask(createDocument('protected'), 'secret'))
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    let requestId = ''
    engine.subscribe((event) => {
      if (event.type === 'passwordRequired') requestId = event.request.requestId
    })
    const loading = engine.load({ data: new Uint8Array([1]) })
    await vi.waitFor(() => expect(requestId).not.toBe(''))
    await engine.cancelPassword(requestId)
    await expect(loading).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_PASSWORD_CANCELLED'
    }))
    expect(engine.getSnapshot().status).toBe('idle')
    expect(() => engine.submitPassword(requestId, 'secret')).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'PDF_LOAD_FAILED' })
    )
    await engine.destroy()
  })

  it('does not hide network failures behind auto fallback and permits retry', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { 'content-length': '10' }
      }))
    mocks.getDocument.mockReturnValue(createResolvedTask(createDocument('retry')))
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs', fetch })
    await expect(engine.load({ url: '/document.pdf', range: 'auto' })).rejects.toEqual(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'PDF_RANGE_FAILED' })
    )
    expect(engine.getSnapshot().status).toBe('error')
    await expect(engine.load({ url: '/document.pdf', range: 'auto' })).resolves.toMatchObject({
      fingerprints: ['retry', null]
    })
    await engine.destroy()
  })

  it('isolates listener failures and detaches web Viewer resources', async () => {
    const onListenerError = vi.fn()
    mocks.getDocument.mockReturnValue(createResolvedTask(createDocument('web')))
    const engine = createPdfViewerEngine({
      workerSrc: '/pdf.worker.mjs',
      container: {} as HTMLDivElement,
      enablePinchZoom: false,
      onListenerError
    })
    const listener = vi.fn(() => { throw new Error('listener failed') })
    engine.subscribe(listener)
    await engine.load({ data: new Uint8Array([1]) })
    expect(onListenerError).toHaveBeenCalled()
    expect('getViewer' in engine).toBe(false)
    expect('getEventBus' in engine).toBe(false)
    const scaleEvents: number[] = []
    engine.subscribe((event) => {
      if (event.type === 'scaleChanged') scaleEvents.push(event.state.scale)
    })
    engine.setScale('page-fit')
    engine.zoomIn()
    expect(engine.getScale()).toMatchObject({ value: 1.1, scale: 1.1, percentage: 110 })
    engine.zoomOut()
    expect(engine.getScale()).toMatchObject({ value: 1, scale: 1, percentage: 100 })
    expect(scaleEvents).toEqual([1, 1.1, 1])
    await engine.cancelLoad()
    expect(mocks.viewerSetDocument).toHaveBeenLastCalledWith(null)
    expect(mocks.linkSetDocument).toHaveBeenLastCalledWith(null)
    expect(engine.getSnapshot().status).toBe('idle')
    await engine.destroy()
  })

  it('snapshots URL headers and isolates document event containers', async () => {
    mocks.getDocument.mockReturnValue(createResolvedTask(createDocument('isolated')))
    const engine = createPdfViewerEngine({ workerSrc: '/pdf.worker.mjs' })
    const observedFingerprints: (string | null)[][] = []
    engine.subscribe((event) => {
      if (event.type !== 'documentLoaded') return
      const fingerprints = event.document.fingerprints as (string | null)[]
      fingerprints.push('listener-change')
      observedFingerprints.push(fingerprints)
    })
    const headers = { Authorization: 'original' }
    const loadPromise = engine.load({ url: '/document.pdf', range: false, headers })
    headers.Authorization = 'changed'
    const handle = await loadPromise
    expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      httpHeaders: { Authorization: 'original' }
    }))
    expect(observedFingerprints[0]).toContain('listener-change')
    expect(handle.fingerprints).toEqual(['isolated', null])
    expect(engine.getSnapshot().document?.fingerprints).toEqual(['isolated', null])
    await engine.destroy()
  })

  it('uses the bundled worker by default and rejects empty overrides', async () => {
    expect(() => createPdfViewerEngine({ workerSrc: '' })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ENVIRONMENT_UNSUPPORTED' })
    )
    const engine = createPdfViewerEngine()
    await engine.destroy()
    await expect(engine.load({ data: new Uint8Array([1]) })).rejects.toEqual(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ENGINE_DESTROYED' })
    )
  })
})
