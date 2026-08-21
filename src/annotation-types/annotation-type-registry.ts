/**
 * @file Instance annotation-type Definition registry.
 * @description Protects built-in identities, validates controlled external
 * Definitions, resolves payload compatibility, and owns registration cleanup.
 */

import {
  BUILT_IN_ANNOTATION_TYPES,
  cloneAnnotation,
  isBuiltInAnnotationType,
  isCustomAnnotationType,
  type Annotation,
  type AnnotationAppearance,
  type AnnotationTypeId,
  type CustomAnnotationType
} from '../domain/annotation'
import { validateAnnotationAppearance } from '../domain/appearance'
import type { AnnotationAppearanceCapabilities } from '../domain/appearance'
import { InkLayerError } from '../domain/errors'
import { parseJsonValue } from '../domain/json-value'
import {
  ANNOTATION_TYPE_DEFINITION_API_VERSION,
  type AnnotationCreationController,
  type AnnotationGeometryKind,
  type AnnotationTypeAvailability,
  type AnnotationTypeDefinition,
  type AnnotationScene,
  type AnnotationTypeRegistry,
  type AnnotationTypeRegistryEvent
} from './contracts'
import { BUILT_IN_ANNOTATION_TYPE_DEFINITIONS } from './built-in-definitions'

const GEOMETRIES = new Set<AnnotationGeometryKind>([
  'box', 'line', 'polyline', 'path', 'text-markup', 'text-box', 'point', 'image'
])
const CREATION_CONTROLLERS = new Set<AnnotationCreationController>([
  'drag-box', 'line', 'polyline', 'freehand', 'text-selection', 'point',
  'text-input', 'image-placement'
])

/** Creates one isolated registry with protected built-in identities. */
export function createAnnotationTypeRegistry(): AnnotationTypeRegistry {
  return new AnnotationTypeRegistryImpl()
}

/** Concrete instance-local custom Definition registry. */
class AnnotationTypeRegistryImpl implements AnnotationTypeRegistry {
  private readonly definitions = new Map<AnnotationTypeId, AnnotationTypeDefinition>(
    BUILT_IN_ANNOTATION_TYPES.map((type) => [type, BUILT_IN_ANNOTATION_TYPE_DEFINITIONS[type]])
  )
  private readonly listeners = new Set<(event: AnnotationTypeRegistryEvent) => void>()
  private destroyed = false

  /** Returns protected built-ins followed by custom IDs in registration order. */
  public list(): readonly AnnotationTypeId[] {
    this.assertActive('list')
    return [...this.definitions.keys()]
  }

  /** Returns whether one built-in is protected or one custom Definition exists. */
  public has(type: AnnotationTypeId): boolean {
    this.assertActive('has')
    return this.definitions.has(type)
  }

  /** Returns one protected built-in or registered custom Definition. */
  public get(type: AnnotationTypeId): AnnotationTypeDefinition | undefined {
    this.assertActive('get')
    return this.definitions.get(type)
  }

  /** Validates and publishes one external custom Definition. */
  public register(definition: AnnotationTypeDefinition): () => void {
    this.assertActive('register')
    if (typeof definition?.type === 'string' && isBuiltInAnnotationType(definition.type)) {
      throw new InkLayerError('ANNOTATION_TYPE_RESERVED', 'Built-in annotation types cannot be redefined.', {
        operation: 'registerAnnotationType'
      })
    }
    validateDefinition(definition)
    const type = definition.type
    if (this.definitions.has(definition.type)) {
      throw new InkLayerError('ANNOTATION_TYPE_DUPLICATE', 'Annotation type Definition is already registered.', {
        operation: 'registerAnnotationType'
      })
    }
    const published = freezeDefinition(definition)
    this.definitions.set(type, published)
    this.emit({ type: 'registered', annotationType: type })
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.definitions.get(type) !== published) return
      this.definitions.delete(type)
      this.emit({ type: 'unregistered', annotationType: type })
    }
  }

  /** Resolves missing Definition and unsupported payload versions explicitly. */
  public resolve(annotation: Readonly<Annotation>): AnnotationTypeAvailability {
    this.assertActive('resolve')
    const definition = this.definitions.get(annotation.type)
    if (definition === undefined) return { status: 'missing-definition' }
    if (!supportsTypeData(definition, annotation)) {
      return { status: 'unsupported-data-version', definition }
    }
    return { status: 'available', definition }
  }

  /** Invokes a compatible codec with detached frozen JSON. */
  public validate(annotation: Readonly<Annotation>): AnnotationTypeAvailability {
    const availability = this.resolve(annotation)
    if (availability.status !== 'available' || availability.definition === undefined) return availability
    const typeData = annotation.typeData
    if (typeData === undefined || availability.definition.data === undefined) return availability
    const payload = parseJsonValue(typeData.payload, 'validateAnnotationTypeData')
    deepFreeze(payload)
    try {
      availability.definition.data.validate(payload, typeData.schemaVersion)
    } catch (cause) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Annotation type data failed Definition validation.', {
        operation: 'validateAnnotationTypeData', annotationId: annotation.id,
        pageIndex: annotation.pageIndex, cause
      })
    }
    return availability
  }

  /** Returns compatible behavior or throws the stable unavailable error. */
  public require(annotation: Readonly<Annotation>, operation: string): AnnotationTypeDefinition {
    const availability = this.validate(annotation)
    if (availability.status === 'available') return availability.definition
    throw new InkLayerError('ANNOTATION_TYPE_UNAVAILABLE', 'Annotation type behavior is unavailable.', {
      operation, annotationId: annotation.id, pageIndex: annotation.pageIndex
    })
  }

  /** Invokes a compatible external renderer without exposing caller-owned data. */
  public renderControlled(annotation: Readonly<Annotation>, operation: string): AnnotationScene {
    const definition = this.require(annotation, operation)
    if (!('render' in definition.renderer)) {
      throw new InkLayerError('ANNOTATION_TYPE_UNAVAILABLE', 'Controlled rendering is unavailable.', {
        operation, annotationId: annotation.id, pageIndex: annotation.pageIndex
      })
    }
    const detached = cloneAnnotation(annotation as Annotation)
    deepFreeze(detached)
    return definition.renderer.render(detached)
  }

  /** Subscribes to registration changes. */
  public subscribe(listener: (event: AnnotationTypeRegistryEvent) => void): () => void {
    this.assertActive('subscribe')
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Clears only behavior registrations and listeners. */
  public destroy(): void {
    if (this.destroyed) return
    for (const type of [...this.definitions.keys()].reverse()) {
      if (isBuiltInAnnotationType(type)) continue
      this.definitions.delete(type)
      this.emit({ type: 'unregistered', annotationType: type })
    }
    this.definitions.clear()
    this.listeners.clear()
    this.destroyed = true
  }

  /** Publishes one detached immutable event. */
  private emit(event: AnnotationTypeRegistryEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener({ ...event })
      } catch {
        // Registry ownership must not be corrupted by an observer failure.
      }
    }
  }

  /** Rejects registry use after final destruction. */
  private assertActive(operation: string): void {
    if (!this.destroyed) return
    throw new InkLayerError('ENGINE_DESTROYED', 'Annotation Type Registry is destroyed.', {
      operation: `AnnotationTypeRegistry.${operation}`
    })
  }
}

/** Validates one Definition completely before publication. */
function validateDefinition(
  definition: AnnotationTypeDefinition
): asserts definition is AnnotationTypeDefinition & { readonly type: CustomAnnotationType } {
  if (typeof definition !== 'object' || definition === null) throw invalidDefinition('Definition must be an object.')
  if (!isCustomAnnotationType(definition.type)) throw invalidDefinition('Definition type must be a namespaced custom ID.')
  if (definition.apiVersion !== ANNOTATION_TYPE_DEFINITION_API_VERSION) {
    throw invalidDefinition('Definition apiVersion is unsupported.')
  }
  if (!GEOMETRIES.has(definition.geometry)) throw invalidDefinition('Definition geometry is unsupported.')
  if (!CREATION_CONTROLLERS.has(definition.creation?.controller)
    || definition.creation.controller !== definition.capabilities?.creation) {
    throw invalidDefinition('Definition creation controller is invalid or inconsistent.')
  }
  validateCapabilities(definition)
  try {
    const defaults = parseJsonValue(
      definition.appearance?.defaults,
      'validateAnnotationTypeDefinitionAppearance'
    ) as unknown as AnnotationAppearance
    validateAnnotationAppearance(defaults)
    if (definition.appearance.controls !== undefined) {
      validateAppearanceControls(definition.appearance.controls)
      const broad = definition.capabilities.appearance
      const exact = definition.appearance.controls
      if (broad.stroke !== exact.stroke || broad.fill !== exact.fill
        || broad.text !== exact.text || broad.opacity !== true) {
        throw invalidDefinition('Definition appearance capabilities are inconsistent.')
      }
    }
  } catch (cause) {
    throw new InkLayerError('ANNOTATION_TYPE_DEFINITION_INVALID', 'Definition appearance defaults are invalid.', {
      operation: 'registerAnnotationType', cause
    })
  }
  if (definition.renderer?.strategy === 'core' || typeof definition.renderer?.render !== 'function') {
    throw invalidDefinition('Definition renderer must provide render().')
  }
  if (definition.interaction?.reduceTransform !== undefined
    && typeof definition.interaction.reduceTransform !== 'function') {
    throw invalidDefinition('Definition transform reducer must be a function.')
  }
  if (definition.creation.initialize !== undefined
    && typeof definition.creation.initialize !== 'function') {
    throw invalidDefinition('Definition creation initializer must be a function.')
  }
  if (definition.pdf !== undefined
    && !new Set(['native', 'appearance-stream', 'raster', 'unsupported'])
      .has(definition.pdf.exportStrategy)) {
    throw invalidDefinition('Definition PDF export strategy is invalid.')
  }
  if (definition.data !== undefined) {
    const versions = definition.data.supportedSchemaVersions
    if (!Array.isArray(versions) || versions.length === 0 || versions.length > 100
      || new Set(versions).size !== versions.length
      || versions.some((version) => !Number.isSafeInteger(version) || version <= 0)
      || typeof definition.data.validate !== 'function') {
      throw invalidDefinition('Definition data codec is invalid.')
    }
  }
}

/** Validates boolean-only nested capability metadata. */
function validateCapabilities(definition: AnnotationTypeDefinition): void {
  const capabilities = definition.capabilities
  if (capabilities === undefined || !CREATION_CONTROLLERS.has(capabilities.creation)
    || (capabilities.creationMode !== 'one-shot' && capabilities.creationMode !== 'continuous')
    || typeof capabilities.transform !== 'object' || capabilities.transform === null
    || typeof capabilities.appearance !== 'object' || capabilities.appearance === null) {
    throw invalidDefinition('Definition capabilities are invalid.')
  }
  const flags = [
    ...Object.values(capabilities.transform),
    ...Object.values(capabilities.appearance),
    capabilities.comments, capabilities.printable, capabilities.exportable
  ]
  if (flags.some((flag) => typeof flag !== 'boolean')) {
    throw invalidDefinition('Definition capabilities must contain booleans.')
  }
  if (capabilities.transform.endpoints && capabilities.transform.vertices) {
    throw invalidDefinition('Definition cannot enable endpoint and vertex transforms together.')
  }
}

/** Publishes an immutable structural copy while retaining controlled callbacks. */
function freezeDefinition(definition: AnnotationTypeDefinition): AnnotationTypeDefinition {
  if (!('render' in definition.renderer)) {
    throw invalidDefinition('External Definitions must use controlled rendering.')
  }
  const copy: AnnotationTypeDefinition = {
    type: definition.type,
    apiVersion: definition.apiVersion,
    geometry: definition.geometry,
    capabilities: {
      creation: definition.capabilities.creation,
      creationMode: definition.capabilities.creationMode,
      transform: { ...definition.capabilities.transform },
      appearance: { ...definition.capabilities.appearance },
      comments: definition.capabilities.comments,
      printable: definition.capabilities.printable,
      exportable: definition.capabilities.exportable
    },
    ...(definition.data === undefined ? {} : { data: {
      supportedSchemaVersions: [...definition.data.supportedSchemaVersions],
      validate: definition.data.validate
    } }),
    appearance: {
      defaults: structuredClone(definition.appearance.defaults),
      ...(definition.appearance.controls === undefined
        ? {}
        : { controls: { ...definition.appearance.controls } })
    },
    creation: {
      controller: definition.creation.controller,
      ...(definition.creation.initialize === undefined
        ? {}
        : { initialize: definition.creation.initialize })
    },
    ...(definition.interaction === undefined ? {} : { interaction: { ...definition.interaction } }),
    renderer: { strategy: 'controlled', render: definition.renderer.render },
    ...(definition.pdf === undefined ? {} : { pdf: { ...definition.pdf } })
  }
  deepFreeze(copy)
  return copy
}

/** Validates exact optional UI controls without granting unsupported components. */
function validateAppearanceControls(controls: AnnotationAppearanceCapabilities): void {
  const flags = Object.values(controls)
  if (flags.length !== 6 || flags.some((flag) => typeof flag !== 'boolean')) {
    throw invalidDefinition('Definition appearance controls are invalid.')
  }
  if (!controls.stroke && (controls.dash || controls.lineCap || controls.lineJoin)) {
    throw invalidDefinition('Stroke sub-controls require stroke support.')
  }
}

/** Returns whether one Definition can interpret the annotation payload. */
function supportsTypeData(definition: AnnotationTypeDefinition, annotation: Readonly<Annotation>): boolean {
  if (annotation.typeData === undefined) return true
  return definition.data?.supportedSchemaVersions.includes(annotation.typeData.schemaVersion) ?? false
}

/** Deeply freezes the detached value supplied to extension code. */
function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const entry of Object.values(value)) deepFreeze(entry)
}

/** Creates a stable invalid Definition error. */
function invalidDefinition(message: string): InkLayerError {
  return new InkLayerError('ANNOTATION_TYPE_DEFINITION_INVALID', message, {
    operation: 'registerAnnotationType'
  })
}
