/**
 * @file Composition Root and Capability integration tests.
 * @description Verifies two-phase Capability activation, service isolation,
 * rollback, document Page Flow replacement, and deterministic final teardown.
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InkLayerCapabilityContext } from '../../../src/capabilities/contracts'
import { createInkLayer } from '../../../src/capabilities/composition-root'
import {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  createAnnotationRepositoryCapability,
  createClockCapability,
  createDownloadCapability,
  createFetchCapability,
  createIdGeneratorCapability,
  createLoggerCapability,
  createPrintCapability,
  createTextInputCapability,
  createThumbnailSurfaceCapability
} from '../../../src/capabilities/ports'
import type { InkLayerError } from '../../../src/domain/errors'
import { createMemoryAnnotationRepository } from '../../../src/repository/memory-annotation-repository'
import { createTestAnnotationTypeDefinition } from '../../helpers/annotation-type'

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  createPageFlow: vi.fn()
}))

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
    PDFDataRangeTransport: class MockRangeTransport {
      /** Matches the PDF.js transport cleanup surface used by Viewer destroy. */
      public abort(): void {}
    },
    getDocument: mocks.getDocument
  }
}

vi.mock('pdfjs-dist', createPdfJsMock)
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', createPdfJsMock)
vi.mock('../../../src/page-flow', () => ({
  createPdfPageFlow: mocks.createPageFlow
}))

describe('InkLayer Composition Root', () => {
  beforeEach(() => {
    mocks.getDocument.mockReset()
    mocks.createPageFlow.mockReset()
  })

  it('installs providers before engines and ready effects afterward', async () => {
    const order: string[] = []
    const root = createRoot()
    const instance = await createInkLayer({
      root,
      annotation: deterministicAnnotationOptions('first'),
      capabilities: [
        {
          id: 'logger-provider',
          /** Provides one service and one post-engine observer. */
          setup(context) {
            order.push('provider:setup')
            context.provide('answer', 42)
            context.onReady((ready) => {
              order.push(`provider:ready:${ready.getPageFlow() === null}`)
              return () => { order.push('provider:ready:dispose') }
            })
            return () => { order.push('provider:dispose') }
          }
        },
        {
          id: 'consumer',
          /** Reads the earlier provider during ordered setup. */
          setup(context) {
            order.push(`consumer:${context.get<number>('answer')}`)
          }
        }
      ]
    })

    expect(instance.capabilities.list()).toEqual(['logger-provider', 'consumer'])
    expect(instance.capabilities.has(' logger-provider ')).toBe(true)
    expect(instance.capabilities.get<number>(' answer ')).toBe(42)
    expect(order).toEqual([
      'provider:setup',
      'consumer:42',
      'provider:ready:true'
    ])

    await instance.destroy()
    expect(order.slice(-2)).toEqual(['provider:ready:dispose', 'provider:dispose'])
    expect(instance.capabilities.get('answer')).toBeUndefined()
  })

  it('rejects duplicate Capability IDs before any setup runs', async () => {
    const setup = vi.fn()
    const failure = await captureInkLayerError(createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('duplicate'),
      capabilities: [
        { id: 'same', setup },
        { id: 'same', setup }
      ]
    }))

    expect(failure.code).toBe('CAPABILITY_DUPLICATE')
    expect(setup).not.toHaveBeenCalled()
  })

  it('rolls back providers after service conflicts and setup failures', async () => {
    const cleanup = vi.fn()
    const failure = await captureInkLayerError(createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('conflict'),
      capabilities: [
        {
          id: 'first',
          /** Claims the service key and exposes cleanup evidence. */
          setup(context) {
            context.provide('repository', { id: 'first' })
            return cleanup
          }
        },
        {
          id: 'second',
          /** Attempts to claim the already-owned service key. */
          setup(context) {
            context.provide('repository', { id: 'second' })
          }
        }
      ]
    }))

    expect(failure.code).toBe('CAPABILITY_SERVICE_CONFLICT')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('rolls back the complete root when a ready effect fails', async () => {
    const providerCleanup = vi.fn()
    let readyContext: InkLayerCapabilityContext | undefined
    const root = createRoot()
    const failure = await captureInkLayerError(createInkLayer({
      root,
      annotation: deterministicAnnotationOptions('ready-failure'),
      capabilities: [{
        id: 'failure',
        /** Registers a deliberately failing ready effect. */
        setup(context) {
          readyContext = context
          context.onReady(() => { throw new Error('ready failed') })
          return providerCleanup
        }
      }]
    }))

    expect(failure.code).toBe('CAPABILITY_SETUP_FAILED')
    expect(providerCleanup).toHaveBeenCalledTimes(1)
    expect(root.dataset['inklayerInstance']).toBeUndefined()
    expect(() => readyContext?.provide('late', true)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'CAPABILITY_SETUP_FAILED' })
    )
  })

  it('isolates service registries between simultaneous instances', async () => {
    const first = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('one'),
      capabilities: [{ id: 'value', setup: context => { context.provide('value', 1) } }]
    })
    const second = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('two'),
      capabilities: [{ id: 'value', setup: context => { context.provide('value', 2) } }]
    })

    expect(first.capabilities.get('value')).toBe(1)
    expect(second.capabilities.get('value')).toBe(2)
    await Promise.all([first.destroy(), second.destroy()])
  })

  it('composes one shared instance Annotation Type Registry before engines', async () => {
    const fromCapability = createTestAnnotationTypeDefinition('custom:test/capability')
    const configured = createTestAnnotationTypeDefinition('custom:test/configured')
    let capabilityRegistry: InkLayerCapabilityContext['annotationTypes'] | undefined
    const instance = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('annotation-types'),
      capabilities: [{
        id: 'custom-definition',
        /** Registers one Capability-owned custom Definition. */
        setup(context) {
          capabilityRegistry = context.annotationTypes
          return context.annotationTypes.register(fromCapability)
        }
      }],
      annotationTypes: [configured]
    })

    expect(capabilityRegistry).toBe(instance.annotationTypes)
    expect(instance.annotations.annotationTypes).toBe(instance.annotationTypes)
    expect(instance.annotationTypes.list()).toEqual(expect.arrayContaining([
      'rectangle', 'custom:test/capability', 'custom:test/configured'
    ]))
    await instance.destroy()
    expect(() => instance.annotationTypes.list()).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ENGINE_DESTROYED' })
    )
  })

  it('routes every existing Port through typed instance Capabilities', async () => {
    const page = createRenderablePage()
    mocks.getDocument.mockReturnValueOnce(createLoadingTask({
      ...createDocument('capability-ports'),
      getPage: vi.fn(async () => page)
    } as unknown as PDFDocumentProxy))
    const repository = createMemoryAnnotationRepository()
    const logger = { warn: vi.fn(), error: vi.fn() }
    const textInput = { requestText: vi.fn(async () => ({ value: 'Capability text' })) }
    const print = { print: vi.fn(async () => undefined) }
    const download = { download: vi.fn() }
    const clock = { now: vi.fn(() => '2026-08-14T10:00:00.000Z') }
    let id = 0
    const idGenerator = { next: vi.fn(() => `capability-${id += 1}`) }
    const thumbnailRelease = vi.fn()
    const thumbnailSurface = {
      create: vi.fn(() => ({
        canvas: {} as HTMLCanvasElement,
        context: {} as CanvasRenderingContext2D,
        encode: async () => new Blob([new Uint8Array([3])], { type: 'image/png' }),
        release: thumbnailRelease
      }))
    }
    const fetchProvider = vi.fn() as unknown as typeof globalThis.fetch
    const instance = await createInkLayer({
      root: createRoot(),
      annotation: { currentUser: { id: 'capability-user', name: 'Capability User' } },
      capabilities: [
        createLoggerCapability(logger),
        createTextInputCapability(textInput),
        createAnnotationRepositoryCapability(repository),
        createPrintCapability(print),
        createDownloadCapability(download),
        createClockCapability(clock),
        createIdGeneratorCapability(idGenerator),
        createThumbnailSurfaceCapability(thumbnailSurface),
        createFetchCapability(fetchProvider)
      ]
    })

    expect(instance.annotations.repository).toBe(repository)
    expect(instance.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.print)).toBe(print)
    expect(instance.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.download)).toBe(download)
    expect(instance.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.thumbnailSurface))
      .toBe(thumbnailSurface)
    expect(instance.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.fetch)).toBe(fetchProvider)

    await instance.load({ data: new Uint8Array([1]) })
    const thumbnail = await instance.viewer.renderThumbnail({ pageIndex: 0, pixelRatio: 1 })
    expect(thumbnail.blob.type).toBe('image/png')
    expect(thumbnailSurface.create).toHaveBeenCalledTimes(1)
    expect(thumbnailRelease).toHaveBeenCalledTimes(1)

    const listenerFailure = new Error('listener failed')
    instance.annotations.subscribe(() => { throw listenerFailure })
    const created = instance.annotations.createAnnotation({
      type: 'rectangle', pageIndex: 0,
      bounds: { x: 1, y: 2, width: 30, height: 40 }
    })
    expect(created).toMatchObject({
      id: 'capability-2',
      createdAt: '2026-08-14T10:00:00.000Z'
    })
    expect(logger.error).toHaveBeenCalledWith(
      'InkLayer Annotation Engine listener failed.', listenerFailure
    )
    const freeText = await instance.annotations.requestFreeText(
      0, { x: 5, y: 6, width: 70, height: 20 }
    )
    expect(textInput.requestText).toHaveBeenCalledTimes(1)
    expect(freeText?.content?.text).toBe('Capability text')

    await instance.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.print)?.print({
      content: new Uint8Array([1])
    })
    instance.capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.download)?.download({
      content: new Uint8Array([2]), filename: 'annotations.pdf', mimeType: 'application/pdf'
    })
    expect(print.print).toHaveBeenCalledTimes(1)
    expect(download.download).toHaveBeenCalledTimes(1)

    await instance.destroy()
    expect(repository.getAll()).toHaveLength(2)
  })

  it('keeps explicit low-level Annotation options ahead of Capability providers', async () => {
    const capabilityRepository = createMemoryAnnotationRepository()
    const explicitRepository = createMemoryAnnotationRepository()
    const capabilityTextInput = { requestText: vi.fn(async () => ({ value: 'capability' })) }
    const explicitTextInput = { requestText: vi.fn(async () => ({ value: 'explicit' })) }
    let capabilityId = 0
    let explicitId = 0
    const instance = await createInkLayer({
      root: createRoot(),
      capabilities: [
        createAnnotationRepositoryCapability(capabilityRepository),
        createTextInputCapability(capabilityTextInput),
        createClockCapability({ now: () => '2026-01-01T00:00:00.000Z' }),
        createIdGeneratorCapability({ next: () => `cap-${capabilityId += 1}` }),
        createLoggerCapability({ warn: vi.fn(), error: vi.fn() })
      ],
      annotation: {
        currentUser: { id: 'explicit', name: 'Explicit' },
        repository: explicitRepository,
        textInputProvider: explicitTextInput,
        clock: { now: () => '2026-08-14T11:00:00.000Z' },
        idGenerator: { next: () => `explicit-${explicitId += 1}` },
        logger: { warn: vi.fn(), error: vi.fn() }
      }
    })

    const created = await instance.annotations.requestFreeText(
      0, { x: 1, y: 1, width: 50, height: 20 }
    )
    expect(created).toMatchObject({
      id: 'explicit-2',
      createdAt: '2026-08-14T11:00:00.000Z',
      content: { text: 'explicit' }
    })
    expect(instance.annotations.repository).toBe(explicitRepository)
    expect(explicitRepository.getAll()).toHaveLength(1)
    expect(capabilityRepository.getAll()).toHaveLength(0)
    expect(explicitTextInput.requestText).toHaveBeenCalledTimes(1)
    expect(capabilityTextInput.requestText).not.toHaveBeenCalled()
    expect(capabilityId).toBe(0)
    await instance.destroy()
  })

  it('keeps explicit Viewer Fetch and thumbnail options ahead of Capabilities', async () => {
    const page = createRenderablePage()
    mocks.getDocument.mockReturnValueOnce(createLoadingTask({
      ...createDocument('viewer-precedence'),
      getPage: vi.fn(async () => page)
    } as unknown as PDFDocumentProxy))
    const capabilityFetch = createRangeFetch()
    const explicitFetch = createRangeFetch()
    const capabilitySurface = createThumbnailProvider()
    const explicitSurface = createThumbnailProvider()
    const instance = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('viewer-precedence'),
      viewer: {
        fetch: explicitFetch,
        thumbnailSurfaceProvider: explicitSurface.provider
      },
      capabilities: [
        createFetchCapability(capabilityFetch),
        createThumbnailSurfaceCapability(capabilitySurface.provider)
      ]
    })

    await instance.load({ url: 'https://example.test/document.pdf', range: true })
    await instance.viewer.renderThumbnail({ pageIndex: 0, pixelRatio: 1 })
    expect(explicitFetch).toHaveBeenCalledTimes(2)
    expect(capabilityFetch).not.toHaveBeenCalled()
    expect(explicitSurface.create).toHaveBeenCalledTimes(1)
    expect(capabilitySurface.create).not.toHaveBeenCalled()
    await instance.destroy()
  })

  it('destroys only a Repository explicitly transferred to its Capability', async () => {
    const borrowed = createMemoryAnnotationRepository()
    const borrowedDestroy = vi.spyOn(borrowed, 'destroy')
    const borrowedInstance = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('borrowed'),
      capabilities: [createAnnotationRepositoryCapability(borrowed)]
    })
    await borrowedInstance.destroy()
    expect(borrowedDestroy).not.toHaveBeenCalled()

    const owned = createMemoryAnnotationRepository()
    const ownedDestroy = vi.spyOn(owned, 'destroy')
    const ownedInstance = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('owned'),
      capabilities: [createAnnotationRepositoryCapability(owned, { ownership: 'owned' })]
    })
    await ownedInstance.destroy()
    expect(ownedDestroy).toHaveBeenCalledTimes(1)
  })

  it('creates Page Flow after load and replaces its document scope first', async () => {
    const order: string[] = []
    const firstTask = createLoadingTask(createDocument('first'), () => { order.push('task:first:destroy') })
    const secondTask = createLoadingTask(createDocument('second'), () => { order.push('task:second:destroy') })
    mocks.getDocument.mockReturnValueOnce(firstTask).mockReturnValueOnce(secondTask)
    const firstFlow = { destroy: vi.fn(() => { order.push('flow:first:destroy') }) }
    const secondFlow = { destroy: vi.fn(() => { order.push('flow:second:destroy') }) }
    mocks.createPageFlow
      .mockImplementationOnce(async () => firstFlow)
      .mockImplementationOnce(async () => secondFlow)
    const instance = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('flow'),
      pageFlow: { container: createRoot() as unknown as HTMLDivElement }
    })

    await instance.load({ data: new Uint8Array([1]) })
    expect(instance.getPageFlow()).toBe(firstFlow)
    await instance.load({ data: new Uint8Array([2]) })
    expect(order.indexOf('flow:first:destroy')).toBeLessThan(order.indexOf('task:first:destroy'))
    expect(instance.getPageFlow()).toBe(secondFlow)

    await instance.destroy()
    expect(secondFlow.destroy).toHaveBeenCalledTimes(1)
    expect(secondTask.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps a ready document but no Page Flow after flow initialization fails', async () => {
    const task = createLoadingTask(createDocument('flow-failure'))
    mocks.getDocument.mockReturnValueOnce(task)
    mocks.createPageFlow.mockRejectedValueOnce(new Error('flow failed'))
    const instance = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('flow-failure'),
      pageFlow: { container: createRoot() as unknown as HTMLDivElement }
    })

    await expect(instance.load({ data: new Uint8Array([1]) })).rejects.toThrow('flow failed')
    expect(instance.viewer.getSnapshot().status).toBe('ready')
    expect(instance.getPageFlow()).toBeNull()
    await instance.destroy()
  })

  it('destroys a stale Page Flow that resolves after document replacement', async () => {
    const firstTask = createLoadingTask(createDocument('stale-first'))
    const secondTask = createLoadingTask(createDocument('stale-second'))
    mocks.getDocument.mockReturnValueOnce(firstTask).mockReturnValueOnce(secondTask)
    const staleFlow = { destroy: vi.fn() }
    const currentFlow = { destroy: vi.fn() }
    let resolveStaleFlow: (flow: { destroy(): void }) => void = () => undefined
    const deferredFlow = new Promise<{ destroy(): void }>((resolve) => {
      resolveStaleFlow = resolve
    })
    mocks.createPageFlow
      .mockImplementationOnce(async () => deferredFlow)
      .mockImplementationOnce(async () => currentFlow)
    const instance = await createInkLayer({
      root: createRoot(),
      annotation: deterministicAnnotationOptions('stale-flow'),
      pageFlow: { container: createRoot() as unknown as HTMLDivElement }
    })

    const firstLoad = instance.load({ data: new Uint8Array([1]) })
    await vi.waitFor(() => expect(mocks.createPageFlow).toHaveBeenCalledTimes(1))
    const secondLoad = instance.load({ data: new Uint8Array([2]) })
    await secondLoad
    resolveStaleFlow(staleFlow)

    await expect(firstLoad).rejects.toMatchObject({ code: 'LIFECYCLE_INACTIVE' })
    expect(staleFlow.destroy).toHaveBeenCalledTimes(1)
    expect(instance.getPageFlow()).toBe(currentFlow)
    await instance.destroy()
  })
})

/** Creates a minimal root accepted by the Annotation Engine. */
function createRoot(): HTMLElement & { classNames: Set<string> } {
  const classNames = new Set<string>()
  return {
    classNames,
    dataset: {},
    classList: {
      add: (...tokens: string[]) => tokens.forEach(token => classNames.add(token)),
      remove: (...tokens: string[]) => tokens.forEach(token => classNames.delete(token))
    }
  } as unknown as HTMLElement & { classNames: Set<string> }
}

/** Creates deterministic Annotation options for one test instance. */
function deterministicAnnotationOptions(prefix: string) {
  let sequence = 0
  return {
    currentUser: { id: prefix, name: prefix },
    idGenerator: { next: () => `${prefix}-${sequence += 1}` },
    clock: { now: () => '2026-08-14T00:00:00.000Z' },
    logger: { warn: vi.fn(), error: vi.fn() }
  }
}

/** Creates one minimal ready PDF document. */
function createDocument(id: string): PDFDocumentProxy {
  return {
    numPages: 1,
    fingerprints: [id, null],
    getPermissions: vi.fn(async () => null)
  } as unknown as PDFDocumentProxy
}

/** Creates one immediately resolving PDF.js loading task. */
function createLoadingTask(
  document: PDFDocumentProxy,
  onDestroy: () => void = () => undefined
): PDFDocumentLoadingTask {
  return {
    promise: Promise.resolve(document),
    destroy: vi.fn(async () => { onDestroy() })
  } as unknown as PDFDocumentLoadingTask
}

/** Creates the minimal PDF page surface required by thumbnail rendering. */
function createRenderablePage() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 200 * scale,
      height: 100 * scale
    }),
    render: vi.fn(() => ({ promise: Promise.resolve() }))
  }
}

/** Creates a complete successful three-byte Range Fetch implementation. */
function createRangeFetch(): typeof globalThis.fetch {
  return vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
    if (init?.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '3', 'accept-ranges': 'bytes' }
      })
    }
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 206,
      headers: { 'content-range': 'bytes 0-2/3' }
    })
  }) as typeof globalThis.fetch
}

/** Creates a detached thumbnail provider with observable allocation. */
function createThumbnailProvider() {
  const create = vi.fn(() => ({
    canvas: {} as HTMLCanvasElement,
    context: {} as CanvasRenderingContext2D,
    encode: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
    release: vi.fn()
  }))
  return { create, provider: { create } }
}

/** Captures one expected structured Composition Root rejection. */
async function captureInkLayerError(operation: Promise<unknown>): Promise<InkLayerError> {
  try {
    await operation
  } catch (cause) {
    return cause as InkLayerError
  }
  throw new Error('Expected Composition Root operation to reject.')
}
