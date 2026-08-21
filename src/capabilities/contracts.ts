/**
 * @file Instance Capability and Composition Root contracts.
 * @description Defines pre-engine providers, ready effects, service inspection,
 * and the framework-independent composed InkLayer instance.
 */

import type { AnnotationEngine, AnnotationEngineOptions } from '../annotation/annotation-engine'
import type { InkLayerDisposer, InkLayerLifecycleScope } from '../lifecycle/lifecycle-scope'
import type { PdfPageFlowController, PdfPageFlowOptions } from '../page-flow'
import type { PdfDocumentHandle, PdfSource, PdfViewerEngine, PdfViewerEngineOptions } from '../viewer/types'
import type {
  AnnotationTypeDefinition,
  AnnotationTypeRegistry
} from '../annotation-types/contracts'
import type {
  InkLayerCapabilityServiceKey,
  InkLayerCapabilityServiceMap
} from './service-map'

/** Engine facades available after successful Composition Root initialization. */
export interface InkLayerReadyContext {
  /** Composed Viewer Engine. */
  readonly viewer: PdfViewerEngine
  /** Composed Annotation Engine. */
  readonly annotations: AnnotationEngine
  /** Instance Annotation Type Registry shared by extensions and the engine. */
  readonly annotationTypes: AnnotationTypeRegistry
  /** Returns the current document-scoped Page Flow, if mounted. */
  getPageFlow(): PdfPageFlowController | null
}

/** Effect installed only after Viewer and Annotation engines are ready. */
export type InkLayerReadyEffect = (
  context: InkLayerReadyContext
) => void | InkLayerDisposer | Promise<void | InkLayerDisposer>

/** Pre-engine, instance-owned context supplied to one Capability. */
export interface InkLayerCapabilityContext {
  /** Application root associated with the composed instance. */
  readonly root: HTMLElement
  /** Child scope owning this Capability's provider resources. */
  readonly lifecycle: InkLayerLifecycleScope
  /** Registry available during setup for owned custom Definition registration. */
  readonly annotationTypes: AnnotationTypeRegistry
  /** Registers one unique single-provider service. */
  provide<K extends InkLayerCapabilityServiceKey>(
    key: K,
    value: InkLayerCapabilityServiceMap[K]
  ): InkLayerDisposer
  provide<T>(key: string, value: T): InkLayerDisposer
  /** Reads a service installed by an earlier Capability. */
  get<K extends InkLayerCapabilityServiceKey>(key: K): InkLayerCapabilityServiceMap[K] | undefined
  get<T>(key: string): T | undefined
  /** Registers one ordered post-engine effect during setup. */
  onReady(effect: InkLayerReadyEffect): void
}

/** Instance-scoped environment or optional product contribution. */
export interface InkLayerCapability {
  /** Unique stable identifier within one composed instance. */
  readonly id: string
  /** Installs pre-engine providers and schedules optional ready effects. */
  setup(context: InkLayerCapabilityContext):
    | void
    | InkLayerDisposer
    | Promise<void | InkLayerDisposer>
}

/** Read-only inspection surface for installed Capabilities and services. */
export interface InkLayerCapabilityRegistry {
  /** Returns installed Capability IDs in setup order. */
  list(): readonly string[]
  /** Returns whether one Capability ID is installed. */
  has(id: string): boolean
  /** Reads one currently provided service. */
  get<K extends InkLayerCapabilityServiceKey>(key: K): InkLayerCapabilityServiceMap[K] | undefined
  get<T>(key: string): T | undefined
}

/** Annotation options whose root is supplied by the Composition Root. */
export type InkLayerAnnotationOptions = Omit<AnnotationEngineOptions, 'root' | 'annotationTypes'>

/** Page Flow options whose engines are supplied by the Composition Root. */
export type InkLayerPageFlowOptions = Omit<PdfPageFlowOptions, 'viewer' | 'annotations'>

/** Construction options for one composed InkLayer instance. */
export interface InkLayerOptions {
  /** DOM root owning annotation state and instance metadata. */
  root: HTMLElement
  /** Optional low-level Viewer options. */
  viewer?: PdfViewerEngineOptions
  /** Optional Annotation Engine options excluding the owned root. */
  annotation?: InkLayerAnnotationOptions
  /** Optional document-scoped continuous Page Flow configuration. */
  pageFlow?: false | InkLayerPageFlowOptions
  /** Ordered instance Capabilities installed before engines. */
  capabilities?: readonly InkLayerCapability[]
  /** Ordered custom Definitions registered after Capability setup. */
  annotationTypes?: readonly AnnotationTypeDefinition[]
}

/** Recommended composed framework-independent InkLayer instance. */
export interface InkLayerInstance extends InkLayerReadyContext {
  /** Read-only Capability and service inspection. */
  readonly capabilities: InkLayerCapabilityRegistry
  /** Loads or replaces a document and mounts configured Page Flow afterward. */
  load(source: PdfSource): Promise<PdfDocumentHandle>
  /** Cancels loading and releases the current document Page Flow. */
  cancelLoad(): Promise<void>
  /** Aborts work and releases the complete instance in dependency order. */
  destroy(): Promise<void>
}
