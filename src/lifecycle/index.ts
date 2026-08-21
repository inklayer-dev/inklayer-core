/**
 * @file Lifecycle module entry.
 * @description Exposes deterministic instance-owned effect and setup helpers to
 * upcoming Composition Root and Capability modules.
 */

export {
  createInkLayerLifecycleScope,
  installInkLayerLifecycleSetup,
  type InkLayerDisposer,
  type InkLayerLifecycleScope,
  type InkLayerLifecycleSetup
} from './lifecycle-scope'
