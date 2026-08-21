/**
 * @file Public Capability and Composition Root entry.
 * @description Exposes instance composition and framework-neutral extension
 * contracts without exposing lifecycle, PDF.js, or Konva implementation objects.
 */

export { createInkLayer } from './composition-root'
export {
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
} from './ports'
export type {
  AnnotationRepositoryCapabilityOptions,
  InkLayerCapabilityServiceKey,
  InkLayerCapabilityServiceMap,
  InkLayerPortCapabilityOptions
} from './ports'
export type {
  InkLayerDisposer,
  InkLayerLifecycleScope
} from '../lifecycle/lifecycle-scope'
export type {
  InkLayerAnnotationOptions,
  InkLayerCapability,
  InkLayerCapabilityContext,
  InkLayerCapabilityRegistry,
  InkLayerInstance,
  InkLayerOptions,
  InkLayerPageFlowOptions,
  InkLayerReadyContext,
  InkLayerReadyEffect
} from './contracts'
