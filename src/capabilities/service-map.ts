/**
 * @file Typed Capability service keys.
 * @description Associates stable instance service identifiers with the existing
 * framework-neutral Port interfaces without depending on Capability lifecycle.
 */

import type { Clock } from '../ports/clock'
import type { DownloadProvider } from '../ports/download'
import type { IdGenerator } from '../ports/id-generator'
import type { Logger } from '../ports/logger'
import type { PrintProvider } from '../ports/print'
import type { TextInputProvider } from '../ports/text-input'
import type { AnnotationRepository } from '../repository/annotation-repository'
import type { PdfThumbnailSurfaceProvider } from '../viewer/types'

/** Stable keys used to provide existing Core Ports through Capabilities. */
export const INKLAYER_CAPABILITY_SERVICE_KEYS = Object.freeze({
  logger: 'inklayer.port.logger',
  textInput: 'inklayer.port.text-input',
  repository: 'inklayer.port.annotation-repository',
  print: 'inklayer.port.print',
  download: 'inklayer.port.download',
  clock: 'inklayer.port.clock',
  idGenerator: 'inklayer.port.id-generator',
  thumbnailSurface: 'inklayer.port.thumbnail-surface',
  fetch: 'inklayer.port.fetch'
} as const)

/** Service types associated with every protected Port key. */
export interface InkLayerCapabilityServiceMap {
  /** Structured engine diagnostics. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.logger]: Logger
  /** Temporary FreeText editing environment. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.textInput]: TextInputProvider
  /** Canonical annotation persistence and selection state. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.repository]: AnnotationRepository
  /** Browser or host system print side effect. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.print]: PrintProvider
  /** Browser or host file download side effect. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.download]: DownloadProvider
  /** Deterministic annotation timestamp source. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.clock]: Clock
  /** Deterministic instance and annotation identity source. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.idGenerator]: IdGenerator
  /** Host-specific thumbnail Canvas allocation. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.thumbnailSurface]: PdfThumbnailSurfaceProvider
  /** Viewer Range network implementation. */
  [INKLAYER_CAPABILITY_SERVICE_KEYS.fetch]: typeof globalThis.fetch
}

/** Stable key accepted by the typed Capability Port helpers. */
export type InkLayerCapabilityServiceKey = keyof InkLayerCapabilityServiceMap
