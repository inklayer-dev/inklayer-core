/**
 * @file Public annotation-type extension entry.
 * @description Exposes instance registry and controlled Definition contracts.
 */

export { createAnnotationTypeRegistry } from './annotation-type-registry'
export { BUILT_IN_ANNOTATION_TYPE_DEFINITIONS } from './built-in-definitions'
export {
  ANNOTATION_TYPE_DEFINITION_API_VERSION,
  type AnnotationCreationController,
  type AnnotationGeometryKind,
  type AnnotationScene,
  type AnnotationSceneEllipse,
  type AnnotationSceneFill,
  type AnnotationSceneGroup,
  type AnnotationSceneImage,
  type AnnotationSceneLine,
  type AnnotationSceneNode,
  type AnnotationScenePath,
  type AnnotationSceneRectangle,
  type AnnotationSceneStroke,
  type AnnotationSceneText,
  type AnnotationTypeAppearanceDefinition,
  type AnnotationTypeAvailability,
  type AnnotationTypeCapabilities,
  type AnnotationTypeCreationDefinition,
  type AnnotationTypeCreationInput,
  type AnnotationTypeCreationResult,
  type AnnotationTypeDataCodec,
  type AnnotationTypeDefinition,
  type AnnotationTypeInteractionDefinition,
  type AnnotationTypePdfDefinition,
  type AnnotationTypeRegistry,
  type AnnotationTypeRegistryEvent,
  type AnnotationTypeRendererDefinition,
  type CoreAnnotationTypeRendererDefinition,
  type AnnotationTypeTransformInput
} from './contracts'
