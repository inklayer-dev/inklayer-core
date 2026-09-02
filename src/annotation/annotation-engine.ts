/**
 * @file Framework-independent Annotation Engine facade.
 * @description Coordinates the canonical repository, permissions, tool state,
 * renderer pages, text input, events, navigation, and complete lifecycle.
 */

import {
  cloneAnnotation,
  type Annotation,
  type AnnotationAppearance,
  type AnnotationAppearanceInput,
  type AnnotationBounds,
  type AnnotationContent,
  type AnnotationTypeData,
  type AnnotationTypeId,
  type AnnotationType
} from '../domain/annotation'
import { isBuiltInAnnotationType } from '../domain/annotation'
import type { JsonObject } from '../domain/json-value'
import {
  createAnnotationTypeRegistry,
  type AnnotationTypeDefinition,
  type AnnotationTypeRegistry
} from '../annotation-types'
import {
  mergeAnnotationAppearance,
  validateAnnotationAppearance,
  type AnnotationAppearanceCapabilities
} from '../domain/appearance'
import type { AnnotationComment, CommentStatus } from '../domain/comment'
import { InkLayerError } from '../domain/errors'
import { assignAnnotationReferenceNumber } from '../domain/numbering'
import {
  canPerformAnnotationAction,
  type AnnotationPermissions
} from '../domain/permissions'
import type { User } from '../domain/user'
import { parseAnnotation } from '../domain/validation'
import { createSystemClock, type Clock } from '../ports/clock'
import { createDefaultIdGenerator, type IdGenerator } from '../ports/id-generator'
import { createDefaultLogger, type Logger } from '../ports/logger'
import type { TextInputProvider } from '../ports/text-input'
import { createBrowserTextInputProvider } from '../platform/browser/text-input'
import { createMemoryAnnotationRepository } from '../repository/memory-annotation-repository'
import type {
  AnnotationRepository,
  AnnotationRepositoryEvent,
  AnnotationSelection,
  AnnotationUpdater
} from '../repository/annotation-repository'
import { parseAndValidateKonvaSnapshot } from '../renderer/konva/snapshot'
import type {
  AnnotationEngineEvent,
  AnnotationEngineListener,
  AnnotationHoverSource,
  AnnotationSelectionSource,
  AnnotationEngineWarning,
  AnnotationTextSelection
} from './events'
import {
  createKonvaPainter,
  type AnnotationPainter,
  type PainterTypeInteraction
} from './internal/painter/konva-painter'
import type {
  AnnotationAuthorLabelVisibility,
  AnnotationAccessibilityOptions,
  AnnotationImageAsset,
  AnnotationImageTool,
  AnnotationInteractionTheme,
  AnnotationKeyboardOptions,
  AnnotationPageAttachment
} from './contracts'
import {
  buildBuiltInRendererState,
  restyleBuiltInRendererState,
  updateBuiltInRendererContent
} from './built-in-runtime'
import type { AnnotationCreationMode, AnnotationTool } from './tools'
import type { PdfResolvedTextRange } from '../viewer/types'
import {
  buildAnnotationSceneRendererState,
  buildUnavailableAnnotationRendererState
} from '../renderer/konva/annotation-scene'

/** Snapshot strategy used when existing repository data contains unsafe Konva JSON. */
export type AnnotationSnapshotStrategy = 'strict' | 'lenient'

/** Annotation creation input shared by every persisted tool. */
export interface CreateAnnotationInput {
  /** Optional stable ID, generated when omitted. */
  id?: string
  /** Persisted annotation type. */
  type: AnnotationTypeId
  /** Zero-based PDF page index. */
  pageIndex: number
  /** Stage-space annotation bounds. */
  bounds: AnnotationBounds
  /** Optional semantic text, selected text, image, or references. */
  content?: AnnotationContent
  /** Optional editable appearance. */
  appearance?: AnnotationAppearanceInput
  /** Optional points for line-oriented tools. */
  points?: readonly number[]
  /** Optional independent paths merged into one Freehand annotation. */
  strokes?: readonly (readonly number[])[]
  /** Optional SVG path for Cloud/native path data. */
  pathData?: string
  /** Optional markup line rectangles. */
  textRects?: readonly AnnotationBounds[]
  /** Optional independently versioned semantic payload for a custom type. */
  typeData?: AnnotationTypeData
  /** Optional bounded application metadata retained by the annotation. */
  extensions?: JsonObject
}

/** One stable-ID request for a permanent text markup annotation. */
export interface CreateTextMarkupRangeInput {
  /** Deterministic annotation identity used for duplicate prevention. */
  readonly id: string
  /** Resolved same-page text and geometry. */
  readonly range: PdfResolvedTextRange
  /** Optional bounded application provenance retained by the annotation. */
  readonly extensions?: JsonObject
}

/** Options shared by one batch of permanent text markup annotations. */
export interface CreateTextMarkupsFromRangesOptions {
  /** Optional appearance override applied to every created annotation. */
  readonly appearance?: AnnotationAppearanceInput
}

/** Exact renderer and bounds update for a transform operation. */
export interface TransformAnnotationInput {
  /** Updated Stage-space bounds. */
  bounds: AnnotationBounds
  /** Exact serialized Konva Group after the transform. */
  serialized: string
}

/** Construction options for one Annotation Engine instance. */
export interface AnnotationEngineOptions {
  /** DOM root that owns all instance state and temporary overlays. */
  root: HTMLElement
  /** Optional external repository; Core creates one when omitted. */
  repository?: AnnotationRepository
  /** Current collaboration identity, or null when anonymous. */
  currentUser?: User | null
  /** Canonical collaboration permission configuration. */
  permissions?: AnnotationPermissions
  /** Existing snapshot load policy, defaulting to lenient. */
  snapshotStrategy?: AnnotationSnapshotStrategy
  /** Deterministic clock override. */
  clock?: Clock
  /** Deterministic identifier override. */
  idGenerator?: IdGenerator
  /** Diagnostics override. */
  logger?: Logger
  /** Temporary free-text input override. */
  textInputProvider?: TextInputProvider
  /** Receives recoverable load warnings before listeners may be attached. */
  onWarning?: (warning: AnnotationEngineWarning) => void
  /** Idle milliseconds merging successive Freehand strokes; defaults to 1,000. */
  freehandMergeDelayMs?: number
  /** Initial per-type tool appearance overrides applied over Core defaults. */
  defaultAppearances?: Partial<Record<AnnotationType, AnnotationAppearanceInput>>
  /** Initial images prepared by application UI for Signature or Stamp placement. */
  imageAssets?: Partial<Record<AnnotationImageTool, AnnotationImageAsset>>
  /** Per-type override for one-shot versus continuous interactive creation. */
  creationModes?: Partial<Record<AnnotationType, AnnotationCreationMode>>
  /** Initial author/reference Tag visibility; defaults to `auto`. */
  authorLabelVisibility?: AnnotationAuthorLabelVisibility
  /** Canvas-only selection affordance theme; product UI remains framework-owned. */
  interactionTheme?: AnnotationInteractionTheme
  /** Root-scoped direct-document keyboard behavior; enabled by default. */
  keyboard?: AnnotationKeyboardOptions
  /** Localizable semantics for Core-owned annotation document controls. */
  accessibility?: AnnotationAccessibilityOptions
  /** Optional borrowed instance Annotation Type Registry. */
  annotationTypes?: AnnotationTypeRegistry
}

/** Public framework-independent Annotation Engine facade. */
export interface AnnotationEngine {
  /** Stable engine instance ID. */
  readonly instanceId: string
  /** Canonical repository used as the sole annotation source. */
  readonly repository: AnnotationRepository
  /** Registry controlling custom type availability for this engine. */
  readonly annotationTypes: AnnotationTypeRegistry
  /** Attaches one page renderer. */
  attachPage(attachment: AnnotationPageAttachment): Promise<void>
  /** Detaches one page renderer. */
  detachPage(pageIndex: number): void
  /** Returns the current transient or persisted tool. */
  getTool(): AnnotationTool
  /** Returns the effective interactive creation lifecycle for one persisted tool. */
  getCreationMode(type: AnnotationTypeId): AnnotationCreationMode
  /** Changes the current tool. */
  setTool(tool: AnnotationTool): void
  /** Returns a detached image currently prepared for Signature or Stamp placement. */
  getImageAsset(type: AnnotationImageTool): AnnotationImageAsset | null
  /** Sets or clears the image used by subsequent pointer placement for one tool. */
  setImageAsset(type: AnnotationImageTool, asset: AnnotationImageAsset | null): void
  /** Returns a detached complete appearance for a persisted annotation type. */
  getToolAppearance(type: AnnotationTypeId): AnnotationAppearance
  /** Deeply updates the appearance used by future creations of one type. */
  setToolAppearance(type: AnnotationTypeId, appearance: AnnotationAppearanceInput): AnnotationAppearance
  /** Returns which appearance controls are meaningful for one type. */
  getAppearanceCapabilities(type: AnnotationTypeId): AnnotationAppearanceCapabilities
  /** Returns whether author/reference Tags are automatic, always visible, or hidden. */
  getAuthorLabelVisibility(): AnnotationAuthorLabelVisibility
  /** Replaces author/reference Tag visibility without changing annotation data. */
  setAuthorLabelVisibility(visibility: AnnotationAuthorLabelVisibility): void
  /** Replaces the current collaboration identity. */
  setCurrentUser(user: User | null): void
  /** Replaces canonical permission configuration. */
  setPermissions(permissions: AnnotationPermissions | undefined): void
  /** Creates any persisted annotation type through its real snapshot builder. */
  createAnnotation(input: CreateAnnotationInput): Annotation
  /** Returns every detached canonical annotation in repository order. */
  getAnnotations(): readonly Annotation[]
  /** Creates highlight, strikeout, or underline from normalized text selection. */
  createTextMarkup(
    type: 'highlight' | 'strikeout' | 'underline',
    selection: AnnotationTextSelection,
    appearance?: AnnotationAppearanceInput
  ): Annotation
  /** Creates missing stable-ID text markups in input order. */
  createTextMarkupsFromRanges(
    type: 'highlight' | 'strikeout' | 'underline',
    inputs: readonly CreateTextMarkupRangeInput[],
    options?: CreateTextMarkupsFromRangesOptions
  ): readonly Annotation[]
  /** Opens the configured text input and creates FreeText on submit. */
  requestFreeText(pageIndex: number, bounds: AnnotationBounds): Promise<Annotation | null>
  /** Opens the configured text input to edit an existing FreeText or Note. */
  requestEditText(id: string): Promise<Annotation | null>
  /** Replaces semantic content and synchronizes content-backed renderer nodes. */
  updateContent(id: string, content: AnnotationContent | undefined): Annotation
  /** Updates semantic annotation data with canonical validation. */
  updateAnnotation(id: string, updater: AnnotationUpdater): Annotation
  /** Deeply updates one annotation appearance and its exact renderer snapshot. */
  updateAppearance(id: string, appearance: AnnotationAppearanceInput): Annotation
  /** Applies exact validated renderer state after a transform. */
  transformAnnotation(id: string, input: TransformAnnotationInput): Annotation
  /** Appends one permission-checked canonical comment. */
  addComment(annotationId: string, comment: AnnotationComment): Annotation
  /** Updates one comment under comment-author permissions. */
  updateComment(
    annotationId: string,
    commentId: string,
    updater: (comment: Readonly<AnnotationComment>) => AnnotationComment
  ): Annotation
  /** Changes comment workflow status under annotation-owner permissions. */
  changeCommentStatus(annotationId: string, commentId: string, status: CommentStatus): Annotation
  /** Deletes one comment under comment-author permissions. */
  deleteComment(annotationId: string, commentId: string): Annotation
  /** Deletes one annotation when permitted. */
  deleteAnnotation(id: string): Annotation | undefined
  /** Returns whether one deletion transaction can be restored. */
  canUndoDeletion(): boolean
  /** Restores the most recent deleted annotation or comment. */
  undoLastDeletion(): Annotation | null
  /** Replaces repository selection. */
  setSelection(selection: AnnotationSelection, source?: AnnotationSelectionSource, isClick?: boolean): void
  /** Applies transient hover feedback. */
  setHoveredAnnotation(id: string | null, source?: AnnotationHoverSource): void
  /** Scrolls an attached annotation container into view and selects it. */
  navigateToAnnotation(id: string): boolean
  /** Renders one attached annotation overlay without edit affordances. */
  renderPageRaster(pageIndex: number, pixelRatio?: number): HTMLCanvasElement
  /** Subscribes to typed engine events. */
  subscribe(listener: AnnotationEngineListener): () => void
  /** Releases renderer, inputs, subscription, root state, and owned repository. */
  destroy(): void
}

/** Creates one Annotation Engine around a canonical repository. */
export function createAnnotationEngine(options: AnnotationEngineOptions): AnnotationEngine {
  return new AnnotationEngineImpl(options)
}

/** Concrete Annotation Engine facade. */
class AnnotationEngineImpl implements AnnotationEngine {
  public readonly instanceId: string
  public readonly repository: AnnotationRepository
  public readonly annotationTypes: AnnotationTypeRegistry
  private readonly ownsRepository: boolean
  private readonly ownsAnnotationTypes: boolean
  private readonly root: HTMLElement
  private readonly clock: Clock
  private readonly idGenerator: IdGenerator
  private readonly logger: Logger
  private readonly textInputProvider: TextInputProvider
  private readonly painter: AnnotationPainter
  private readonly listeners = new Set<AnnotationEngineListener>()
  private readonly pageAttachments = new Map<number, AnnotationPageAttachment>()
  private readonly inputControllers = new Set<AbortController>()
  private readonly invalidSnapshotIds = new Set<string>()
  private readonly snapshotStrategy: AnnotationSnapshotStrategy
  private readonly onWarning: ((warning: AnnotationEngineWarning) => void) | undefined
  private readonly unsubscribeRepository: () => void
  private readonly unsubscribeAnnotationTypes: () => void
  private currentUser: User | null
  private permissions: AnnotationPermissions | undefined
  private tool: AnnotationTool = 'select'
  private readonly toolAppearances = new Map<AnnotationTypeId, AnnotationAppearance>()
  private readonly imageAssets = new Map<AnnotationImageTool, AnnotationImageAsset>()
  private readonly creationModes = new Map<AnnotationTypeId, AnnotationCreationMode>()
  private readonly imageCursorColor: string
  private readonly keyboardEnabled: boolean
  private readonly keyboardNudgeStep: number
  private readonly keyboardAcceleratedNudgeStep: number
  private readonly ownedRootAttributes = new Map<string, string>()
  private readonly imageCursorGenerations = new Map<AnnotationImageTool, number>()
  private readonly deletionHistory: DeletionTransaction[] = []
  private readonly hoverBySource = new Map<AnnotationHoverSource, string>()
  private pendingSelectionContext: { source: AnnotationSelectionSource; isClick: boolean } | null = null
  private destroyed = false

  /** Creates one fully instance-owned facade and validates existing snapshots. */
  public constructor(options: AnnotationEngineOptions) {
    if (typeof options.root !== 'object' || options.root === null) {
      throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'Annotation Engine requires an HTMLElement root.', {
        operation: 'createAnnotationEngine'
      })
    }
    if (options.freehandMergeDelayMs !== undefined
      && (!Number.isFinite(options.freehandMergeDelayMs)
        || options.freehandMergeDelayMs < 0 || options.freehandMergeDelayMs > 5000)) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Freehand merge delay must be between 0 and 5,000ms.', {
        operation: 'createAnnotationEngine'
      })
    }
    this.keyboardEnabled = options.keyboard?.enabled !== false
    this.keyboardNudgeStep = validateKeyboardStep(options.keyboard?.nudgeStep ?? 1, 'nudgeStep')
    this.keyboardAcceleratedNudgeStep = validateKeyboardStep(
      options.keyboard?.acceleratedNudgeStep ?? 10,
      'acceleratedNudgeStep'
    )
    this.root = options.root
    this.repository = options.repository ?? createMemoryAnnotationRepository()
    this.ownsRepository = options.repository === undefined
    this.annotationTypes = options.annotationTypes ?? createAnnotationTypeRegistry()
    this.ownsAnnotationTypes = options.annotationTypes === undefined
    this.currentUser = options.currentUser ?? null
    this.permissions = options.permissions
    this.clock = options.clock ?? createSystemClock()
    this.idGenerator = options.idGenerator ?? createDefaultIdGenerator('annotation')
    this.logger = options.logger ?? createDefaultLogger()
    this.textInputProvider = options.textInputProvider ?? createBrowserTextInputProvider()
    this.snapshotStrategy = options.snapshotStrategy ?? 'lenient'
    this.onWarning = options.onWarning
    this.imageCursorColor = options.interactionTheme?.accentColor ?? '#1677ff'
    this.instanceId = this.idGenerator.next()
    for (const type of PERSISTED_ANNOTATION_TYPES) {
      const definition = this.requireTypeDefinition(type, 'createAnnotationEngine')
      this.toolAppearances.set(type, mergeAnnotationAppearance(
        type,
        definition.appearance.defaults,
        options.defaultAppearances?.[type]
      ))
      const creationMode = options.creationModes?.[type]
        ?? definitionCreationMode(definition)
      if (creationMode !== 'once' && creationMode !== 'continuous') {
        throw new InkLayerError('ANNOTATION_INVALID', `${type} creation mode is invalid.`, {
          operation: 'createAnnotationEngine'
        })
      }
      this.creationModes.set(type, creationMode)
    }
    for (const type of IMAGE_TOOLS) {
      const asset = options.imageAssets?.[type]
      if (asset !== undefined) this.imageAssets.set(type, normalizeImageAsset(type, asset))
    }
    this.painter = createKonvaPainter({
      instanceId: this.instanceId,
      ...(options.authorLabelVisibility === undefined
        ? {}
        : { authorLabelVisibility: options.authorLabelVisibility }),
      ...(options.interactionTheme === undefined ? {} : { interactionTheme: options.interactionTheme }),
      ...(options.accessibility === undefined ? {} : { accessibility: options.accessibility }),
      getAnnotationsByPage: (pageIndex) => this.repository.getByPage(pageIndex)
        .filter((annotation) => !this.invalidSnapshotIds.has(annotation.id))
        .map((annotation) => this.presentationAnnotation(annotation)),
      onSelect: (annotationId, source) => {
        this.setSelection(
          { ids: [annotationId], primaryId: annotationId },
          source === 'accessibility' ? 'accessibility' : 'canvas',
          true
        )
        if (source === 'canvas' && this.keyboardEnabled) this.focusRoot()
      },
      onTransform: (annotationId, bounds, serialized) => {
        try {
          this.transformAnnotation(annotationId, { bounds, serialized })
        } catch (cause) {
          const error = cause instanceof InkLayerError
            ? cause
            : new InkLayerError('ANNOTATION_INVALID', 'Annotation transform failed.', {
                operation: 'transformAnnotation', annotationId, cause
              })
          this.emit({ type: 'error', error })
          const current = this.repository.getById(annotationId)
          if (current !== undefined) this.painter.render(current)
        }
      },
      getTool: () => this.tool,
      getCreationController: (type) => this.requireTypeDefinition(
        type, 'pointerCreate'
      ).creation.controller,
      getGeometry: (type) => this.requireTypeDefinition(type, 'pointerCreate').geometry,
      getAppearance: (type) => this.getToolAppearance(type),
      getImageAsset: (type) => this.getImageAsset(type),
      getTypeInteraction: (annotation) => this.getTypeInteraction(annotation),
      canTransform: (annotation) => this.canTransform(annotation),
      canPrint: (annotation) => {
        const availability = this.annotationTypes.resolve(annotation)
        return availability.status === 'available'
          && availability.definition.capabilities.printable
      },
      onCreate: (gesture) => {
        try {
          const annotation = this.createAnnotation({
            type: gesture.type,
            pageIndex: gesture.pageIndex,
            bounds: gesture.bounds,
            ...(gesture.content === undefined ? {} : { content: gesture.content }),
            ...(gesture.points === undefined ? {} : { points: gesture.points }),
            ...(gesture.strokes === undefined ? {} : { strokes: gesture.strokes })
          })
          this.completeInteractiveCreation(annotation)
        } catch (cause) {
          this.emit({ type: 'error', error: normalizeAnnotationEngineError(cause, 'pointerCreate') })
        }
      },
      onImageAssetRequired: (tool) => this.emit({ type: 'imageAssetRequired', tool }),
      onRequestFreeText: (pageIndex, bounds) => {
        void this.requestFreeText(pageIndex, bounds).catch((cause: unknown) => {
          this.emit({ type: 'error', error: normalizeAnnotationEngineError(cause, 'requestFreeText') })
        })
      },
      onRequestEditText: (annotationId) => {
        void this.requestEditText(annotationId).catch((cause: unknown) => {
          this.emit({ type: 'error', error: normalizeAnnotationEngineError(cause, 'requestEditText') })
        })
      },
      onClearSelection: () => this.setSelection({ ids: [] }, 'canvas', true),
      onHover: (annotationId) => this.setHoveredAnnotation(annotationId, 'canvas'),
      ...(options.freehandMergeDelayMs === undefined
        ? {}
        : { freehandMergeDelayMs: options.freehandMergeDelayMs })
    })
    this.validateExistingSnapshots(this.snapshotStrategy, this.onWarning)
    this.root.classList.add('inklayer-engine')
    this.root.dataset['inklayerInstance'] = this.instanceId
    this.root.dataset['inklayerTool'] = this.tool
    this.syncCreationControllerState()
    this.syncImageAssetState()
    for (const type of IMAGE_TOOLS) {
      const asset = this.imageAssets.get(type)
      if (asset !== undefined) this.updateImageCursor(type, asset)
    }
    this.attachKeyboardInteractions(options.accessibility?.rootLabel)
    this.unsubscribeRepository = this.repository.subscribe((event) => this.handleRepositoryEvent(event))
    this.unsubscribeAnnotationTypes = this.annotationTypes.subscribe((event) => {
      if (this.destroyed) return
      if (event.type === 'unregistered' && this.tool === event.annotationType) {
        this.setTool('select')
      }
      for (const annotation of this.repository.getAll()) {
        if (annotation.type !== event.annotationType) continue
        this.invalidSnapshotIds.delete(annotation.id)
        try {
          this.validateSnapshot(annotation)
        } catch (cause) {
          this.invalidSnapshotIds.add(annotation.id)
          this.emit({
            type: 'error',
            error: normalizeAnnotationEngineError(cause, 'refreshAnnotationType')
          })
        }
      }
      this.painter.replace(this.repository.getAll()
        .filter((annotation) => !this.invalidSnapshotIds.has(annotation.id))
        .map((annotation) => this.presentationAnnotation(annotation)))
    })
  }

  /** Attaches one instance-owned page renderer. */
  public async attachPage(attachment: AnnotationPageAttachment): Promise<void> {
    this.assertActive('attachPage')
    await this.painter.attachPage(attachment)
    this.pageAttachments.set(attachment.pageIndex, { ...attachment })
  }

  /** Detaches one page renderer. */
  public detachPage(pageIndex: number): void {
    this.assertActive('detachPage')
    this.painter.detachPage(pageIndex)
    this.pageAttachments.delete(pageIndex)
  }

  /** Renders one attached annotation page for print/export composition. */
  public renderPageRaster(pageIndex: number, pixelRatio?: number): HTMLCanvasElement {
    this.assertActive('renderPageRaster')
    return this.painter.renderPageRaster(pageIndex, pixelRatio)
  }

  /** Returns the current tool. */
  public getTool(): AnnotationTool {
    return this.tool
  }

  /** Returns the configured once-or-continuous lifecycle for one interaction tool. */
  public getCreationMode(type: AnnotationTypeId): AnnotationCreationMode {
    this.assertActive('getCreationMode')
    const configured = this.creationModes.get(type)
    if (configured !== undefined) return configured
    return definitionCreationMode(this.requireTypeDefinition(type, 'getCreationMode'))
  }

  /** Changes the current tool and root-scoped state. */
  public setTool(tool: AnnotationTool): void {
    this.assertActive('setTool')
    if (tool !== 'select' && tool !== 'text-select') {
      this.requireTypeDefinition(tool, 'setTool')
    }
    if (this.tool === tool) return
    this.tool = tool
    if (tool !== 'select' && this.hoverBySource.has('canvas')) {
      this.setHoveredAnnotation(null, 'canvas')
    }
    this.root.dataset['inklayerTool'] = tool
    this.syncCreationControllerState()
    this.syncImageAssetState()
    this.painter.setTool(tool)
    this.emit({ type: 'toolChanged', tool })
  }

  /** Exposes renderer-neutral controller intent for built-in and custom CSS cursors. */
  private syncCreationControllerState(): void {
    if (this.tool === 'select' || this.tool === 'text-select') {
      delete this.root.dataset['inklayerCreationController']
      return
    }
    this.root.dataset['inklayerCreationController'] = this.requireTypeDefinition(
      this.tool, 'syncCreationControllerState'
    ).creation.controller
  }

  /** Returns the current detached pointer-placement image for one asset tool. */
  public getImageAsset(type: AnnotationImageTool): AnnotationImageAsset | null {
    this.assertActive('getImageAsset')
    const asset = this.imageAssets.get(type)
    return asset === undefined ? null : { ...asset }
  }

  /** Replaces or clears the image used by future pointer placements. */
  public setImageAsset(type: AnnotationImageTool, asset: AnnotationImageAsset | null): void {
    this.assertActive('setImageAsset')
    if (asset === null) this.imageAssets.delete(type)
    else this.imageAssets.set(type, normalizeImageAsset(type, asset))
    this.syncImageAssetState()
    this.updateImageCursor(type, asset)
  }

  /** Exposes whether the active image tool can place immediately for Core CSS cursors. */
  private syncImageAssetState(): void {
    if (this.tool === 'signature' || this.tool === 'stamp') {
      this.root.dataset['inklayerImageAsset'] = this.imageAssets.has(this.tool) ? 'ready' : 'missing'
    } else {
      delete this.root.dataset['inklayerImageAsset']
    }
  }

  /** Builds an instance-scoped thumbnail cursor without leaking product UI state. */
  private updateImageCursor(type: AnnotationImageTool, asset: AnnotationImageAsset | null): void {
    const generation = (this.imageCursorGenerations.get(type) ?? 0) + 1
    this.imageCursorGenerations.set(type, generation)
    const style = this.root.style
    if (style === undefined) return
    const property = `--inklayer-cursor-${type}-asset`
    if (asset === null) {
      style.removeProperty(property)
      return
    }
    const document = this.root.ownerDocument
    if (document === null || document === undefined) return
    const image = document.createElement('img')
    image.onload = () => {
      if (this.destroyed || generation !== this.imageCursorGenerations.get(type)) return
      const naturalWidth = image.naturalWidth || asset.width
      const naturalHeight = image.naturalHeight || asset.height
      const scale = Math.min(1, 88 / Math.max(naturalWidth, naturalHeight))
      const width = Math.max(12, Math.round(naturalWidth * scale))
      const height = Math.max(12, Math.round(naturalHeight * scale))
      const padding = 8
      const canvas = document.createElement('canvas')
      canvas.width = width + padding * 2
      canvas.height = height + padding * 2
      const context = canvas.getContext('2d')
      if (context === null) return
      context.shadowColor = 'rgba(0, 0, 0, 0.25)'
      context.shadowBlur = 8
      context.shadowOffsetY = 2
      context.fillStyle = 'rgba(255, 255, 255, 0.92)'
      context.fillRect(padding, padding, width, height)
      context.shadowColor = 'transparent'
      context.globalAlpha = 0.92
      context.drawImage(image, padding, padding, width, height)
      context.globalAlpha = 1
      context.strokeStyle = this.imageCursorColor
      context.lineWidth = 2
      context.strokeRect(padding + 1, padding + 1, width - 2, height - 2)
      const centerX = Math.round(canvas.width / 2)
      const centerY = Math.round(canvas.height / 2)
      context.fillStyle = 'rgba(255, 255, 255, 0.86)'
      context.beginPath()
      context.arc(centerX, centerY, 7, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = this.imageCursorColor
      context.beginPath()
      context.arc(centerX, centerY, 4, 0, Math.PI * 2)
      context.fill()
      style.setProperty(
        property,
        `url("${canvas.toDataURL('image/png')}") ${centerX} ${centerY}, copy`
      )
    }
    image.src = asset.image
  }

  /** Selects a user-created annotation and applies its configured tool lifecycle. */
  private completeInteractiveCreation(annotation: Annotation): Annotation {
    if (this.getCreationMode(annotation.type) === 'once') this.setTool('select')
    this.setSelection({ ids: [annotation.id], primaryId: annotation.id }, 'canvas', true)
    return annotation
  }

  /** Returns a detached complete tool appearance. */
  public getToolAppearance(type: AnnotationTypeId): AnnotationAppearance {
    this.assertActive('getToolAppearance')
    const configured = this.toolAppearances.get(type)
    if (configured !== undefined) return structuredClone(configured)
    return structuredClone(this.requireTypeDefinition(type, 'getToolAppearance').appearance.defaults)
  }

  /** Updates future creation and live preview appearance for one type. */
  public setToolAppearance(
    type: AnnotationTypeId,
    appearance: AnnotationAppearanceInput
  ): AnnotationAppearance {
    this.assertActive('setToolAppearance')
    const definition = this.requireTypeDefinition(type, 'setToolAppearance')
    const next = definition.renderer.strategy === 'core'
      ? mergeAnnotationAppearance(
          requireBuiltInType(definition, type, 'setToolAppearance'),
          this.getToolAppearance(type), appearance
        )
      : mergeCustomAppearance(this.getToolAppearance(type), appearance, definition)
    this.toolAppearances.set(type, next)
    this.painter.setTool(this.tool)
    return structuredClone(next)
  }

  /** Returns renderer-independent controls supported by one type. */
  public getAppearanceCapabilities(type: AnnotationTypeId): AnnotationAppearanceCapabilities {
    this.assertActive('getAppearanceCapabilities')
    const definition = this.requireTypeDefinition(type, 'getAppearanceCapabilities')
    if (definition.appearance.controls !== undefined) {
      return { ...definition.appearance.controls }
    }
    const appearance = definition.capabilities.appearance
    return {
      stroke: appearance.stroke,
      fill: appearance.fill,
      text: appearance.text,
      dash: appearance.stroke,
      lineCap: appearance.stroke,
      lineJoin: appearance.stroke
    }
  }

  /** Returns the current Tag visibility policy. */
  public getAuthorLabelVisibility(): AnnotationAuthorLabelVisibility {
    this.assertActive('getAuthorLabelVisibility')
    return this.painter.getAuthorLabelVisibility()
  }

  /** Replaces the transient Tag visibility policy. */
  public setAuthorLabelVisibility(visibility: AnnotationAuthorLabelVisibility): void {
    this.assertActive('setAuthorLabelVisibility')
    if (visibility !== 'auto' && visibility !== 'always' && visibility !== 'hidden') {
      throw new InkLayerError('ANNOTATION_INVALID', 'Author-label visibility is invalid.', {
        operation: 'setAuthorLabelVisibility'
      })
    }
    this.painter.setAuthorLabelVisibility(visibility)
  }

  /** Replaces the current user with a detached identity. */
  public setCurrentUser(user: User | null): void {
    this.assertActive('setCurrentUser')
    this.currentUser = user === null ? null : { ...user }
    this.painter.setTool(this.tool)
  }

  /** Replaces canonical permission configuration. */
  public setPermissions(permissions: AnnotationPermissions | undefined): void {
    this.assertActive('setPermissions')
    this.permissions = permissions
    this.painter.setTool(this.tool)
  }

  /** Creates a canonical annotation and its validated exact renderer state. */
  public createAnnotation(input: CreateAnnotationInput): Annotation {
    this.assertActive('createAnnotation')
    this.requirePermission('annotation.create')
    validateCreationInput(input)
    if (input.type === 'stamp' && (input.content?.image === undefined || input.content.image.length === 0)) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Stamp creation requires image content.', {
        operation: 'createAnnotation', pageIndex: input.pageIndex
      })
    }
    let content = normalizeCreationContent(input)
    if (input.type === 'signature' && content?.signature === undefined) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Signature creation requires image or ink content.', {
        operation: 'createAnnotation', pageIndex: input.pageIndex
      })
    }
    const definition = this.requireTypeDefinition(input.type, 'createAnnotation')
    let bounds = { ...input.bounds }
    let typeData = input.typeData === undefined ? undefined : structuredClone(input.typeData)
    if ('render' in definition.renderer && definition.creation.initialize !== undefined) {
      const initializerInput = {
        bounds: { ...input.bounds },
        ...(content === undefined ? {} : { content: structuredClone(content) }),
        ...(input.points === undefined ? {} : { points: [...input.points] }),
        ...(input.strokes === undefined
          ? {}
          : { strokes: input.strokes.map((stroke) => [...stroke]) })
      }
      deepFreeze(initializerInput)
      const initialized = definition.creation.initialize(initializerInput)
      bounds = { ...initialized.bounds }
      if (content === undefined && initialized.content !== undefined) {
        content = structuredClone(initialized.content)
      }
      if (typeData === undefined && initialized.typeData !== undefined) {
        typeData = structuredClone(initialized.typeData)
      }
    }
    if (definition.renderer.strategy === 'core') {
      validateImageContent(
        requireBuiltInType(definition, input.type, 'createAnnotation'),
        content,
        input.pageIndex
      )
    }
    const id = input.id ?? this.idGenerator.next()
    const author = this.currentUser ?? { id: 'null', name: 'Anonymous' }
    const appearance = definition.renderer.strategy === 'core'
      ? mergeAnnotationAppearance(
          requireBuiltInType(definition, input.type, 'createAnnotation'),
          this.getToolAppearance(input.type), input.appearance
        )
      : mergeCustomAppearance(
          this.getToolAppearance(input.type),
          input.appearance,
          definition
        )
    const rendererState = definition.renderer.strategy === 'core'
      ? buildBuiltInRendererState(definition, {
          id,
          type: requireBuiltInType(definition, input.type, 'createAnnotation'),
          bounds,
          ...(content === undefined ? {} : { content }),
          appearance,
          ...(input.points === undefined ? {} : { points: input.points }),
          ...(input.strokes === undefined ? {} : { strokes: input.strokes }),
          ...(input.pathData === undefined ? {} : { pathData: input.pathData }),
          ...(input.textRects === undefined ? {} : { textRects: input.textRects })
        })
      : { engine: 'konva' as const, schemaVersion: 1 as const, serialized: JSON.stringify({
          className: 'Group', attrs: { id }
        }) }
    let annotation = parseAnnotation({
      id,
      schemaVersion: 1,
      type: input.type,
      pageIndex: input.pageIndex,
      bounds,
      coordinateSpace: 'konva-stage',
      comments: [],
      author,
      createdAt: this.clock.now(),
      native: false,
      rendererState,
      ...(content === undefined ? {} : { content }),
      appearance,
      ...(typeData === undefined ? {} : { typeData }),
      ...(input.extensions === undefined ? {} : { extensions: input.extensions })
    })
    if ('render' in definition.renderer) {
      this.annotationTypes.validate(annotation)
      annotation = {
        ...annotation,
        rendererState: buildAnnotationSceneRendererState(
          annotation,
          this.annotationTypes.renderControlled(annotation, 'createAnnotation')
        )
      }
    }
    annotation = assignAnnotationReferenceNumber(annotation, this.repository.getAll())
    this.repository.add(annotation)
    return cloneAnnotation(annotation)
  }

  /** Returns the detached canonical repository collection. */
  public getAnnotations(): readonly Annotation[] {
    this.assertActive('getAnnotations')
    return this.repository.getAll()
  }

  /** Creates a text markup annotation from normalized selection rectangles. */
  public createTextMarkup(
    type: 'highlight' | 'strikeout' | 'underline',
    selection: AnnotationTextSelection,
    appearance?: AnnotationAppearanceInput
  ): Annotation {
    this.assertActive('createTextMarkup')
    if (selection.rects.length === 0) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Text selection must contain rectangles.', {
        operation: 'createTextMarkup', pageIndex: selection.pageIndex
      })
    }
    this.emit({ type: 'textSelected', selection: cloneTextSelection(selection) })
    return this.completeInteractiveCreation(this.createAnnotation({
      type,
      pageIndex: selection.pageIndex,
      bounds: unionBounds(selection.rects),
      textRects: selection.rects,
      content: { text: '', selectedText: selection.text },
      ...(appearance === undefined ? {} : { appearance })
    }))
  }

  /** Creates one permanent text markup for every not-yet-persisted stable ID. */
  public createTextMarkupsFromRanges(
    type: 'highlight' | 'strikeout' | 'underline',
    inputs: readonly CreateTextMarkupRangeInput[],
    options: CreateTextMarkupsFromRangesOptions = {}
  ): readonly Annotation[] {
    this.assertActive('createTextMarkupsFromRanges')
    const knownIds = new Set(this.repository.getAll().map((annotation) => annotation.id))
    const created: Annotation[] = []
    for (const input of inputs) {
      if (knownIds.has(input.id)) continue
      validateResolvedTextRange(input.range)
      const annotation = this.createAnnotation({
        id: input.id,
        type,
        pageIndex: input.range.pageIndex,
        bounds: unionBounds(input.range.rects),
        textRects: input.range.rects,
        content: { text: '', selectedText: input.range.text },
        ...(options.appearance === undefined ? {} : { appearance: options.appearance }),
        ...(input.extensions === undefined ? {} : { extensions: input.extensions })
      })
      knownIds.add(annotation.id)
      created.push(annotation)
    }
    return created
  }

  /** Requests instance-owned text input and creates FreeText after submission. */
  public async requestFreeText(pageIndex: number, bounds: AnnotationBounds): Promise<Annotation | null> {
    this.assertActive('requestFreeText')
    const attachment = this.pageAttachments.get(pageIndex)
    const scale = attachment?.scale ?? 1
    const pageBounds = { ...bounds }
    const controller = new AbortController()
    this.inputControllers.add(controller)
    try {
      const result = await this.textInputProvider.requestText({
        root: attachment?.container ?? this.root,
        pageIndex,
        pageBounds,
        scale,
        bounds: scaleBounds(pageBounds, scale),
        returnFocusTo: this.root,
        signal: controller.signal
      })
      if (result.value === null || this.destroyed) return null
      return this.completeInteractiveCreation(this.createAnnotation({
        type: 'free-text', pageIndex, bounds: pageBounds, content: { text: result.value }
      }))
    } finally {
      this.inputControllers.delete(controller)
    }
  }

  /** Requests instance-owned text input and updates an existing text annotation. */
  public async requestEditText(id: string): Promise<Annotation | null> {
    this.assertActive('requestEditText')
    const annotation = this.requireAnnotation(id, 'requestEditText')
    this.requirePermission('annotation.edit', annotation)
    if (annotation.type !== 'free-text' && annotation.type !== 'note') {
      throw new InkLayerError('ANNOTATION_INVALID', 'Only FreeText and Note support direct text editing.', {
        operation: 'requestEditText', annotationId: id, pageIndex: annotation.pageIndex
      })
    }
    const attachment = this.pageAttachments.get(annotation.pageIndex)
    const scale = attachment?.scale ?? 1
    const controller = new AbortController()
    this.inputControllers.add(controller)
    try {
      const result = await this.textInputProvider.requestText({
        root: attachment?.container ?? this.root,
        pageIndex: annotation.pageIndex,
        pageBounds: { ...annotation.bounds },
        scale,
        bounds: scaleBounds(annotation.bounds, scale),
        initialValue: annotation.content?.text ?? '',
        returnFocusTo: this.root,
        signal: controller.signal
      })
      if (result.value === null || this.destroyed) return null
      return this.updateContent(id, { ...(annotation.content ?? { text: '' }), text: result.value })
    } finally {
      this.inputControllers.delete(controller)
    }
  }

  /** Replaces semantic content and keeps the exact renderer snapshot in sync. */
  public updateContent(id: string, content: AnnotationContent | undefined): Annotation {
    this.assertActive('updateContent')
    return this.updateAnnotation(id, (annotation) => {
      if (content !== undefined) return { ...annotation, content }
      const withoutContent: Partial<Annotation> = { ...annotation }
      delete withoutContent.content
      return withoutContent as Annotation
    })
  }

  /** Applies one permission-checked semantic update. */
  public updateAnnotation(id: string, updater: AnnotationUpdater): Annotation {
    this.assertActive('updateAnnotation')
    const current = this.requireAnnotation(id, 'updateAnnotation')
    this.requirePermission('annotation.edit', current)
    const definition = this.annotationTypes.require(current, 'updateAnnotation')
    const updated = updater(current)
    let candidate = parseAnnotation({
      ...updated,
      updatedAt: this.clock.now(),
      ...(current.referenceNumber === undefined
        ? { referenceNumber: undefined }
        : { referenceNumber: current.referenceNumber })
    })
    assertUpdateInvariants(current, candidate)
    if (definition.renderer.strategy === 'core'
      && !structurallyEqual(current.appearance, candidate.appearance)) {
      const builtInType = requireBuiltInType(definition, candidate.type, 'updateAnnotation')
      candidate = {
        ...candidate,
        rendererState: restyleBuiltInRendererState(
          definition,
          current.rendererState,
          builtInType,
          candidate.appearance
        )
      }
    }
    if (definition.renderer.strategy === 'core'
      && !structurallyEqual(current.content, candidate.content)) {
      const builtInType = requireBuiltInType(definition, candidate.type, 'updateAnnotation')
      candidate = {
        ...candidate,
        rendererState: updateBuiltInRendererContent(
          definition,
          candidate.rendererState,
          builtInType,
          candidate.content
        )
      }
    }
    if ('render' in definition.renderer) {
      this.annotationTypes.validate(candidate)
      candidate = {
        ...candidate,
        rendererState: buildAnnotationSceneRendererState(
          candidate,
          this.annotationTypes.renderControlled(candidate, 'updateAnnotation')
        )
      }
    }
    this.validateSnapshot(candidate)
    return this.repository.update(id, () => candidate)
  }

  /** Deeply updates appearance while preserving the annotation geometry. */
  public updateAppearance(id: string, appearance: AnnotationAppearanceInput): Annotation {
    this.assertActive('updateAppearance')
    const current = this.requireAnnotation(id, 'updateAppearance')
    this.requirePermission('annotation.edit', current)
    const definition = this.annotationTypes.require(current, 'updateAppearance')
    if ('render' in definition.renderer) {
      const nextAppearance = mergeCustomAppearance(current.appearance, appearance, definition)
      return this.updateAnnotation(id, (annotation) => ({ ...annotation, appearance: nextAppearance }))
    }
    const builtInType = requireBuiltInType(definition, current.type, 'updateAppearance')
    const nextAppearance = mergeAnnotationAppearance(builtInType, current.appearance, appearance)
    return this.repository.update(id, (annotation) => parseAnnotation({
      ...annotation,
      appearance: nextAppearance,
      rendererState: restyleBuiltInRendererState(
        definition,
        annotation.rendererState,
        builtInType,
        nextAppearance
      ),
      updatedAt: this.clock.now()
    }))
  }

  /** Applies exact validated renderer state after a transform. */
  public transformAnnotation(id: string, input: TransformAnnotationInput): Annotation {
    this.assertActive('transformAnnotation')
    const current = this.requireAnnotation(id, 'transformAnnotation')
    this.requirePermission('annotation.transform', current)
    const definition = this.annotationTypes.require(current, 'transformAnnotation')
    if (!Object.values(definition.capabilities.transform).some(Boolean)) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Annotation type does not support transforms.', {
        operation: 'transformAnnotation', annotationId: id, pageIndex: current.pageIndex
      })
    }
    if ('render' in definition.renderer) {
      validateBounds(input.bounds)
      const reduced = definition.interaction?.reduceTransform?.(
        deepFrozenAnnotation(current),
        { bounds: { ...input.bounds }, ...(current.typeData === undefined ? {} : { typeData: structuredClone(current.typeData) }) }
      ) ?? { bounds: { ...input.bounds }, ...(current.typeData === undefined ? {} : { typeData: structuredClone(current.typeData) }) }
      let candidate = parseAnnotation({
        ...current,
        bounds: reduced.bounds,
        typeData: reduced.typeData,
        updatedAt: this.clock.now()
      })
      this.annotationTypes.validate(candidate)
      candidate = {
        ...candidate,
        rendererState: buildAnnotationSceneRendererState(
          candidate,
          this.annotationTypes.renderControlled(candidate, 'transformAnnotation')
        )
      }
      return this.repository.update(id, () => candidate)
    }
    parseAndValidateKonvaSnapshot(input.serialized, {
      annotationId: id,
      pageIndex: current.pageIndex,
      operation: 'transformAnnotation'
    })
    return this.repository.update(id, (annotation) => ({
      ...annotation,
      bounds: input.bounds,
      rendererState: { engine: 'konva', schemaVersion: 1, serialized: input.serialized },
      updatedAt: this.clock.now()
    }))
  }

  /** Appends one canonical comment without changing renderer state. */
  public addComment(annotationId: string, comment: AnnotationComment): Annotation {
    this.assertActive('addComment')
    const annotation = this.requireAnnotation(annotationId, 'addComment')
    this.requirePermission('annotation.comment', annotation)
    if (annotation.comments.some((existing) => existing.id === comment.id)) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Comment ID already exists.', {
        operation: 'addComment', annotationId, pageIndex: annotation.pageIndex
      })
    }
    return this.repository.update(annotationId, (current) => parseAnnotation({
      ...current,
      comments: [...current.comments, comment],
      updatedAt: this.clock.now()
    }))
  }

  /** Updates one comment under comment-author permissions. */
  public updateComment(
    annotationId: string,
    commentId: string,
    updater: (comment: Readonly<AnnotationComment>) => AnnotationComment
  ): Annotation {
    this.assertActive('updateComment')
    const annotation = this.requireAnnotation(annotationId, 'updateComment')
    const comment = this.requireComment(annotation, commentId, 'updateComment')
    this.requirePermission('comment.edit', annotation, comment)
    return this.repository.update(annotationId, (current) => parseAnnotation({
      ...current,
      comments: current.comments.map((entry) => entry.id === commentId ? updater(entry) : entry),
      updatedAt: this.clock.now()
    }))
  }

  /** Changes one comment status under annotation-owner permissions. */
  public changeCommentStatus(
    annotationId: string,
    commentId: string,
    status: CommentStatus
  ): Annotation {
    this.assertActive('changeCommentStatus')
    const annotation = this.requireAnnotation(annotationId, 'changeCommentStatus')
    this.requireComment(annotation, commentId, 'changeCommentStatus')
    this.requirePermission('annotation.change-status', annotation)
    return this.repository.update(annotationId, (current) => parseAnnotation({
      ...current,
      comments: current.comments.map((entry) => entry.id === commentId ? { ...entry, status } : entry),
      updatedAt: this.clock.now()
    }))
  }

  /** Deletes one comment under comment-author permissions. */
  public deleteComment(annotationId: string, commentId: string): Annotation {
    this.assertActive('deleteComment')
    const annotation = this.requireAnnotation(annotationId, 'deleteComment')
    const comment = this.requireComment(annotation, commentId, 'deleteComment')
    this.requirePermission('comment.delete', annotation, comment)
    const commentIndex = annotation.comments.findIndex((entry) => entry.id === commentId)
    const updated = this.repository.update(annotationId, (current) => parseAnnotation({
      ...current,
      comments: current.comments.filter((entry) => entry.id !== commentId),
      updatedAt: this.clock.now()
    }))
    this.pushDeletion({ kind: 'comment', annotationId, comment, index: commentIndex })
    return updated
  }

  /** Deletes one permission-checked annotation. */
  public deleteAnnotation(id: string): Annotation | undefined {
    this.assertActive('deleteAnnotation')
    const annotation = this.repository.getById(id)
    if (annotation === undefined) return undefined
    this.requirePermission('annotation.delete', annotation)
    const removed = this.repository.remove(id)
    if (removed !== undefined) this.pushDeletion({ kind: 'annotation', annotation: removed })
    return removed
  }

  /** Returns whether the bounded deletion history contains a transaction. */
  public canUndoDeletion(): boolean {
    this.assertActive('canUndoDeletion')
    return this.deletionHistory.length > 0
  }

  /** Restores the most recent deletion while preserving canonical identity and ordering. */
  public undoLastDeletion(): Annotation | null {
    this.assertActive('undoLastDeletion')
    const transaction = this.deletionHistory.pop()
    if (transaction === undefined) return null
    if (transaction.kind === 'annotation') {
      if (this.repository.getById(transaction.annotation.id) !== undefined) return null
      this.repository.add(transaction.annotation)
      return cloneAnnotation(transaction.annotation)
    }
    const annotation = this.repository.getById(transaction.annotationId)
    if (annotation === undefined || annotation.comments.some((entry) => entry.id === transaction.comment.id)) {
      return null
    }
    return this.repository.update(transaction.annotationId, (current) => {
      const comments = [...current.comments]
      comments.splice(Math.min(transaction.index, comments.length), 0, transaction.comment)
      return parseAnnotation({ ...current, comments, updatedAt: this.clock.now() })
    })
  }

  /** Replaces canonical selection after repository validation. */
  public setSelection(
    selection: AnnotationSelection,
    source: AnnotationSelectionSource = 'programmatic',
    isClick = false
  ): void {
    this.assertActive('setSelection')
    this.pendingSelectionContext = { source, isClick }
    try {
      this.repository.setSelection(selection)
    } finally {
      this.pendingSelectionContext = null
    }
  }

  /** Coordinates transient hover channels without allowing one source to clear another. */
  public setHoveredAnnotation(
    id: string | null,
    source: AnnotationHoverSource = 'programmatic'
  ): void {
    this.assertActive('setHoveredAnnotation')
    if (id !== null && this.repository.getById(id) === undefined) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Hovered annotation does not exist.', {
        operation: 'setHoveredAnnotation', annotationId: id
      })
    }
    this.hoverBySource.delete(source)
    if (id !== null) this.hoverBySource.set(source, id)
    const effective = [...this.hoverBySource.entries()].at(-1)
    this.painter.setHovered(effective?.[1] ?? null)
    this.emit({
      type: 'hoverChanged',
      annotationId: effective?.[1] ?? null,
      source: effective?.[0] ?? null
    })
  }

  /** Navigates to an attached page and selects one annotation. */
  public navigateToAnnotation(id: string): boolean {
    this.assertActive('navigateToAnnotation')
    const annotation = this.repository.getById(id)
    if (annotation === undefined) return false
    const container = this.pageAttachments.get(annotation.pageIndex)?.container
    if (container === undefined) return false
    container.scrollIntoView({ block: 'center', inline: 'nearest' })
    this.setSelection({ ids: [id], primaryId: id }, 'navigation')
    return true
  }

  /** Subscribes to isolated canonical engine events. */
  public subscribe(listener: AnnotationEngineListener): () => void {
    this.assertActive('subscribe')
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Releases all instance-owned resources exactly once. */
  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const type of IMAGE_TOOLS) {
      this.imageCursorGenerations.set(type, (this.imageCursorGenerations.get(type) ?? 0) + 1)
    }
    this.detachKeyboardInteractions()
    for (const controller of this.inputControllers) controller.abort()
    this.inputControllers.clear()
    this.unsubscribeRepository()
    this.unsubscribeAnnotationTypes()
    this.painter.destroy()
    this.pageAttachments.clear()
    if (this.ownsRepository) this.repository.destroy()
    if (this.ownsAnnotationTypes) this.annotationTypes.destroy()
    if (this.root.dataset['inklayerInstance'] === this.instanceId) {
      delete this.root.dataset['inklayerInstance']
      delete this.root.dataset['inklayerTool']
      delete this.root.dataset['inklayerCreationController']
      delete this.root.dataset['inklayerImageAsset']
      this.root.style?.removeProperty('--inklayer-cursor-signature-asset')
      this.root.style?.removeProperty('--inklayer-cursor-stamp-asset')
      this.root.classList.remove('inklayer-engine')
    }
    this.emit({ type: 'destroyed' })
    this.listeners.clear()
    this.deletionHistory.splice(0)
  }

  /** Keeps a bounded, framework-neutral history of destructive commands. */
  private pushDeletion(transaction: DeletionTransaction): void {
    this.deletionHistory.push(structuredClone(transaction))
    if (this.deletionHistory.length > 100) this.deletionHistory.shift()
  }

  /** Registers root-scoped keyboard commands without overwriting host semantics. */
  private attachKeyboardInteractions(rootLabel = 'PDF annotation canvas'): void {
    if (typeof this.root.addEventListener !== 'function') return
    if (typeof this.root.setAttribute === 'function') {
      this.setOwnedRootAttribute('role', 'region')
      this.setOwnedRootAttribute('aria-label', rootLabel)
      if (this.keyboardEnabled) this.setOwnedRootAttribute('tabindex', '0')
    }
    if (!this.keyboardEnabled) return
    this.root.addEventListener('keydown', this.handleRootKeyDown)
    this.root.addEventListener('keyup', this.handleRootKeyUp)
  }

  /** Releases root keyboard handlers. */
  private detachKeyboardInteractions(): void {
    if (typeof this.root.removeEventListener === 'function' && this.keyboardEnabled) {
      this.root.removeEventListener('keydown', this.handleRootKeyDown)
      this.root.removeEventListener('keyup', this.handleRootKeyUp)
    }
    for (const [name, value] of this.ownedRootAttributes) {
      if (this.root.getAttribute?.(name) === value) this.root.removeAttribute?.(name)
    }
    this.ownedRootAttributes.clear()
  }

  private readonly handleRootKeyDown = (event: KeyboardEvent): void => {
    if (isEditableEventTarget(event.target)) return
    if (this.painter.handleKeyboard(event.key)) {
      event.preventDefault()
    } else if (isArrowKey(event.key)) {
      const step = event.shiftKey ? this.keyboardAcceleratedNudgeStep : this.keyboardNudgeStep
      const offset = keyboardOffset(event.key, step)
      if (this.painter.nudgeSelection(offset.x, offset.y)) event.preventDefault()
    } else if (event.key === 'Escape') {
      const changed = this.tool !== 'select' || this.repository.getSelection().ids.length > 0
      this.setTool('select')
      this.setSelection({ ids: [] }, 'canvas')
      if (changed) event.preventDefault()
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = this.repository.getSelection().ids
      for (const id of ids) {
        try {
          this.deleteAnnotation(id)
        } catch (cause) {
          this.emit({
            type: 'error',
            error: normalizeAnnotationEngineError(cause, 'keyboardDelete')
          })
        }
      }
      if (ids.length > 0) event.preventDefault()
    } else if (event.key === 'Alt' || event.key === 'Meta') {
      this.painter.setAuthorLabelShortcutVisible(true)
    }
  }

  private readonly handleRootKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Alt' || event.key === 'Meta') {
      this.painter.setAuthorLabelShortcutVisible(false)
    }
  }

  /** Focuses the direct-document command owner after a Canvas selection click. */
  private focusRoot(): void {
    if (typeof this.root.focus !== 'function') return
    try {
      this.root.focus({ preventScroll: true })
    } catch {
      this.root.focus()
    }
  }

  /** Adds one fallback host attribute and remembers only values owned by Core. */
  private setOwnedRootAttribute(name: string, value: string): void {
    if (this.root.hasAttribute(name)) return
    this.root.setAttribute(name, value)
    this.ownedRootAttributes.set(name, value)
  }

  /** Maps repository mutations to rendering and public canonical events. */
  private handleRepositoryEvent(event: AnnotationRepositoryEvent): void {
    if (this.destroyed) return
    switch (event.type) {
      case 'add':
        if (!this.acceptSnapshot(event.annotation)) break
        this.painter.render(this.presentationAnnotation(event.annotation))
        this.emit({ type: 'annotationAdded', annotation: event.annotation })
        break
      case 'update':
        if (!this.acceptSnapshot(event.annotation)) break
        if (event.previous.pageIndex !== event.annotation.pageIndex) {
          this.painter.remove(event.previous.id, event.previous.pageIndex)
        }
        this.painter.render(this.presentationAnnotation(event.annotation))
        this.emit({ type: 'annotationUpdated', annotation: event.annotation, previous: event.previous })
        break
      case 'remove':
        for (const [source, id] of this.hoverBySource) {
          if (id === event.annotation.id) this.hoverBySource.delete(source)
        }
        this.invalidSnapshotIds.delete(event.annotation.id)
        this.painter.remove(event.annotation.id, event.annotation.pageIndex)
        this.emit({ type: 'annotationDeleted', annotation: event.annotation })
        break
      case 'replace':
        this.invalidSnapshotIds.clear()
        for (const annotation of event.annotations) this.acceptSnapshot(annotation)
        this.painter.replace(event.annotations.filter((annotation) =>
          !this.invalidSnapshotIds.has(annotation.id))
          .map((annotation) => this.presentationAnnotation(annotation)))
        break
      case 'selection':
        this.painter.setSelection(event.selection.ids)
        this.emit({
          type: 'selectionChanged',
          selection: event.selection,
          source: this.pendingSelectionContext?.source ?? 'repository',
          isClick: this.pendingSelectionContext?.isClick ?? false
        })
        break
      case 'destroy':
        break
    }
  }

  /** Validates existing snapshots according to the configured load strategy. */
  private validateExistingSnapshots(
    strategy: AnnotationSnapshotStrategy,
    onWarning: ((warning: AnnotationEngineWarning) => void) | undefined
  ): void {
    for (const annotation of this.repository.getAll()) {
      try {
        this.validateSnapshot(annotation)
      } catch (cause) {
        if (strategy === 'strict') throw cause
        this.invalidSnapshotIds.add(annotation.id)
        const warning: AnnotationEngineWarning = {
          code: 'ANNOTATION_SKIPPED',
          message: 'Unsafe annotation renderer state was skipped.',
          annotationId: annotation.id,
          pageIndex: annotation.pageIndex,
          cause
        }
        onWarning?.(warning)
        this.logger.warn(warning.message, { annotationId: annotation.id, pageIndex: annotation.pageIndex })
      }
    }
  }

  /** Validates one annotation renderer state with canonical context. */
  private validateSnapshot(annotation: Annotation): void {
    const definition = this.annotationTypes.resolve(annotation)
    if (definition.status === 'available' && definition.definition.renderer.strategy === 'core') {
      parseAndValidateKonvaSnapshot(annotation.rendererState.serialized, {
        annotationId: annotation.id,
        pageIndex: annotation.pageIndex,
        operation: 'annotationEngineLoad'
      })
    } else {
      this.presentationAnnotation(annotation)
    }
    this.invalidSnapshotIds.delete(annotation.id)
  }

  /** Resolves a safe built-in, controlled custom, or Core placeholder snapshot. */
  private presentationAnnotation(annotation: Annotation): Annotation {
    const availability = this.annotationTypes.validate(annotation)
    if (availability.status === 'available'
      && availability.definition.renderer.strategy === 'core') {
      return cloneAnnotation(annotation)
    }
    const rendererState = availability.status === 'available'
      && 'render' in availability.definition.renderer
      ? buildAnnotationSceneRendererState(
          annotation,
          this.annotationTypes.renderControlled(annotation, 'renderAnnotation')
        )
      : buildUnavailableAnnotationRendererState(annotation)
    return { ...cloneAnnotation(annotation), rendererState }
  }

  /** Resolves private painter affordances from built-ins or compatible metadata. */
  private getTypeInteraction(annotation: Annotation): PainterTypeInteraction {
    const availability = this.annotationTypes.resolve(annotation)
    if (availability.status !== 'available' || availability.definition === undefined) {
      return { draggable: false, resizable: false, rotatable: false, transformMode: 'none' }
    }
    const capabilities = availability.definition.capabilities.transform
    const transformMode = capabilities.endpoints
      ? 'endpoints'
      : capabilities.vertices
        ? 'vertices'
        : capabilities.resize
          ? availability.definition.geometry === 'box' || availability.definition.geometry === 'text-box'
            ? 'box'
            : 'uniform'
          : capabilities.move
            ? 'move'
            : 'none'
    return {
      draggable: capabilities.move,
      resizable: capabilities.resize,
      rotatable: capabilities.rotate,
      transformMode
    }
  }

  /** Resolves one built-in or installed custom Definition by stable type ID. */
  private requireTypeDefinition(type: AnnotationTypeId, operation: string): AnnotationTypeDefinition {
    const definition = this.annotationTypes.get(type)
    if (definition === undefined) throw unavailableType(type, operation)
    return definition
  }

  /** Applies strict or lenient policy to one repository snapshot. */
  private acceptSnapshot(annotation: Annotation): boolean {
    try {
      this.validateSnapshot(annotation)
      return true
    } catch (cause) {
      if (this.snapshotStrategy === 'strict') throw cause
      this.invalidSnapshotIds.add(annotation.id)
      const warning: AnnotationEngineWarning = {
        code: 'ANNOTATION_SKIPPED',
        message: 'Unsafe annotation renderer state was skipped.',
        annotationId: annotation.id,
        pageIndex: annotation.pageIndex,
        cause
      }
      this.onWarning?.(warning)
      this.logger.warn(warning.message, { annotationId: annotation.id, pageIndex: annotation.pageIndex })
      this.emit({ type: 'warning', warning })
      return false
    }
  }

  /** Emits a detached event and isolates listener failures through Logger. */
  private emit(event: AnnotationEngineEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(cloneEngineEvent(event))
      } catch (cause) {
        this.logger.error('InkLayer Annotation Engine listener failed.', cause)
      }
    }
  }

  /** Returns an annotation or throws a structured not-found error. */
  private requireAnnotation(id: string, operation: string): Annotation {
    const annotation = this.repository.getById(id)
    if (annotation === undefined) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Annotation does not exist.', {
        operation, annotationId: id
      })
    }
    return annotation
  }

  /** Returns one comment or throws a structured not-found error. */
  private requireComment(
    annotation: Annotation,
    commentId: string,
    operation: string
  ): AnnotationComment {
    const comment = annotation.comments.find((entry) => entry.id === commentId)
    if (comment === undefined) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Comment does not exist.', {
        operation, annotationId: annotation.id, pageIndex: annotation.pageIndex
      })
    }
    return comment
  }

  /** Requires one canonical permission decision. */
  private requirePermission(
    action: Parameters<typeof canPerformAnnotationAction>[0]['action'],
    annotation?: Annotation,
    comment?: AnnotationComment
  ): void {
    const allowed = canPerformAnnotationAction({
      action,
      currentUser: this.currentUser,
      ...(annotation === undefined ? {} : { annotation }),
      ...(comment === undefined ? {} : { comment }),
      ...(this.permissions === undefined ? {} : { permissions: this.permissions })
    })
    if (!allowed) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Annotation operation is not permitted.', {
        operation: action,
        ...(annotation === undefined ? {} : { annotationId: annotation.id, pageIndex: annotation.pageIndex })
      })
    }
  }

  /** Returns the canonical direct-transform decision for painter affordances. */
  private canTransform(annotation: Annotation): boolean {
    return canPerformAnnotationAction({
      action: 'annotation.transform',
      currentUser: this.currentUser,
      annotation,
      ...(this.permissions === undefined ? {} : { permissions: this.permissions })
    })
  }

  /** Prevents business operations after engine destruction. */
  private assertActive(operation: string): void {
    if (this.destroyed) {
      throw new InkLayerError('ENGINE_DESTROYED', 'Annotation Engine has been destroyed.', { operation })
    }
  }
}

const PERSISTED_ANNOTATION_TYPES: readonly AnnotationType[] = [
  'highlight', 'strikeout', 'underline', 'free-text', 'rectangle', 'circle',
  'freehand', 'free-highlight', 'signature', 'stamp', 'note', 'line', 'arrow',
  'polygon', 'polyline', 'cloud'
]

const IMAGE_TOOLS: readonly AnnotationImageTool[] = ['signature', 'stamp']

type DeletionTransaction =
  | { kind: 'annotation'; annotation: Annotation }
  | { kind: 'comment'; annotationId: string; comment: AnnotationComment; index: number }

/** Excludes text-entry controls from global annotation keyboard commands. */
function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.matches('input, textarea, select, [contenteditable="true"]')
}

/** Returns the union of non-empty selection rectangles. */
function unionBounds(rects: readonly AnnotationBounds[]): AnnotationBounds {
  const first = rects[0]
  if (first === undefined) throw new RangeError('Cannot union an empty rectangle collection.')
  for (const rect of rects) validateBounds(rect)
  let left = first.x
  let top = first.y
  let right = first.x + first.width
  let bottom = first.y + first.height
  for (const rect of rects.slice(1)) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Validates that caller-supplied geometry still represents one resolved source range. */
function validateResolvedTextRange(range: PdfResolvedTextRange): void {
  if (!Number.isSafeInteger(range.pageIndex) || range.pageIndex < 0
    || !Number.isSafeInteger(range.start) || range.start < 0
    || !Number.isSafeInteger(range.length) || range.length <= 0
    || range.text.length !== range.length || range.rects.length === 0) {
    throw new InkLayerError('ANNOTATION_INVALID', 'Resolved text range is invalid.', {
      operation: 'createTextMarkupsFromRanges', pageIndex: range.pageIndex
    })
  }
  for (const rect of range.rects) {
    validateBounds(rect)
    if (rect.width === 0 || rect.height === 0) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Resolved text range has empty geometry.', {
        operation: 'createTextMarkupsFromRanges', pageIndex: range.pageIndex
      })
    }
  }
}

/** Validates finite non-negative bounds used before canonical parsing. */
function validateBounds(bounds: AnnotationBounds): void {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width < 0 || bounds.height < 0
    || [bounds.x, bounds.y, bounds.width, bounds.height].some((value) => Math.abs(value) > 1_000_000_000)) {
    throw new InkLayerError('ANNOTATION_INVALID', 'Annotation bounds are invalid.', {
      operation: 'validateBounds'
    })
  }
}

/** Validates tool-specific creation input before snapshot construction. */
function validateCreationInput(input: CreateAnnotationInput): void {
  validateBounds(input.bounds)
  if (!Number.isSafeInteger(input.pageIndex) || input.pageIndex < 0) {
    throw new InkLayerError('ANNOTATION_INVALID', 'Annotation pageIndex is invalid.', {
      operation: 'createAnnotation'
    })
  }
  if (input.points !== undefined && (input.points.length > 100_000
    || input.points.some((point) => !Number.isFinite(point)))) {
    throw new InkLayerError('ANNOTATION_INVALID', 'Annotation points are invalid or oversized.', {
      operation: 'createAnnotation', pageIndex: input.pageIndex
    })
  }
  if (input.strokes !== undefined) {
    const pointCount = input.strokes.reduce((count, stroke) => count + stroke.length, 0)
    if ((isBuiltInAnnotationType(input.type)
      && input.type !== 'freehand' && input.type !== 'signature')
      || input.strokes.length === 0 || pointCount > 100_000
      || input.strokes.some((stroke) => stroke.length < 4 || stroke.length % 2 !== 0
        || stroke.some((point) => !Number.isFinite(point)))) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Annotation strokes are invalid or oversized.', {
        operation: 'createAnnotation', pageIndex: input.pageIndex
      })
    }
  }
  if (input.pathData !== undefined && input.pathData.length > 1_000_000) {
    throw new InkLayerError('ANNOTATION_INVALID', 'Annotation path data is oversized.', {
      operation: 'createAnnotation', pageIndex: input.pageIndex
    })
  }
  input.textRects?.forEach(validateBounds)
}

/** Normalizes gesture geometry into the explicit persisted Signature model. */
function normalizeCreationContent(input: CreateAnnotationInput): AnnotationContent | undefined {
  if (input.type !== 'signature' || input.content?.signature !== undefined) return input.content
  const strokes = input.strokes ?? (input.points === undefined ? undefined : [input.points])
  if (strokes === undefined) return input.content
  return {
    ...(input.content ?? { text: '' }),
    signature: { kind: 'ink', strokes: strokes.map((stroke) => [...stroke]) }
  }
}

/** Merges custom Appearance under Definition-declared component support. */
function mergeCustomAppearance(
  base: AnnotationAppearance,
  override: AnnotationAppearanceInput | undefined,
  definition: AnnotationTypeDefinition
): AnnotationAppearance {
  if (override === undefined) return structuredClone(base)
  const supported = definition.capabilities.appearance
  if (!supported.opacity && override.opacity !== undefined) {
    throw new InkLayerError('ANNOTATION_INVALID', 'Custom annotation opacity is not editable.', {
      operation: 'mergeCustomAppearance'
    })
  }
  for (const component of ['stroke', 'fill', 'text'] as const) {
    if (!supported[component] && override[component] !== undefined) {
      throw new InkLayerError('ANNOTATION_INVALID', `Custom annotation ${component} is not editable.`, {
        operation: 'mergeCustomAppearance'
      })
    }
  }
  const merge = <T extends object>(current: T | null, next: Partial<T> | null | undefined): T | null => {
    if (next === undefined) return current === null ? null : { ...current }
    if (next === null) return null
    if (current === null) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Custom appearance cannot enable a missing component.', {
        operation: 'mergeCustomAppearance'
      })
    }
    return { ...current, ...next }
  }
  const result: AnnotationAppearance = {
    opacity: override.opacity ?? base.opacity,
    stroke: merge(base.stroke, override.stroke),
    fill: merge(base.fill, override.fill),
    text: merge(base.text, override.text)
  }
  try {
    validateAnnotationAppearance(result)
  } catch (cause) {
    throw new InkLayerError('ANNOTATION_INVALID', 'Custom annotation appearance is invalid.', {
      operation: 'mergeCustomAppearance', cause
    })
  }
  return result
}

/** Supplies extension callbacks a detached recursively frozen annotation. */
function deepFrozenAnnotation(annotation: Readonly<Annotation>): Readonly<Annotation> {
  const detached = cloneAnnotation(annotation as Annotation)
  deepFreeze(detached)
  return detached
}

/** Recursively freezes one detached extension input. */
function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const entry of Object.values(value)) deepFreeze(entry)
}

/** Creates a type-level unavailable error when no annotation instance exists. */
function unavailableType(type: AnnotationTypeId, operation: string): InkLayerError {
  return new InkLayerError('ANNOTATION_TYPE_UNAVAILABLE', `Annotation type "${type}" is unavailable.`, {
    operation
  })
}

/** Projects Definition creation metadata to the established Engine API. */
function definitionCreationMode(definition: AnnotationTypeDefinition): AnnotationCreationMode {
  return definition.capabilities.creationMode === 'one-shot' ? 'once' : 'continuous'
}

/** Narrows the protected Core renderer marker back to its reserved identity. */
function requireBuiltInType(
  definition: AnnotationTypeDefinition,
  type: AnnotationTypeId,
  operation: string
): AnnotationType {
  if (definition.renderer.strategy === 'core' && isBuiltInAnnotationType(type)) return type
  throw unavailableType(type, operation)
}

/** Restricts image-backed V1 annotations to browser/PDF-export-compatible payloads. */
function validateImageContent(
  type: AnnotationType,
  content: AnnotationContent | undefined,
  pageIndex: number
): void {
  const source = type === 'stamp'
    ? content?.image
    : type === 'signature' && content?.signature?.kind === 'image'
      ? content.signature.image
      : undefined
  if (source === undefined) return
  validateImageSource(source, pageIndex, 'createAnnotation')
}

/** Validates and detaches one application-provided image placement asset. */
function normalizeImageAsset(
  type: AnnotationImageTool,
  asset: AnnotationImageAsset
): AnnotationImageAsset {
  validateImageSource(asset.image, undefined, 'setImageAsset')
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height)
    || asset.width <= 0 || asset.height <= 0
    || asset.width > 1_000_000 || asset.height > 1_000_000) {
    throw new InkLayerError('ANNOTATION_INVALID', `${type} image dimensions are invalid.`, {
      operation: 'setImageAsset'
    })
  }
  if (asset.text !== undefined && asset.text.length > 10_000) {
    throw new InkLayerError('ANNOTATION_INVALID', `${type} image text is oversized.`, {
      operation: 'setImageAsset'
    })
  }
  return { ...asset }
}

/** Restricts image payloads to the browser and PDF-export V1 raster contract. */
function validateImageSource(
  source: string,
  pageIndex: number | undefined,
  operation: string
): void {
  if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\s]+$/.test(source)
    || source.length > 10_000_000) {
    throw new InkLayerError(
      'ANNOTATION_INVALID',
      'Image annotations require a PNG or JPEG data URL no larger than 10MB.',
      { operation, ...(pageIndex === undefined ? {} : { pageIndex }) }
    )
  }
}

/** Validates bounded page-space keyboard movement configuration. */
function validateKeyboardStep(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000) {
    throw new InkLayerError('ANNOTATION_INVALID', `Keyboard ${name} must be between 0 and 1,000.`, {
      operation: 'createAnnotationEngine'
    })
  }
  return value
}

/** Narrows keyboard keys to the four direct-manipulation directions. */
function isArrowKey(key: string): key is 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
}

/** Converts one direction and step into an unscaled page-space offset. */
function keyboardOffset(
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  step: number
): { x: number; y: number } {
  if (key === 'ArrowLeft') return { x: -step, y: 0 }
  if (key === 'ArrowRight') return { x: step, y: 0 }
  if (key === 'ArrowUp') return { x: 0, y: -step }
  return { x: 0, y: step }
}

/** Clones normalized text selection containers. */
function cloneTextSelection(selection: AnnotationTextSelection): AnnotationTextSelection {
  return { pageIndex: selection.pageIndex, text: selection.text, rects: selection.rects.map((rect) => ({ ...rect })) }
}

/** Projects canonical page geometry into page-overlay CSS pixels. */
function scaleBounds(bounds: AnnotationBounds, scale: number): AnnotationBounds {
  return {
    x: bounds.x * scale,
    y: bounds.y * scale,
    width: bounds.width * scale,
    height: bounds.height * scale
  }
}

/** Rejects generic updates that bypass canonical geometry and identity commands. */
function assertUpdateInvariants(current: Annotation, candidate: Annotation): void {
  const unchanged = current.id === candidate.id
    && current.schemaVersion === candidate.schemaVersion
    && current.type === candidate.type
    && current.pageIndex === candidate.pageIndex
    && current.coordinateSpace === candidate.coordinateSpace
    && structurallyEqual(current.bounds, candidate.bounds)
    && structurallyEqual(current.rendererState, candidate.rendererState)
  if (!unchanged) {
    throw new InkLayerError(
      'ANNOTATION_INVALID',
      'Generic annotation updates cannot change identity, type, page, bounds, coordinate space, or renderer state.',
      { operation: 'updateAnnotation', annotationId: current.id, pageIndex: current.pageIndex }
    )
  }
}

/** Compares detached canonical JSON-compatible values without retaining references. */
function structurallyEqual(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

/** Clones engine event containers before listener delivery. */
function cloneEngineEvent(event: AnnotationEngineEvent): AnnotationEngineEvent {
  switch (event.type) {
    case 'annotationAdded':
      return { type: 'annotationAdded', annotation: cloneAnnotation(event.annotation) }
    case 'annotationUpdated':
      return {
        type: 'annotationUpdated',
        annotation: cloneAnnotation(event.annotation),
        previous: cloneAnnotation(event.previous)
      }
    case 'annotationDeleted':
      return { type: 'annotationDeleted', annotation: cloneAnnotation(event.annotation) }
    case 'selectionChanged':
      return {
        type: 'selectionChanged',
        selection: {
          ids: [...event.selection.ids],
          ...(event.selection.primaryId === undefined ? {} : { primaryId: event.selection.primaryId })
        },
        source: event.source,
        isClick: event.isClick
      }
    case 'hoverChanged':
      return { ...event }
    case 'textSelected':
      return { type: 'textSelected', selection: cloneTextSelection(event.selection) }
    case 'toolChanged':
      return { type: 'toolChanged', tool: event.tool }
    case 'imageAssetRequired':
      return { type: 'imageAssetRequired', tool: event.tool }
    case 'warning':
      return { type: 'warning', warning: { ...event.warning } }
    case 'error':
      return { type: 'error', error: event.error }
    case 'destroyed':
      return { type: 'destroyed' }
  }
}

/** Normalizes internal interaction failures to the shared structured error. */
function normalizeAnnotationEngineError(cause: unknown, operation: string): InkLayerError {
  return cause instanceof InkLayerError
    ? cause
    : new InkLayerError('ANNOTATION_INVALID', 'Annotation interaction failed.', { operation, cause })
}
