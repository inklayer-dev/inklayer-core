/**
 * @file InkLayer Composition Root.
 * @description Owns Capability phases, Viewer, Annotation, document-scoped Page
 * Flow, replacement loading, initialization rollback, and final teardown.
 */

import { createAnnotationEngine, type AnnotationEngine } from '../annotation/annotation-engine'
import { InkLayerError } from '../domain/errors'
import {
  createInkLayerLifecycleScope,
  type InkLayerLifecycleScope
} from '../lifecycle/lifecycle-scope'
import { createPdfPageFlow, type PdfPageFlowController } from '../page-flow'
import { createPdfViewerEngine } from '../viewer/pdf-viewer-engine'
import type { PdfDocumentHandle, PdfSource, PdfViewerEngine } from '../viewer/types'
import { InkLayerCapabilityRegistryImpl } from './capability-registry'
import type { InkLayerInstance, InkLayerOptions } from './contracts'
import { createAnnotationTypeRegistry } from '../annotation-types/annotation-type-registry'
import type { AnnotationTypeRegistry } from '../annotation-types/contracts'
import { INKLAYER_CAPABILITY_SERVICE_KEYS } from './ports'

/** Creates one completely owned, framework-independent InkLayer instance. */
export async function createInkLayer(options: InkLayerOptions): Promise<InkLayerInstance> {
  const lifecycle = createInkLayerLifecycleScope('inklayer')
  try {
    const annotationTypes = createAnnotationTypeRegistry()
    lifecycle.add(() => annotationTypes.destroy(), 'annotation-types')
    const providerScope = lifecycle.child('providers')
    const capabilities = new InkLayerCapabilityRegistryImpl(options.root, providerScope, annotationTypes)
    await capabilities.install(options.capabilities ?? [])

    const definitionScope = lifecycle.child('configured-annotation-types')
    for (const definition of options.annotationTypes ?? []) {
      definitionScope.add(annotationTypes.register(definition), `definition:${definition.type}`)
    }

    const viewerOptions = options.viewer ?? {}
    const capabilityLogger = capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.logger)
    const capabilityFetch = capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.fetch)
    const capabilityThumbnailSurface = capabilities.get(
      INKLAYER_CAPABILITY_SERVICE_KEYS.thumbnailSurface
    )
    const resolvedFetch = viewerOptions.fetch ?? capabilityFetch
    const resolvedThumbnailSurface = viewerOptions.thumbnailSurfaceProvider
      ?? capabilityThumbnailSurface
    const resolvedViewerListenerError = viewerOptions.onListenerError
      ?? (capabilityLogger === undefined
        ? undefined
        : (cause: unknown) => {
            capabilityLogger.error('InkLayer PDF Viewer listener failed.', cause)
          })
    const viewer = createPdfViewerEngine({
      ...viewerOptions,
      ...(resolvedFetch === undefined ? {} : { fetch: resolvedFetch }),
      ...(resolvedThumbnailSurface === undefined
        ? {}
        : { thumbnailSurfaceProvider: resolvedThumbnailSurface }),
      ...(resolvedViewerListenerError === undefined
        ? {}
        : { onListenerError: resolvedViewerListenerError })
    })
    lifecycle.add(() => viewer.destroy(), 'viewer')

    const annotationOptions = options.annotation ?? {}
    const capabilityRepository = capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.repository)
    const capabilityTextInput = capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.textInput)
    const capabilityClock = capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.clock)
    const capabilityIdGenerator = capabilities.get(INKLAYER_CAPABILITY_SERVICE_KEYS.idGenerator)
    const resolvedRepository = annotationOptions.repository ?? capabilityRepository
    const resolvedLogger = annotationOptions.logger ?? capabilityLogger
    const resolvedTextInput = annotationOptions.textInputProvider ?? capabilityTextInput
    const resolvedClock = annotationOptions.clock ?? capabilityClock
    const resolvedIdGenerator = annotationOptions.idGenerator ?? capabilityIdGenerator
    const annotations = createAnnotationEngine({
      ...annotationOptions,
      ...(resolvedRepository === undefined ? {} : { repository: resolvedRepository }),
      ...(resolvedLogger === undefined ? {} : { logger: resolvedLogger }),
      ...(resolvedTextInput === undefined ? {} : { textInputProvider: resolvedTextInput }),
      ...(resolvedClock === undefined ? {} : { clock: resolvedClock }),
      ...(resolvedIdGenerator === undefined ? {} : { idGenerator: resolvedIdGenerator }),
      root: options.root,
      annotationTypes
    })
    lifecycle.add(() => annotations.destroy(), 'annotations')

    const readyScope = lifecycle.child('ready-effects')
    const instance = new InkLayerInstanceImpl(
      lifecycle,
      viewer,
      annotations,
      annotationTypes,
      capabilities,
      options.pageFlow === false ? undefined : options.pageFlow
    )
    await capabilities.activateReady(instance, readyScope)
    return instance
  } catch (cause) {
    try {
      await lifecycle.dispose()
    } catch (cleanupCause) {
      throw new InkLayerError(
        'COMPOSITION_INITIALIZATION_FAILED',
        'InkLayer initialization failed and rollback reported cleanup errors.',
        {
          operation: 'createInkLayer',
          cause: new AggregateError([cause, cleanupCause], 'Composition setup and rollback failed.')
        }
      )
    }
    if (cause instanceof InkLayerError) throw cause
    throw new InkLayerError('COMPOSITION_INITIALIZATION_FAILED', 'InkLayer initialization failed.', {
      operation: 'createInkLayer', cause
    })
  }
}

/** Concrete composed instance with document-generation ownership. */
class InkLayerInstanceImpl implements InkLayerInstance {
  private documentScope: InkLayerLifecycleScope | null = null
  private currentPageFlow: PdfPageFlowController | null = null
  private generation = 0

  /** Creates a ready engine facade around already-owned dependencies. */
  public constructor(
    private readonly lifecycle: InkLayerLifecycleScope,
    public readonly viewer: PdfViewerEngine,
    public readonly annotations: AnnotationEngine,
    public readonly annotationTypes: AnnotationTypeRegistry,
    public readonly capabilities: InkLayerCapabilityRegistryImpl,
    private readonly pageFlowOptions: InkLayerOptions['pageFlow'] | undefined
  ) {}

  /** Returns the current document-scoped Page Flow. */
  public getPageFlow(): PdfPageFlowController | null {
    return this.currentPageFlow
  }

  /** Replaces the current document and mounts configured Page Flow afterward. */
  public async load(source: PdfSource): Promise<PdfDocumentHandle> {
    this.assertActive('load')
    const generation = ++this.generation
    await this.releaseDocumentScope()
    const handle = await this.viewer.load(source)
    this.assertGeneration(generation, 'load')
    if (this.pageFlowOptions !== undefined && this.pageFlowOptions !== false) {
      const scope = this.lifecycle.child(`document:${generation}`)
      this.documentScope = scope
      let pageFlow: PdfPageFlowController | null = null
      let registered = false
      try {
        pageFlow = await createPdfPageFlow({
          ...this.pageFlowOptions,
          viewer: this.viewer,
          annotations: this.annotations
        })
        scope.add(() => {
          pageFlow?.destroy()
          if (this.currentPageFlow === pageFlow) this.currentPageFlow = null
        }, 'page-flow')
        registered = true
        this.assertGeneration(generation, 'createPageFlow')
        this.currentPageFlow = pageFlow
      } catch (cause) {
        if (!registered) pageFlow?.destroy()
        await scope.dispose()
        if (this.documentScope === scope) this.documentScope = null
        throw cause
      }
    }
    return handle
  }

  /** Cancels current loading after releasing document-scoped presentation. */
  public async cancelLoad(): Promise<void> {
    this.assertActive('cancelLoad')
    this.generation += 1
    await this.releaseDocumentScope()
    await this.viewer.cancelLoad()
  }

  /** Releases the complete instance once in dependency order. */
  public async destroy(): Promise<void> {
    this.generation += 1
    await this.lifecycle.dispose()
  }

  /** Releases the current document child scope, if any. */
  private async releaseDocumentScope(): Promise<void> {
    const scope = this.documentScope
    this.documentScope = null
    this.currentPageFlow = null
    if (scope !== null) await scope.dispose()
  }

  /** Rejects work after root disposal starts. */
  private assertActive(operation: string): void {
    if (!this.lifecycle.disposed) return
    throw new InkLayerError('ENGINE_DESTROYED', 'The composed InkLayer instance is destroyed.', {
      operation: `InkLayerInstance.${operation}`
    })
  }

  /** Rejects stale document work after replacement, cancellation, or destroy. */
  private assertGeneration(generation: number, operation: string): void {
    this.assertActive(operation)
    if (generation === this.generation) return
    throw new InkLayerError('PDF_LOAD_FAILED', 'The composed document operation was superseded.', {
      operation: `InkLayerInstance.${operation}`
    })
  }
}
