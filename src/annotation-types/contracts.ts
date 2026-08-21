/**
 * @file Public annotation-type extension contracts.
 * @description Defines controlled, renderer-neutral metadata and callbacks for
 * instance-owned custom annotation definitions without exposing Konva objects.
 */

import type {
  Annotation,
  AnnotationAppearance,
  AnnotationBounds,
  AnnotationContent,
  AnnotationTypeData,
  AnnotationTypeId,
  CustomAnnotationType
} from '../domain/annotation'
import type { JsonValue } from '../domain/json-value'
import type { AnnotationAppearanceCapabilities } from '../domain/appearance'

/** Supported Annotation Type Definition protocol version. */
export const ANNOTATION_TYPE_DEFINITION_API_VERSION = 1 as const

/** Core-controlled geometry family used for hit testing and transforms. */
export type AnnotationGeometryKind =
  | 'box'
  | 'line'
  | 'polyline'
  | 'path'
  | 'text-markup'
  | 'text-box'
  | 'point'
  | 'image'

/** Standard pointer controller selected by a Definition. */
export type AnnotationCreationController =
  | 'drag-box'
  | 'line'
  | 'polyline'
  | 'freehand'
  | 'text-selection'
  | 'point'
  | 'text-input'
  | 'image-placement'

/** Framework-neutral behavior metadata consumed by Core and product UI. */
export interface AnnotationTypeCapabilities {
  /** Standard Core-owned creation controller. */
  readonly creation: AnnotationCreationController
  /** Whether the creation tool remains active after one commit. */
  readonly creationMode: 'one-shot' | 'continuous'
  /** Direct-manipulation features supported by the type. */
  readonly transform: {
    readonly move: boolean
    readonly resize: boolean
    readonly rotate: boolean
    readonly endpoints: boolean
    readonly vertices: boolean
  }
  /** Persisted Appearance components exposed for editing. */
  readonly appearance: {
    readonly opacity: boolean
    readonly stroke: boolean
    readonly fill: boolean
    readonly text: boolean
  }
  /** Whether canonical comments are meaningful for the type. */
  readonly comments: boolean
  /** Whether the type may enter print composition. */
  readonly printable: boolean
  /** Whether the type has an export representation. */
  readonly exportable: boolean
}

/** Definition-owned payload validator for explicitly supported schema versions. */
export interface AnnotationTypeDataCodec {
  /** Positive persisted payload schema versions accepted by this codec. */
  readonly supportedSchemaVersions: readonly number[]
  /** Validates a detached, deeply frozen JSON payload without transforming it. */
  validate(payload: JsonValue, schemaVersion: number): void
}

/** Definition appearance defaults and editable component policy. */
export interface AnnotationTypeAppearanceDefinition {
  /** Complete initial persisted Appearance. */
  readonly defaults: AnnotationAppearance
  /** Optional exact component controls; Core derives broad controls when omitted. */
  readonly controls?: AnnotationAppearanceCapabilities
}

/** Declarative creation facet selecting a Core-owned gesture controller. */
export interface AnnotationTypeCreationDefinition {
  /** Core-owned gesture controller selected for creation. */
  readonly controller: AnnotationCreationController
  /** Optional pure initializer mapping normalized geometry to canonical data. */
  initialize?(input: Readonly<AnnotationTypeCreationInput>): AnnotationTypeCreationResult
}

/** Normalized detached creation data supplied after a Core-owned gesture. */
export interface AnnotationTypeCreationInput {
  /** Proposed canonical page bounds. */
  readonly bounds: AnnotationBounds
  /** Optional semantic content supplied by the host or controller. */
  readonly content?: AnnotationContent
  /** Optional page-space point pairs emitted by line/path controllers. */
  readonly points?: readonly number[]
  /** Optional independent page-space paths emitted by freehand controllers. */
  readonly strokes?: readonly (readonly number[])[]
}

/** Pure Definition-owned canonical refinement committed only after validation. */
export interface AnnotationTypeCreationResult {
  /** Refined canonical page bounds. */
  readonly bounds: AnnotationBounds
  /** Optional semantic content produced by the Definition. */
  readonly content?: AnnotationContent
  /** Optional independently versioned semantic payload. */
  readonly typeData?: AnnotationTypeData
}

/** Detached normalized transform request supplied to a pure reducer. */
export interface AnnotationTypeTransformInput {
  /** Proposed canonical page bounds. */
  readonly bounds: AnnotationBounds
  /** Optional proposed type-owned semantic data. */
  readonly typeData?: AnnotationTypeData
}

/** Pure optional refinement over canonical bounds and type-owned JSON. */
export interface AnnotationTypeInteractionDefinition {
  reduceTransform?(
    annotation: Readonly<Annotation>,
    input: Readonly<AnnotationTypeTransformInput>
  ): AnnotationTypeTransformInput
}

/** Renderer-neutral scene returned by an external Definition. */
export interface AnnotationScene {
  /** Root-level controlled primitives in paint order. */
  readonly children: readonly AnnotationSceneNode[]
}

/** Controlled scene vocabulary converted to renderer objects only by Core. */
export type AnnotationSceneNode =
  | AnnotationSceneGroup
  | AnnotationSceneRectangle
  | AnnotationSceneEllipse
  | AnnotationSceneLine
  | AnnotationScenePath
  | AnnotationSceneText
  | AnnotationSceneImage

/** Shared bounded scene-node state. */
interface AnnotationSceneNodeBase {
  readonly opacity?: number
  readonly listening?: boolean
}

/** Nested scene group with an optional affine placement. */
export interface AnnotationSceneGroup extends AnnotationSceneNodeBase {
  /** Scene primitive discriminator. */
  readonly kind: 'group'
  /** Optional horizontal group offset. */
  readonly x?: number
  /** Optional vertical group offset. */
  readonly y?: number
  /** Optional clockwise rotation in degrees. */
  readonly rotation?: number
  /** Nested controlled primitives. */
  readonly children: readonly AnnotationSceneNode[]
}

/** Axis-aligned rectangle scene primitive. */
export interface AnnotationSceneRectangle extends AnnotationSceneNodeBase {
  /** Scene primitive discriminator. */
  readonly kind: 'rectangle'
  /** Axis-aligned page-space rectangle. */
  readonly bounds: AnnotationBounds
  /** Optional non-negative corner radius. */
  readonly cornerRadius?: number
  /** Optional outline paint. */
  readonly stroke?: AnnotationSceneStroke
  /** Optional interior paint. */
  readonly fill?: AnnotationSceneFill
}

/** Ellipse fitting one axis-aligned bounds rectangle. */
export interface AnnotationSceneEllipse extends AnnotationSceneNodeBase {
  /** Scene primitive discriminator. */
  readonly kind: 'ellipse'
  /** Axis-aligned page-space ellipse bounds. */
  readonly bounds: AnnotationBounds
  /** Optional outline paint. */
  readonly stroke?: AnnotationSceneStroke
  /** Optional interior paint. */
  readonly fill?: AnnotationSceneFill
}

/** Line, polyline, or closed polygon primitive. */
export interface AnnotationSceneLine extends AnnotationSceneNodeBase {
  /** Scene primitive discriminator. */
  readonly kind: 'line'
  /** Alternating finite page-space x/y coordinates. */
  readonly points: readonly number[]
  /** Whether the final point connects to the first. */
  readonly closed?: boolean
  /** Optional renderer-neutral curve tension. */
  readonly tension?: number
  /** Required line paint. */
  readonly stroke: AnnotationSceneStroke
  /** Optional closed-area paint. */
  readonly fill?: AnnotationSceneFill
}

/** SVG path primitive validated and instantiated by Core. */
export interface AnnotationScenePath extends AnnotationSceneNodeBase {
  /** Scene primitive discriminator. */
  readonly kind: 'path'
  /** Bounded SVG path data. */
  readonly data: string
  /** Optional horizontal path offset. */
  readonly x?: number
  /** Optional vertical path offset. */
  readonly y?: number
  /** Optional outline paint. */
  readonly stroke?: AnnotationSceneStroke
  /** Optional interior paint. */
  readonly fill?: AnnotationSceneFill
}

/** Bounded plain-text primitive. */
export interface AnnotationSceneText extends AnnotationSceneNodeBase {
  /** Scene primitive discriminator. */
  readonly kind: 'text'
  /** Page-space text layout bounds. */
  readonly bounds: AnnotationBounds
  /** Bounded plain text content. */
  readonly text: string
  /** Core-supported text color. */
  readonly color: string
  /** Positive page-space font size. */
  readonly fontSize: number
  /** Optional horizontal alignment. */
  readonly align?: 'left' | 'center' | 'right'
}

/** PNG/JPEG image primitive sourced from a bounded data URL. */
export interface AnnotationSceneImage extends AnnotationSceneNodeBase {
  /** Scene primitive discriminator. */
  readonly kind: 'image'
  /** Page-space image bounds. */
  readonly bounds: AnnotationBounds
  /** Bounded PNG or JPEG data URL. */
  readonly source: string
}

/** Scene stroke projected to renderer attributes by Core. */
export interface AnnotationSceneStroke {
  /** Core-supported stroke color. */
  readonly color: string
  /** Positive page-space line width. */
  readonly width: number
  /** Optional stroke-only unit opacity. */
  readonly opacity?: number
  /** Optional positive dash lengths. */
  readonly dash?: readonly number[]
  /** Optional endpoint geometry. */
  readonly lineCap?: 'butt' | 'round' | 'square'
  /** Optional corner geometry. */
  readonly lineJoin?: 'miter' | 'round' | 'bevel'
}

/** Scene fill projected to renderer attributes by Core. */
export interface AnnotationSceneFill {
  /** Core-supported fill color. */
  readonly color: string
  /** Optional fill-only unit opacity. */
  readonly opacity?: number
}

/** Controlled renderer receiving only a detached canonical annotation. */
export interface AnnotationTypeRendererDefinition {
  /** Renderer-neutral strategy available to external Definitions. */
  readonly strategy?: 'controlled'
  render(annotation: Readonly<Annotation>): AnnotationScene
}

/** Marker for a protected built-in renderer implemented inside Core. */
export interface CoreAnnotationTypeRendererDefinition {
  /** Prevents external Definitions from selecting Core-private renderer code. */
  readonly strategy: 'core'
}

/** Explicit PDF representation policy for this type. */
export interface AnnotationTypePdfDefinition {
  /** Explicit safe PDF representation policy. */
  readonly exportStrategy: 'native' | 'appearance-stream' | 'raster' | 'unsupported'
}

/** Complete external custom annotation behavior contract. */
export interface AnnotationTypeDefinition {
  /** Stable persisted identity; external registration of built-ins is reserved. */
  readonly type: AnnotationTypeId
  /** Supported Definition protocol version. */
  readonly apiVersion: typeof ANNOTATION_TYPE_DEFINITION_API_VERSION
  /** Core-controlled geometry family. */
  readonly geometry: AnnotationGeometryKind
  /** Framework-neutral behavior metadata. */
  readonly capabilities: AnnotationTypeCapabilities
  /** Optional independently versioned payload codec. */
  readonly data?: AnnotationTypeDataCodec
  /** Defaults for persisted canonical Appearance. */
  readonly appearance: AnnotationTypeAppearanceDefinition
  /** Standard Core-owned creation selection. */
  readonly creation: AnnotationTypeCreationDefinition
  /** Optional pure canonical transform refinement. */
  readonly interaction?: AnnotationTypeInteractionDefinition
  /** Controlled renderer-neutral scene producer. */
  readonly renderer: AnnotationTypeRendererDefinition | CoreAnnotationTypeRendererDefinition
  /** Optional explicit PDF representation policy. */
  readonly pdf?: AnnotationTypePdfDefinition
}

/** Availability reason for one persisted annotation type and data version. */
export type AnnotationTypeAvailability =
  | { readonly status: 'available'; readonly definition: AnnotationTypeDefinition }
  | { readonly status: 'missing-definition' }
  | { readonly status: 'unsupported-data-version'; readonly definition: AnnotationTypeDefinition }

/** Registry change used by engines to refresh retained annotations. */
export interface AnnotationTypeRegistryEvent {
  /** Registration lifecycle event kind. */
  readonly type: 'registered' | 'unregistered'
  /** Custom identity whose behavior changed. */
  readonly annotationType: CustomAnnotationType
}

/** Instance-owned protected built-in and custom Definition registry. */
export interface AnnotationTypeRegistry {
  /** Returns all protected built-in and registered custom IDs. */
  list(): readonly AnnotationTypeId[]
  /** Returns whether an identity is protected or currently registered. */
  has(type: AnnotationTypeId): boolean
  /** Returns an immutable built-in or custom Definition reference, when available. */
  get(type: AnnotationTypeId): AnnotationTypeDefinition | undefined
  /** Registers one validated custom Definition and returns an idempotent disposer. */
  register(definition: AnnotationTypeDefinition): () => void
  /** Resolves definition and payload-version availability without discarding data. */
  resolve(annotation: Readonly<Annotation>): AnnotationTypeAvailability
  /** Runs compatible definition-owned validation while preserving original JSON. */
  validate(annotation: Readonly<Annotation>): AnnotationTypeAvailability
  /** Throws `ANNOTATION_TYPE_UNAVAILABLE` unless compatible behavior is present. */
  require(annotation: Readonly<Annotation>, operation: string): AnnotationTypeDefinition
  /** Invokes one compatible controlled renderer with detached frozen input. */
  renderControlled(annotation: Readonly<Annotation>, operation: string): AnnotationScene
  /** Subscribes to custom Definition registration changes. */
  subscribe(listener: (event: AnnotationTypeRegistryEvent) => void): () => void
  /** Removes custom Definitions and listeners without affecting persisted data. */
  destroy(): void
}
