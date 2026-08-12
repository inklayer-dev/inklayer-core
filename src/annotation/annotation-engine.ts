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
  type AnnotationType
} from '../domain/annotation'
import {
  getAnnotationAppearanceCapabilities,
  mergeAnnotationAppearance,
  resolveAnnotationAppearance,
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
  AnnotationEngineWarning,
  AnnotationTextSelection
} from './events'
import {
  createKonvaPainter,
  type AnnotationAuthorLabelVisibility,
  type AnnotationPageAttachment,
  type AnnotationPainter
} from './internal/painter/konva-painter'
import {
  buildToolRendererState,
  restyleToolRendererState
} from '../renderer/konva/snapshot-builder'
import type { AnnotationTool } from './tools'

/** Snapshot strategy used when existing repository data contains unsafe Konva JSON. */
export type AnnotationSnapshotStrategy = 'strict' | 'lenient'

/** Annotation creation input shared by every persisted tool. */
export interface CreateAnnotationInput {
  /** Optional stable ID, generated when omitted. */
  id?: string
  /** Persisted annotation type. */
  type: AnnotationType
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
  /** Initial author/reference Tag visibility; defaults to `auto`. */
  authorLabelVisibility?: AnnotationAuthorLabelVisibility
}

/** Public framework-independent Annotation Engine facade. */
export interface AnnotationEngine {
  /** Stable engine instance ID. */
  readonly instanceId: string
  /** Canonical repository used as the sole annotation source. */
  readonly repository: AnnotationRepository
  /** Attaches one page renderer. */
  attachPage(attachment: AnnotationPageAttachment): Promise<void>
  /** Detaches one page renderer. */
  detachPage(pageIndex: number): void
  /** Returns the current transient or persisted tool. */
  getTool(): AnnotationTool
  /** Changes the current tool. */
  setTool(tool: AnnotationTool): void
  /** Returns a detached complete appearance for a persisted annotation type. */
  getToolAppearance(type: AnnotationType): AnnotationAppearance
  /** Deeply updates the appearance used by future creations of one type. */
  setToolAppearance(type: AnnotationType, appearance: AnnotationAppearanceInput): AnnotationAppearance
  /** Returns which appearance controls are meaningful for one type. */
  getAppearanceCapabilities(type: AnnotationType): AnnotationAppearanceCapabilities
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
  /** Creates highlight, strikeout, or underline from normalized text selection. */
  createTextMarkup(
    type: 'highlight' | 'strikeout' | 'underline',
    selection: AnnotationTextSelection,
    appearance?: AnnotationAppearanceInput
  ): Annotation
  /** Opens the configured text input and creates FreeText on submit. */
  requestFreeText(pageIndex: number, bounds: AnnotationBounds): Promise<Annotation | null>
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
  /** Replaces repository selection. */
  setSelection(selection: AnnotationSelection): void
  /** Applies transient hover feedback. */
  setHoveredAnnotation(id: string | null): void
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
  private readonly ownsRepository: boolean
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
  private currentUser: User | null
  private permissions: AnnotationPermissions | undefined
  private tool: AnnotationTool = 'select'
  private readonly toolAppearances = new Map<AnnotationType, AnnotationAppearance>()
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
    this.root = options.root
    this.repository = options.repository ?? createMemoryAnnotationRepository()
    this.ownsRepository = options.repository === undefined
    this.currentUser = options.currentUser ?? null
    this.permissions = options.permissions
    this.clock = options.clock ?? createSystemClock()
    this.idGenerator = options.idGenerator ?? createDefaultIdGenerator('annotation')
    this.logger = options.logger ?? createDefaultLogger()
    this.textInputProvider = options.textInputProvider ?? createBrowserTextInputProvider()
    this.snapshotStrategy = options.snapshotStrategy ?? 'lenient'
    this.onWarning = options.onWarning
    this.instanceId = this.idGenerator.next()
    for (const type of PERSISTED_ANNOTATION_TYPES) {
      this.toolAppearances.set(type, resolveAnnotationAppearance(type, options.defaultAppearances?.[type]))
    }
    this.painter = createKonvaPainter({
      instanceId: this.instanceId,
      ...(options.authorLabelVisibility === undefined
        ? {}
        : { authorLabelVisibility: options.authorLabelVisibility }),
      getAnnotationsByPage: (pageIndex) => this.repository.getByPage(pageIndex)
        .filter((annotation) => !this.invalidSnapshotIds.has(annotation.id)),
      onSelect: (annotationId) => this.setSelection({ ids: [annotationId], primaryId: annotationId }),
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
      getAppearance: (type) => this.getToolAppearance(type),
      canTransform: (annotation) => this.canTransform(annotation),
      onCreate: (gesture) => {
        try {
          this.createAnnotation({
            type: gesture.type,
            pageIndex: gesture.pageIndex,
            bounds: gesture.bounds,
            ...(gesture.points === undefined ? {} : { points: gesture.points }),
            ...(gesture.strokes === undefined ? {} : { strokes: gesture.strokes })
          })
        } catch (cause) {
          this.emit({ type: 'error', error: normalizeAnnotationEngineError(cause, 'pointerCreate') })
        }
      },
      onRequestFreeText: (pageIndex, bounds) => {
        void this.requestFreeText(pageIndex, bounds).catch((cause: unknown) => {
          this.emit({ type: 'error', error: normalizeAnnotationEngineError(cause, 'requestFreeText') })
        })
      },
      onClearSelection: () => this.setSelection({ ids: [] }),
      onHover: (annotationId) => this.setHoveredAnnotation(annotationId),
      ...(options.freehandMergeDelayMs === undefined
        ? {}
        : { freehandMergeDelayMs: options.freehandMergeDelayMs })
    })
    this.validateExistingSnapshots(this.snapshotStrategy, this.onWarning)
    this.root.classList.add('inklayer-engine')
    this.root.dataset['inklayerInstance'] = this.instanceId
    this.root.dataset['inklayerTool'] = this.tool
    this.unsubscribeRepository = this.repository.subscribe((event) => this.handleRepositoryEvent(event))
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

  /** Changes the current tool and root-scoped state. */
  public setTool(tool: AnnotationTool): void {
    this.assertActive('setTool')
    if (this.tool === tool) return
    this.tool = tool
    this.root.dataset['inklayerTool'] = tool
    this.painter.setTool(tool)
    this.emit({ type: 'toolChanged', tool })
  }

  /** Returns a detached complete tool appearance. */
  public getToolAppearance(type: AnnotationType): AnnotationAppearance {
    this.assertActive('getToolAppearance')
    return structuredClone(this.toolAppearances.get(type) ?? resolveAnnotationAppearance(type))
  }

  /** Updates future creation and live preview appearance for one type. */
  public setToolAppearance(
    type: AnnotationType,
    appearance: AnnotationAppearanceInput
  ): AnnotationAppearance {
    this.assertActive('setToolAppearance')
    const next = mergeAnnotationAppearance(type, this.getToolAppearance(type), appearance)
    this.toolAppearances.set(type, next)
    this.painter.setTool(this.tool)
    return structuredClone(next)
  }

  /** Returns renderer-independent controls supported by one type. */
  public getAppearanceCapabilities(type: AnnotationType): AnnotationAppearanceCapabilities {
    this.assertActive('getAppearanceCapabilities')
    return getAnnotationAppearanceCapabilities(type)
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
    const id = input.id ?? this.idGenerator.next()
    const author = this.currentUser ?? { id: 'null', name: 'Anonymous' }
    const appearance = mergeAnnotationAppearance(
      input.type,
      this.getToolAppearance(input.type),
      input.appearance
    )
    const rendererState = buildToolRendererState({
      id,
      type: input.type,
      bounds: input.bounds,
      ...(input.content === undefined ? {} : { content: input.content }),
      appearance,
      ...(input.points === undefined ? {} : { points: input.points }),
      ...(input.strokes === undefined ? {} : { strokes: input.strokes }),
      ...(input.pathData === undefined ? {} : { pathData: input.pathData }),
      ...(input.textRects === undefined ? {} : { textRects: input.textRects })
    })
    let annotation = parseAnnotation({
      id,
      schemaVersion: 1,
      type: input.type,
      pageIndex: input.pageIndex,
      bounds: input.bounds,
      coordinateSpace: 'konva-stage',
      comments: [],
      author,
      createdAt: this.clock.now(),
      native: false,
      rendererState,
      ...(input.content === undefined ? {} : { content: input.content }),
      appearance
    })
    annotation = assignAnnotationReferenceNumber(annotation, this.repository.getAll())
    this.repository.add(annotation)
    return cloneAnnotation(annotation)
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
    return this.createAnnotation({
      type,
      pageIndex: selection.pageIndex,
      bounds: unionBounds(selection.rects),
      textRects: selection.rects,
      content: { text: '', selectedText: selection.text },
      ...(appearance === undefined ? {} : { appearance })
    })
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
        signal: controller.signal
      })
      if (result.value === null || this.destroyed) return null
      return this.createAnnotation({
        type: 'free-text', pageIndex, bounds: pageBounds, content: { text: result.value }
      })
    } finally {
      this.inputControllers.delete(controller)
    }
  }

  /** Applies one permission-checked semantic update. */
  public updateAnnotation(id: string, updater: AnnotationUpdater): Annotation {
    this.assertActive('updateAnnotation')
    const current = this.requireAnnotation(id, 'updateAnnotation')
    this.requirePermission('annotation.edit', current)
    const updated = updater(current)
    const candidate = parseAnnotation({
      ...updated,
      updatedAt: this.clock.now(),
      ...(current.referenceNumber === undefined
        ? { referenceNumber: undefined }
        : { referenceNumber: current.referenceNumber })
    })
    this.validateSnapshot(candidate)
    return this.repository.update(id, () => candidate)
  }

  /** Deeply updates appearance while preserving the annotation geometry. */
  public updateAppearance(id: string, appearance: AnnotationAppearanceInput): Annotation {
    this.assertActive('updateAppearance')
    const current = this.requireAnnotation(id, 'updateAppearance')
    this.requirePermission('annotation.edit', current)
    const nextAppearance = mergeAnnotationAppearance(current.type, current.appearance, appearance)
    return this.repository.update(id, (annotation) => parseAnnotation({
      ...annotation,
      appearance: nextAppearance,
      rendererState: restyleToolRendererState(
        annotation.rendererState,
        annotation.type,
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
    return this.repository.update(annotationId, (current) => parseAnnotation({
      ...current,
      comments: current.comments.filter((entry) => entry.id !== commentId),
      updatedAt: this.clock.now()
    }))
  }

  /** Deletes one permission-checked annotation. */
  public deleteAnnotation(id: string): Annotation | undefined {
    this.assertActive('deleteAnnotation')
    const annotation = this.repository.getById(id)
    if (annotation === undefined) return undefined
    this.requirePermission('annotation.delete', annotation)
    return this.repository.remove(id)
  }

  /** Replaces canonical selection after repository validation. */
  public setSelection(selection: AnnotationSelection): void {
    this.assertActive('setSelection')
    this.repository.setSelection(selection)
  }

  /** Applies transient renderer hover state. */
  public setHoveredAnnotation(id: string | null): void {
    this.assertActive('setHoveredAnnotation')
    if (id !== null && this.repository.getById(id) === undefined) return
    this.painter.setHovered(id)
  }

  /** Navigates to an attached page and selects one annotation. */
  public navigateToAnnotation(id: string): boolean {
    this.assertActive('navigateToAnnotation')
    const annotation = this.repository.getById(id)
    if (annotation === undefined) return false
    const container = this.pageAttachments.get(annotation.pageIndex)?.container
    if (container === undefined) return false
    container.scrollIntoView({ block: 'center', inline: 'nearest' })
    this.setSelection({ ids: [id], primaryId: id })
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
    for (const controller of this.inputControllers) controller.abort()
    this.inputControllers.clear()
    this.unsubscribeRepository()
    this.painter.destroy()
    this.pageAttachments.clear()
    if (this.ownsRepository) this.repository.destroy()
    if (this.root.dataset['inklayerInstance'] === this.instanceId) {
      delete this.root.dataset['inklayerInstance']
      delete this.root.dataset['inklayerTool']
      this.root.classList.remove('inklayer-engine')
    }
    this.emit({ type: 'destroyed' })
    this.listeners.clear()
  }

  /** Maps repository mutations to rendering and public canonical events. */
  private handleRepositoryEvent(event: AnnotationRepositoryEvent): void {
    if (this.destroyed) return
    switch (event.type) {
      case 'add':
        if (!this.acceptSnapshot(event.annotation)) break
        this.painter.render(event.annotation)
        this.emit({ type: 'annotationAdded', annotation: event.annotation })
        break
      case 'update':
        if (!this.acceptSnapshot(event.annotation)) break
        if (event.previous.pageIndex !== event.annotation.pageIndex) {
          this.painter.remove(event.previous.id, event.previous.pageIndex)
        }
        this.painter.render(event.annotation)
        this.emit({ type: 'annotationUpdated', annotation: event.annotation, previous: event.previous })
        break
      case 'remove':
        this.invalidSnapshotIds.delete(event.annotation.id)
        this.painter.remove(event.annotation.id, event.annotation.pageIndex)
        this.emit({ type: 'annotationDeleted', annotation: event.annotation })
        break
      case 'replace':
        this.invalidSnapshotIds.clear()
        for (const annotation of event.annotations) this.acceptSnapshot(annotation)
        this.painter.replace(event.annotations.filter((annotation) =>
          !this.invalidSnapshotIds.has(annotation.id)))
        break
      case 'selection':
        this.painter.setSelection(event.selection.ids)
        this.emit({ type: 'selectionChanged', selection: event.selection })
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
    parseAndValidateKonvaSnapshot(annotation.rendererState.serialized, {
      annotationId: annotation.id,
      pageIndex: annotation.pageIndex,
      operation: 'annotationEngineLoad'
    })
    this.invalidSnapshotIds.delete(annotation.id)
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
    if (input.type !== 'freehand' || input.strokes.length === 0 || pointCount > 100_000
      || input.strokes.some((stroke) => stroke.length < 4 || stroke.length % 2 !== 0
        || stroke.some((point) => !Number.isFinite(point)))) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Freehand strokes are invalid or oversized.', {
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
        }
      }
    case 'textSelected':
      return { type: 'textSelected', selection: cloneTextSelection(event.selection) }
    case 'toolChanged':
      return { type: 'toolChanged', tool: event.tool }
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
