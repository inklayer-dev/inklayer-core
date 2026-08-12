/**
 * @file Public Annotation Engine package entry.
 * @description Exposes the canonical facade, tools, events, page attachment,
 * ports, and snapshot validator without exposing internal Painter classes.
 */

export {
  createAnnotationEngine,
  type AnnotationEngine,
  type AnnotationEngineOptions,
  type AnnotationSnapshotStrategy,
  type CreateAnnotationInput,
  type TransformAnnotationInput
} from './annotation-engine'
export type {
  AnnotationEngineEvent,
  AnnotationEngineListener,
  AnnotationEngineWarning,
  AnnotationTextSelection
} from './events'
export {
  ANNOTATION_TOOL_DEFINITIONS,
  type AnnotationTool,
  type AnnotationToolDefinition,
  type AnnotationTransformMode
} from './tools'
export type {
  AnnotationAuthorLabelVisibility,
  AnnotationPageAttachment
} from './internal/painter/konva-painter'
export {
  parseAndValidateKonvaSnapshot,
  type KonvaAttributeValue,
  type SnapshotValidationOptions,
  type ValidatedKonvaNode,
  type ValidatedKonvaSnapshot
} from '../renderer/konva/snapshot'
export type { Clock } from '../ports/clock'
export type { IdGenerator } from '../ports/id-generator'
export type { Logger } from '../ports/logger'
export type { TextInputProvider, TextInputRequest, TextInputResult } from '../ports/text-input'
export { createBrowserTextInputProvider } from '../platform/browser/text-input'
export type {
  AnnotationAppearance,
  AnnotationAppearanceInput,
  AnnotationFillAppearance,
  AnnotationFillAppearanceInput,
  AnnotationStrokeAppearance,
  AnnotationStrokeAppearanceInput,
  AnnotationTextAppearance,
  AnnotationTextAppearanceInput
} from '../domain/annotation'
export {
  getAnnotationAppearanceCapabilities,
  getDefaultAnnotationAppearance,
  mergeAnnotationAppearance,
  resolveAnnotationAppearance,
  validateResolvedAppearance,
  type AnnotationAppearanceCapabilities
} from '../domain/appearance'
