/**
 * @file Existing Port providers exposed as instance Capabilities.
 * @description Defines stable typed service keys and small provider factories
 * without replacing the public Port interfaces they carry.
 */

import type { Clock } from '../ports/clock'
import type { DownloadProvider } from '../ports/download'
import type { IdGenerator } from '../ports/id-generator'
import type { Logger } from '../ports/logger'
import type { PrintProvider } from '../ports/print'
import type { TextInputProvider } from '../ports/text-input'
import type { AnnotationRepository } from '../repository/annotation-repository'
import type { PdfThumbnailSurfaceProvider } from '../viewer/types'
import type { InkLayerCapability, InkLayerCapabilityContext } from './contracts'
import {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  type InkLayerCapabilityServiceKey,
  type InkLayerCapabilityServiceMap
} from './service-map'

export { INKLAYER_CAPABILITY_SERVICE_KEYS } from './service-map'
export type {
  InkLayerCapabilityServiceKey,
  InkLayerCapabilityServiceMap
} from './service-map'

/** Shared options for a single Port provider Capability. */
export interface InkLayerPortCapabilityOptions {
  /** Capability ID; defaults to the stable service key. */
  id?: string
}

/** Ownership accepted only by the Repository provider. */
export interface AnnotationRepositoryCapabilityOptions extends InkLayerPortCapabilityOptions {
  /** Borrow by default, or transfer Repository destruction to this instance. */
  ownership?: 'borrowed' | 'owned'
}

/** Creates an instance Logger provider. */
export function createLoggerCapability(
  logger: Logger,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  assertMethod(logger, 'warn', 'Logger')
  assertMethod(logger, 'error', 'Logger')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.logger, logger, options)
}

/** Creates an instance Text Input provider. */
export function createTextInputCapability(
  provider: TextInputProvider,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  assertMethod(provider, 'requestText', 'TextInputProvider')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.textInput, provider, options)
}

/** Creates an instance Annotation Repository provider with explicit ownership. */
export function createAnnotationRepositoryCapability(
  repository: AnnotationRepository,
  options: AnnotationRepositoryCapabilityOptions = {}
): InkLayerCapability {
  assertRepository(repository)
  if (options.ownership !== undefined
    && options.ownership !== 'borrowed' && options.ownership !== 'owned') {
    throw new TypeError('Repository Capability ownership must be borrowed or owned.')
  }
  const key = INKLAYER_CAPABILITY_SERVICE_KEYS.repository
  const ownership = options.ownership ?? 'borrowed'
  return Object.freeze({
    id: options.id ?? key,
    /** Provides the Repository and optionally binds its destruction to this scope. */
    setup(context: InkLayerCapabilityContext) {
      context.provide(key, repository)
      if (ownership === 'owned') {
        context.lifecycle.add(() => repository.destroy(), 'owned-repository')
      }
    }
  })
}

/** Creates an instance Print provider. */
export function createPrintCapability(
  provider: PrintProvider,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  assertMethod(provider, 'print', 'PrintProvider')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.print, provider, options)
}

/** Creates an instance Download provider. */
export function createDownloadCapability(
  provider: DownloadProvider,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  assertMethod(provider, 'download', 'DownloadProvider')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.download, provider, options)
}

/** Creates an instance Clock provider. */
export function createClockCapability(
  clock: Clock,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  assertMethod(clock, 'now', 'Clock')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.clock, clock, options)
}

/** Creates an instance identifier generator provider. */
export function createIdGeneratorCapability(
  generator: IdGenerator,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  assertMethod(generator, 'next', 'IdGenerator')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.idGenerator, generator, options)
}

/** Creates an instance thumbnail surface provider. */
export function createThumbnailSurfaceCapability(
  provider: PdfThumbnailSurfaceProvider,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  assertMethod(provider, 'create', 'PdfThumbnailSurfaceProvider')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.thumbnailSurface, provider, options)
}

/** Creates an instance Fetch provider used by Viewer Range loading. */
export function createFetchCapability(
  fetchImplementation: typeof globalThis.fetch,
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  if (typeof fetchImplementation !== 'function') throw new TypeError('Fetch provider must be a function.')
  return createPortCapability(INKLAYER_CAPABILITY_SERVICE_KEYS.fetch, fetchImplementation, options)
}

/** Builds one immutable Capability that claims exactly one Port key. */
function createPortCapability<K extends InkLayerCapabilityServiceKey>(
  key: K,
  value: InkLayerCapabilityServiceMap[K],
  options?: InkLayerPortCapabilityOptions
): InkLayerCapability {
  return Object.freeze({
    id: options?.id ?? key,
    /** Claims the stable service key during pre-engine Capability setup. */
    setup(context: InkLayerCapabilityContext) {
      context.provide(key, value)
    }
  })
}

/** Rejects malformed JavaScript providers before instance setup begins. */
function assertMethod(value: unknown, method: string, name: string): void {
  if (typeof value !== 'object' || value === null
    || typeof (value as Record<string, unknown>)[method] !== 'function') {
    throw new TypeError(`${name} must implement ${method}().`)
  }
}

/** Validates the complete mutable Repository surface at the provider boundary. */
function assertRepository(repository: AnnotationRepository): void {
  for (const method of [
    'getAll', 'getById', 'getByPage', 'add', 'update', 'remove', 'replaceAll',
    'getSelection', 'setSelection', 'subscribe', 'destroy'
  ]) assertMethod(repository, method, 'AnnotationRepository')
}
