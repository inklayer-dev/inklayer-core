/**
 * @file Instance-owned internal Konva painter.
 * @description Owns Stage, Layer, Transformer, nodes, author labels, page
 * listeners, scaling, selection, hover, and teardown for one Annotation Engine.
 */

import type Konva from 'konva'
import type {
  Annotation,
  AnnotationAppearance,
  AnnotationContent,
  AnnotationTypeId
} from '../../../domain/annotation'
import type {
  AnnotationCreationController,
  AnnotationGeometryKind
} from '../../../annotation-types/contracts'
import { parseAnnotationColor } from '../../../domain/color'
import { InkLayerError } from '../../../domain/errors'
import { parseAndValidateKonvaSnapshot } from '../../../renderer/konva/snapshot'
import { buildCloudPathFromPoints } from '../../../renderer/konva/snapshot-builder'
import type { AnnotationTool, AnnotationTransformMode } from '../../tools'
import type {
  AnnotationAccessibilityOptions,
  AnnotationAuthorLabelVisibility,
  AnnotationImageAsset,
  AnnotationImageTool,
  AnnotationInteractionTheme,
  AnnotationPageAttachment
} from '../../contracts'

/** Internal painter construction options. */
export interface KonvaPainterOptions {
  /** Unique engine instance identifier used for event namespaces. */
  instanceId: string
  /** Initial Tag visibility; defaults to selected-or-hovered auto mode. */
  authorLabelVisibility?: AnnotationAuthorLabelVisibility
  /** Canvas selection affordance theme. */
  interactionTheme?: AnnotationInteractionTheme
  /** Returns current annotations for one page attachment. */
  getAnnotationsByPage: (pageIndex: number) => readonly Annotation[]
  /** Handles annotation selection initiated from a Konva node. */
  onSelect: (annotationId: string, source: 'canvas' | 'accessibility') => void
  /** Handles a completed drag or transform with exact serialized state. */
  onTransform: (annotationId: string, bounds: Annotation['bounds'], serialized: string) => void
  /** Returns the current Annotation Engine tool. */
  getTool: () => AnnotationTool
  /** Resolves the Core-owned creation controller through the Type Registry. */
  getCreationController: (type: AnnotationTypeId) => AnnotationCreationController
  /** Resolves preview geometry through the same protected Definition. */
  getGeometry: (type: AnnotationTypeId) => AnnotationGeometryKind
  /** Returns the complete current appearance used by creation previews. */
  getAppearance: (type: AnnotationTypeId) => AnnotationAppearance
  /** Returns the current application-provided image for an image placement tool. */
  getImageAsset: (type: AnnotationImageTool) => AnnotationImageAsset | null
  /** Resolves direct-manipulation metadata without indexing unknown type IDs. */
  getTypeInteraction: (annotation: Annotation) => PainterTypeInteraction
  /** Returns whether the current identity may directly transform an annotation. */
  canTransform: (annotation: Annotation) => boolean
  /** Returns whether an annotation may enter print-safe raster composition. */
  canPrint: (annotation: Annotation) => boolean
  /** Creates an annotation after an instance-owned pointer gesture. */
  onCreate: (gesture: PainterCreationGesture) => void
  /** Requests application UI when an image placement tool has no prepared asset. */
  onImageAssetRequired: (type: AnnotationImageTool) => void
  /** Opens instance-owned free-text input after a click gesture. */
  onRequestFreeText: (pageIndex: number, bounds: Annotation['bounds']) => void
  /** Opens instance-owned text input for an existing FreeText or Note. */
  onRequestEditText: (annotationId: string) => void
  /** Clears selection after a background click in select mode. */
  onClearSelection: () => void
  /** Publishes Canvas hover so labels and product adapters share one state. */
  onHover: (annotationId: string | null) => void
  /** Localized semantics for Core-owned direct-document controls. */
  accessibility?: AnnotationAccessibilityOptions
  /** Idle interval that merges successive Freehand strokes; defaults to 1,000ms. */
  freehandMergeDelayMs?: number
}

/** Minimal normalized interaction metadata consumed by the private painter. */
export interface PainterTypeInteraction {
  /** Whether direct dragging is enabled. */
  draggable: boolean
  /** Whether bounds handles are enabled. */
  resizable: boolean
  /** Whether rotation handles are enabled. */
  rotatable: boolean
  /** Private geometry controller selected for the Transformer. */
  transformMode: AnnotationTransformMode
}

/** Completed geometry emitted by internal pointer editors. */
export interface PainterCreationGesture {
  /** Persisted annotation type. */
  type: AnnotationTypeId
  /** Zero-based page index. */
  pageIndex: number
  /** Completed Stage-space bounds. */
  bounds: Annotation['bounds']
  /** Semantic content prepared by image placement or another pointer editor. */
  content?: AnnotationContent
  /** Absolute Stage points for line and path tools. */
  points?: readonly number[]
  /** Independent Freehand strokes committed as one annotation. */
  strokes?: readonly (readonly number[])[]
}

/** Resources owned by one attached page. */
interface PageResources {
  /** Attached page index. */
  pageIndex: number
  /** Konva Stage owned by this engine. */
  stage: Konva.Stage
  /** Annotation drawing layer. */
  layer: Konva.Layer
  /** Selection transformer. */
  transformer: Konva.Transformer
  /** DOM overlay for author labels. */
  labels: HTMLDivElement
  /** Keyboard-accessible semantic alternatives for canvas annotations. */
  accessibility: HTMLDivElement
  /** Caller-owned page container carrying only reversible instance metadata. */
  container: HTMLDivElement
  /** Rendered groups by annotation ID. */
  nodes: Map<string, Konva.Group>
  /** Canonical annotations corresponding to rendered nodes. */
  annotations: Map<string, Annotation>
  /** Pending or loaded DOM images by annotation ID. */
  images: Map<string, HTMLImageElement[]>
  /** Active drag or multi-point gesture for this page. */
  gesture: PainterGestureState | null
  /** Non-persisted shape that follows the active creation gesture. */
  gesturePreview: Konva.Shape | null
  /** Clickable first-vertex marker used to close multi-point shapes. */
  gestureStartHandle: Konva.Rect | null
  /** Geometry handles that never enter serialized annotation state. */
  pointControls: PointControl[]
  /** Freehand strokes waiting for the idle merge window to expire. */
  pendingFreehand: PendingFreehandBatch | null
  /** Removes the temporary document-level pointer release fallback. */
  pointerReleaseCleanup: (() => void) | null
}

/** One page-local delayed Freehand commit with persistent transient previews. */
interface PendingFreehandBatch {
  /** Successive pointer strokes in absolute Stage coordinates. */
  strokes: number[][]
  /** Preview lines retained until the batch becomes canonical. */
  previews: Konva.Line[]
  /** Instance-owned idle timer. */
  timer: ReturnType<typeof setTimeout> | null
}

/** One layer-owned endpoint or vertex handle mapped to a line child point. */
interface PointControl {
  /** Visible draggable handle. */
  node: Konva.Circle
  /** Annotation group whose local transform maps the point to the page. */
  group: Konva.Group
  /** Line or Arrow node containing editable point pairs. */
  shape: Konva.Line
  /** X-coordinate index in the shape point array. */
  pointIndex: number
}

/** Mutable pointer gesture owned by one page. */
interface PainterGestureState {
  /** Tool captured when the gesture began. */
  type: AnnotationTypeId
  /** Registry-provided geometry captured for the complete gesture. */
  geometry: AnnotationGeometryKind
  /** Registry-provided controller captured for the complete gesture. */
  controller: AnnotationCreationController
  /** Absolute Stage points in x/y pairs. */
  points: number[]
  /** Whether the gesture waits for double-click completion. */
  multiPoint: boolean
}

/** Minimal internal renderer API consumed by the Annotation Engine. */
export interface AnnotationPainter {
  /** Attaches or replaces one page overlay. */
  attachPage(attachment: AnnotationPageAttachment): Promise<void>
  /** Detaches one page and destroys its resources. */
  detachPage(pageIndex: number): void
  /** Adds or replaces one rendered annotation. */
  render(annotation: Annotation): void
  /** Removes one rendered annotation. */
  remove(annotationId: string, pageIndex: number): void
  /** Reconciles all attached pages to a complete repository collection. */
  replace(annotations: readonly Annotation[]): void
  /** Applies the current repository selection. */
  setSelection(ids: readonly string[]): void
  /** Reconfigures direct manipulation after a tool change. */
  setTool(tool: AnnotationTool): void
  /** Applies transient hover styling to one annotation. */
  setHovered(annotationId: string | null): void
  /** Returns the current author-label visibility policy. */
  getAuthorLabelVisibility(): AnnotationAuthorLabelVisibility
  /** Replaces the transient author-label visibility policy. */
  setAuthorLabelVisibility(visibility: AnnotationAuthorLabelVisibility): void
  /** Temporarily reveals Tags while the platform shortcut is held. */
  setAuthorLabelShortcutVisible(visible: boolean): void
  /** Cancels or steps back one active drawing gesture. */
  handleKeyboard(key: string): boolean
  /** Moves every selected, transformable annotation in page-space coordinates. */
  nudgeSelection(deltaX: number, deltaY: number): boolean
  /** Renders one attached annotation page without selection affordances. */
  renderPageRaster(pageIndex: number, pixelRatio?: number): HTMLCanvasElement
  /** Destroys every attached page idempotently. */
  destroy(): void
}

/** Core-owned author/reference Tag visibility policy. */
/** Creates an instance-owned Konva painter without importing Konva at root load. */
export function createKonvaPainter(options: KonvaPainterOptions): AnnotationPainter {
  return new KonvaPainter(options)
}

/** Concrete multi-page painter hidden behind the Annotation Engine. */
class KonvaPainter implements AnnotationPainter {
  private readonly options: KonvaPainterOptions
  private readonly pages = new Map<number, PageResources>()
  private readonly attachmentGenerations = new Map<number, number>()
  private KonvaModule: typeof Konva | null = null
  private selectionIds: readonly string[] = []
  private hoveredId: string | null = null
  private authorLabelVisibility: AnnotationAuthorLabelVisibility
  private authorLabelShortcutVisible = false
  private destroyed = false

  /** Creates one painter with instance-local registries. */
  public constructor(options: KonvaPainterOptions) {
    this.options = options
    this.authorLabelVisibility = options.authorLabelVisibility ?? 'auto'
  }

  /** Attaches a fully owned Stage, Layer, Transformer, and labels overlay. */
  public async attachPage(attachment: AnnotationPageAttachment): Promise<void> {
    this.assertActive()
    validateAttachment(attachment)
    const generation = (this.attachmentGenerations.get(attachment.pageIndex) ?? 0) + 1
    this.attachmentGenerations.set(attachment.pageIndex, generation)
    this.destroyPage(attachment.pageIndex)
    const module = await import('konva')
    this.assertActive()
    if (this.attachmentGenerations.get(attachment.pageIndex) !== generation) return
    const KonvaRuntime = module.default
    this.KonvaModule = KonvaRuntime
    const stage = new KonvaRuntime.Stage({
      container: attachment.container,
      width: attachment.width * (attachment.scale ?? 1),
      height: attachment.height * (attachment.scale ?? 1),
      scaleX: attachment.scale ?? 1,
      scaleY: attachment.scale ?? 1
    })
    const layer = new KonvaRuntime.Layer()
    const transformer = new KonvaRuntime.Transformer({
      rotateEnabled: false,
      flipEnabled: false,
      anchorSize: 10,
      anchorCornerRadius: 5,
      anchorFill: this.options.interactionTheme?.handleFill ?? '#ffffff',
      anchorStroke: this.options.interactionTheme?.accentColor ?? '#1677ff',
      anchorStrokeWidth: 1.5,
      borderStroke: this.options.interactionTheme?.accentColor ?? '#1677ff',
      borderStrokeWidth: 1.5,
      padding: 2,
      rotateAnchorOffset: 22,
      rotationSnaps: [0, 90, 180, 270],
      rotationSnapTolerance: 5
    })
    layer.add(transformer)
    stage.add(layer)
    const labels = attachment.container.ownerDocument.createElement('div')
    labels.className = 'inklayer-author-labels'
    labels.dataset['inklayerInstance'] = this.options.instanceId
    attachment.container.append(labels)
    const accessibility = attachment.container.ownerDocument.createElement('div')
    accessibility.className = 'inklayer-annotation-a11y-list'
    accessibility.setAttribute('role', 'group')
    accessibility.setAttribute(
      'aria-label',
      this.options.accessibility?.pageLabel?.(attachment.pageIndex)
        ?? `Annotations on page ${attachment.pageIndex + 1}`
    )
    attachment.container.append(accessibility)
    attachment.container.dataset['inklayerPage'] = String(attachment.pageIndex)
    attachment.container.dataset['inklayerInstance'] = this.options.instanceId
    const resources: PageResources = {
      pageIndex: attachment.pageIndex,
      stage,
      layer,
      transformer,
      labels,
      accessibility,
      container: attachment.container,
      nodes: new Map(),
      annotations: new Map(),
      images: new Map(),
      gesture: null,
      gesturePreview: null,
      gestureStartHandle: null,
      pointControls: [],
      pendingFreehand: null,
      pointerReleaseCleanup: null
    }
    this.pages.set(attachment.pageIndex, resources)
    this.attachPointerEditors(resources)
    for (const annotation of this.options.getAnnotationsByPage(attachment.pageIndex)) {
      this.render(annotation)
    }
    this.applySelection()
  }

  /** Detaches one page without affecting another engine or page. */
  public detachPage(pageIndex: number): void {
    this.attachmentGenerations.set(pageIndex, (this.attachmentGenerations.get(pageIndex) ?? 0) + 1)
    this.destroyPage(pageIndex)
  }

  /** Destroys page resources without changing attachment generation. */
  private destroyPage(pageIndex: number): void {
    const resources = this.pages.get(pageIndex)
    if (resources === undefined) return
    if (this.destroyed) this.cancelFreehandBatch(resources)
    else this.flushFreehandBatch(resources)
    resources.pointerReleaseCleanup?.()
    const namespace = `.inklayer-${this.options.instanceId}`
    for (const node of resources.nodes.values()) node.off(namespace)
    resources.nodes.clear()
    resources.annotations.clear()
    for (const images of resources.images.values()) releaseImages(images)
    resources.images.clear()
    clearGesturePreview(resources)
    clearPointControls(resources)
    resources.transformer.destroy()
    resources.layer.destroy()
    resources.stage.destroy()
    resources.labels.remove()
    resources.accessibility.remove()
    if (resources.container.dataset['inklayerInstance'] === this.options.instanceId) {
      delete resources.container.dataset['inklayerPage']
      delete resources.container.dataset['inklayerInstance']
    }
    this.pages.delete(pageIndex)
  }

  /** Validates then adds or replaces one annotation group. */
  public render(annotation: Annotation): void {
    const resources = this.pages.get(annotation.pageIndex)
    const KonvaRuntime = this.KonvaModule
    if (resources === undefined || KonvaRuntime === null) return
    parseAndValidateKonvaSnapshot(annotation.rendererState.serialized, {
      annotationId: annotation.id,
      pageIndex: annotation.pageIndex,
      operation: 'renderAnnotation'
    })
    resources.nodes.get(annotation.id)?.destroy()
    clearPointControls(resources)
    releaseImages(resources.images.get(annotation.id) ?? [])
    const node = KonvaRuntime.Node.create(annotation.rendererState.serialized)
    if (node.getClassName() !== 'Group') throw new Error('Validated Konva root did not create a Group.')
    const group = node as Konva.Group
    configureHitRegions(group, resources.stage.scaleX())
    if (annotation.native) addInteractionHitTarget(KonvaRuntime, group, annotation.bounds)
    group.listening(this.options.getTool() === 'select')
    group.draggable(this.options.getTool() === 'select'
      && this.selectionIds.includes(annotation.id)
      && this.options.getTypeInteraction(annotation).draggable
      && this.options.canTransform(annotation))
    group.dragBoundFunc((position) => clampDragPosition(group, resources, position))
    const namespace = `.inklayer-${this.options.instanceId}`
    group.on(`click${namespace} tap${namespace}`, (event) => {
      event.cancelBubble = true
      if (this.options.getTool() === 'select') this.options.onSelect(annotation.id, 'canvas')
    })
    group.on(`dblclick${namespace} dbltap${namespace}`, (event) => {
      event.cancelBubble = true
      if (this.options.getTool() === 'select'
        && (annotation.type === 'free-text' || annotation.type === 'note')) {
        this.options.onRequestEditText(annotation.id)
      }
    })
    group.on(`mouseenter${namespace}`, () => this.options.onHover(annotation.id))
    group.on(`mouseleave${namespace}`, () => this.options.onHover(null))
    group.on(`dragmove${namespace} transform${namespace}`, () => {
      this.updateAuthorLabelPosition(resources, annotation.id, group)
      positionPointControls(resources)
      resources.layer.batchDraw()
    })
    group.on(`dragend${namespace} transformend${namespace}`, () => {
      this.commitTransform(resources, annotation.id, group)
    })
    resources.nodes.set(annotation.id, group)
    resources.annotations.set(annotation.id, structuredClone(annotation))
    resources.images.set(annotation.id, hydrateImageNodes(group, resources))
    resources.layer.add(group)
    this.renderAuthorLabel(resources, annotation)
    this.renderAccessibilityItem(resources, annotation)
    this.applyHover(group, annotation, annotation.id === this.hoveredId)
    this.applySelection()
    resources.layer.batchDraw()
  }

  /** Removes one group and its instance-owned author label. */
  public remove(annotationId: string, pageIndex: number): void {
    const resources = this.pages.get(pageIndex)
    if (resources === undefined) return
    resources.nodes.get(annotationId)?.destroy()
    clearPointControls(resources)
    resources.nodes.delete(annotationId)
    resources.annotations.delete(annotationId)
    releaseImages(resources.images.get(annotationId) ?? [])
    resources.images.delete(annotationId)
    findAuthorLabel(resources.labels, annotationId)?.remove()
    findAccessibilityItem(resources.accessibility, annotationId)?.remove()
    this.applySelection()
    resources.layer.batchDraw()
  }

  /** Reconciles attached page nodes to a complete annotation collection. */
  public replace(annotations: readonly Annotation[]): void {
    for (const resources of this.pages.values()) {
      for (const node of resources.nodes.values()) node.destroy()
      resources.nodes.clear()
      resources.annotations.clear()
      for (const images of resources.images.values()) releaseImages(images)
      resources.images.clear()
      clearPointControls(resources)
      resources.labels.replaceChildren()
      resources.accessibility.replaceChildren()
    }
    for (const annotation of annotations) this.render(annotation)
    this.applySelection()
  }

  /** Stores and applies selected node IDs across attached pages. */
  public setSelection(ids: readonly string[]): void {
    this.selectionIds = [...ids]
    this.applySelection()
  }

  /** Refreshes direct-manipulation state after a tool change. */
  public setTool(_tool: AnnotationTool): void {
    for (const resources of this.pages.values()) {
      this.flushFreehandBatch(resources)
      resources.gesture = null
      resources.pointerReleaseCleanup?.()
      resources.pointerReleaseCleanup = null
      clearGesturePreview(resources)
    }
    this.applySelection()
  }

  /** Restores the previous hover and applies the next hover. */
  public setHovered(annotationId: string | null): void {
    this.hoveredId = annotationId
    for (const resources of this.pages.values()) {
      for (const [id, node] of resources.nodes) {
        const annotation = resources.annotations.get(id)
        if (annotation !== undefined) this.applyHover(node, annotation, id === annotationId)
      }
      this.refreshAuthorLabelVisibility(resources)
      resources.layer.batchDraw()
    }
  }

  /** Returns the current Tag policy. */
  public getAuthorLabelVisibility(): AnnotationAuthorLabelVisibility {
    return this.authorLabelVisibility
  }

  /** Replaces the Tag policy without rebuilding annotations. */
  public setAuthorLabelVisibility(visibility: AnnotationAuthorLabelVisibility): void {
    this.authorLabelVisibility = visibility
    for (const resources of this.pages.values()) this.refreshAuthorLabelVisibility(resources)
  }

  /** Applies temporary keyboard reveal without mutating the persistent policy. */
  public setAuthorLabelShortcutVisible(visible: boolean): void {
    this.authorLabelShortcutVisible = visible
    for (const resources of this.pages.values()) this.refreshAuthorLabelVisibility(resources)
  }

  /** Cancels the current gesture or removes its latest multi-point vertex. */
  public handleKeyboard(key: string): boolean {
    for (const resources of this.pages.values()) {
      const gesture = resources.gesture
      if (gesture === null) continue
      if (key === 'Escape') {
        resources.gesture = null
        clearGesturePreview(resources)
        return true
      }
      if (key === 'Backspace' && gesture.multiPoint && gesture.points.length > 2) {
        gesture.points.splice(-2, 2)
        const lastX = gesture.points.at(-2) ?? 0
        const lastY = gesture.points.at(-1) ?? 0
        this.updateGesturePreview(resources, gesture, { x: lastX, y: lastY })
        return true
      }
    }
    return false
  }

  /** Nudges selected movable groups and commits through the canonical transform path. */
  public nudgeSelection(deltaX: number, deltaY: number): boolean {
    let moved = false
    for (const resources of this.pages.values()) {
      for (const annotationId of this.selectionIds) {
        const annotation = resources.annotations.get(annotationId)
        const group = resources.nodes.get(annotationId)
        if (annotation === undefined || group === undefined
          || !this.options.getTypeInteraction(annotation).draggable
          || !this.options.canTransform(annotation)) continue
        const current = group.getAbsolutePosition()
        const next = clampDragPosition(group, resources, {
          x: current.x + deltaX,
          y: current.y + deltaY
        })
        if (next.x === current.x && next.y === current.y) continue
        group.setAbsolutePosition(next)
        group.opacity(annotation.appearance.opacity)
        this.options.onTransform(annotationId, {
          ...annotation.bounds,
          x: annotation.bounds.x + (next.x - current.x) / resources.stage.scaleX(),
          y: annotation.bounds.y + (next.y - current.y) / resources.stage.scaleY()
        }, serializeWithoutHitRegions(group))
        moved = true
      }
    }
    return moved
  }

  /** Captures one page while excluding Transformer and edit controls. */
  public renderPageRaster(pageIndex: number, pixelRatio = 1): HTMLCanvasElement {
    this.assertActive()
    const resources = this.pages.get(pageIndex)
    if (resources === undefined || !Number.isFinite(pixelRatio)
      || pixelRatio <= 0 || pixelRatio > 4) {
      throw new InkLayerError('ANNOTATION_INVALID', 'Annotation page raster request is invalid.', {
        operation: 'renderPageRaster', pageIndex
      })
    }
    const transformerVisible = resources.transformer.visible()
    resources.transformer.visible(false)
    for (const control of resources.pointControls) control.node.visible(false)
    const hiddenForPrint: Konva.Group[] = []
    for (const [annotationId, annotation] of resources.annotations) {
      const node = resources.nodes.get(annotationId)
      if (node !== undefined && node.visible() && !this.options.canPrint(annotation)) {
        node.visible(false)
        hiddenForPrint.push(node)
      }
    }
    resources.layer.draw()
    try {
      return resources.stage.toCanvas({ pixelRatio })
    } finally {
      resources.transformer.visible(transformerVisible)
      for (const control of resources.pointControls) control.node.visible(true)
      for (const node of hiddenForPrint) node.visible(true)
      resources.layer.draw()
    }
  }

  /** Destroys every page and makes repeated calls harmless. */
  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const pageIndex of [...this.pages.keys()]) this.detachPage(pageIndex)
    this.KonvaModule = null
    this.attachmentGenerations.clear()
    this.selectionIds = []
    this.hoveredId = null
  }

  /** Updates all page transformers from the current selection IDs. */
  private applySelection(): void {
    for (const resources of this.pages.values()) {
      const nodes = this.selectionIds.flatMap((id) => {
        const node = resources.nodes.get(id)
        return node === undefined ? [] : [node]
      })
      const primaryId = this.selectionIds[0]
      const primary = primaryId === undefined ? undefined : resources.annotations.get(primaryId)
      const tool = this.options.getTool()
      for (const [id, node] of resources.nodes) {
        const annotation = resources.annotations.get(id)
        node.listening(tool === 'select')
        node.draggable(tool === 'select' && this.selectionIds.includes(id)
          && annotation !== undefined
          && this.options.getTypeInteraction(annotation).draggable
          && this.options.canTransform(annotation))
      }
      configureTransformer(
        resources,
        primary === undefined ? undefined : this.options.getTypeInteraction(primary),
        tool,
        primary !== undefined && this.options.canTransform(primary)
      )
      clearPointControls(resources)
      const usesPointControls = tool === 'select' && primary !== undefined
        && this.createPointControls(resources, primary)
      resources.transformer.nodes(tool === 'select' && !usesPointControls ? nodes : [])
      for (const child of resources.accessibility.children) {
        const item = child as HTMLButtonElement
        item.setAttribute('aria-pressed', String(
          item.dataset['annotationId'] !== undefined
            && this.selectionIds.includes(item.dataset['annotationId'])
        ))
      }
      this.refreshAuthorLabelVisibility(resources)
      resources.layer.batchDraw()
    }
  }

  /** Applies non-persistent visual hover feedback. */
  private applyHover(node: Konva.Group, annotation: Annotation, hovered: boolean): void {
    node.opacity(annotation.appearance.opacity * (hovered ? 0.82 : 1))
  }

  /** Creates or replaces one author label owned by the page overlay. */
  private renderAuthorLabel(resources: PageResources, annotation: Annotation): void {
    findAuthorLabel(resources.labels, annotation.id)?.remove()
    const label = resources.labels.ownerDocument.createElement('span')
    label.className = 'inklayer-author-label'
    label.dataset['annotationId'] = annotation.id
    label.textContent = annotation.referenceNumber === undefined
      ? annotation.author.name
      : `${annotation.author.name} · #${annotation.referenceNumber}`
    resources.labels.append(label)
    this.positionAuthorLabel(resources, label, annotation.bounds.x, annotation.bounds.y)
    this.applyAuthorLabelVisibility(label, annotation.id)
    this.resolveAuthorLabelLayout(resources)
  }

  /** Mirrors one canvas annotation into a keyboard-accessible list item. */
  private renderAccessibilityItem(resources: PageResources, annotation: Annotation): void {
    const existing = findAccessibilityItem(resources.accessibility, annotation.id)
    const button = (existing as HTMLButtonElement | undefined)
      ?? resources.accessibility.ownerDocument.createElement('button')
    if (existing === undefined) {
      button.type = 'button'
      button.dataset['annotationId'] = annotation.id
      button.addEventListener('focus', () => this.options.onHover(annotation.id))
      button.addEventListener('blur', () => this.options.onHover(null))
      button.addEventListener('click', () => this.options.onSelect(annotation.id, 'accessibility'))
      resources.accessibility.append(button)
    }
    const label = this.options.accessibility?.annotationLabel?.(structuredClone(annotation))
      ?? annotationAccessibilityLabel(annotation)
    button.textContent = label
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', String(this.selectionIds.includes(annotation.id)))
  }

  /** Applies policy precedence: hidden, always, then selected-or-hovered auto. */
  private applyAuthorLabelVisibility(label: HTMLElement, annotationId: string): void {
    const visible = this.authorLabelShortcutVisible || this.authorLabelVisibility === 'always'
      || (this.authorLabelVisibility === 'auto'
        && (this.hoveredId === annotationId || this.selectionIds.includes(annotationId)))
    label.hidden = !visible
  }

  /** Refreshes all labels on one attached page after transient state changes. */
  private refreshAuthorLabelVisibility(resources: PageResources): void {
    for (const child of resources.labels.children) {
      const label = child as HTMLElement
      const annotationId = label.dataset['annotationId']
      if (annotationId !== undefined) this.applyAuthorLabelVisibility(label, annotationId)
    }
    this.resolveAuthorLabelLayout(resources)
  }

  /** Tracks one author label continuously during direct manipulation. */
  private updateAuthorLabelPosition(
    resources: PageResources,
    annotationId: string,
    group: Konva.Group
  ): void {
    const label = findAuthorLabel(resources.labels, annotationId)
    if (label === undefined) return
    const bounds = group.getClientRect({ relativeTo: resources.stage })
    this.positionAuthorLabel(resources, label, bounds.x, bounds.y)
    this.resolveAuthorLabelLayout(resources)
  }

  /** Projects one unscaled page coordinate into the DOM overlay viewport. */
  private positionAuthorLabel(
    resources: PageResources,
    label: HTMLElement,
    pageX: number,
    pageY: number
  ): void {
    const x = pageX * resources.stage.scaleX()
    const y = pageY * resources.stage.scaleY()
    label.dataset['anchorX'] = String(x)
    label.dataset['anchorY'] = String(y)
    label.style.left = `${x}px`
    label.style.top = `${y}px`
  }

  /** Clamps visible Tags and offsets deterministic overlaps in document order. */
  private resolveAuthorLabelLayout(resources: PageResources): void {
    const placed: Array<{ left: number; top: number; right: number; bottom: number }> = []
    for (const child of resources.labels.children) {
      const label = child as HTMLElement
      if (label.hidden) continue
      const anchorX = Number(label.dataset['anchorX'] ?? 0)
      const anchorY = Number(label.dataset['anchorY'] ?? 0)
      const width = Math.min(Number.isFinite(label.offsetWidth) ? label.offsetWidth : 0, 160)
      const height = Number.isFinite(label.offsetHeight) ? label.offsetHeight : 0
      const containerWidth = resources.stage.width()
      const containerHeight = resources.stage.height()
      const below = anchorY < height + 4
      const left = Math.min(Math.max(anchorX, 0), Math.max(containerWidth - width, 0))
      let top = below ? anchorY : anchorY - height
      let attempts = 0
      while (attempts < placed.length + 1
        && placed.some((box) => rectanglesOverlap(
          { left, top, right: left + width, bottom: top + height }, box
        ))) {
        top += below ? height + 2 : -(height + 2)
        attempts += 1
      }
      top = Math.min(Math.max(top, 0), Math.max(containerHeight - height, 0))
      label.style.left = `${left}px`
      label.style.top = `${top}px`
      label.style.transform = 'none'
      placed.push({ left, top, right: left + width, bottom: top + height })
    }
  }

  /** Creates endpoint or vertex handles for one selected line-based annotation. */
  private createPointControls(resources: PageResources, annotation: Annotation): boolean {
    const mode = this.options.getTypeInteraction(annotation).transformMode
    if (mode !== 'endpoints' && mode !== 'vertices') return false
    const group = resources.nodes.get(annotation.id)
    const KonvaRuntime = this.KonvaModule
    if (group === undefined || KonvaRuntime === null) return false
    const shape = (group.findOne('Arrow') ?? group.findOne('Line')) as Konva.Line | undefined
    if (shape === undefined || typeof shape.points !== 'function') return false
    const points = shape.points()
    if (points.length < 4 || points.length % 2 !== 0) return false
    const editableIndexes = mode === 'endpoints' ? [0, points.length - 2] : pointIndexes(points)
    const namespace = `.inklayer-${this.options.instanceId}`
    for (const pointIndex of editableIndexes) {
      const handle = new KonvaRuntime.Circle({
        radius: 5,
        fill: this.options.interactionTheme?.handleFill ?? '#ffffff',
        stroke: this.options.interactionTheme?.accentColor ?? '#1677ff',
        strokeWidth: 1.5,
        draggable: true,
        name: 'inklayer-point-control'
      })
      const control: PointControl = { node: handle, group, shape, pointIndex }
      handle.dragBoundFunc((position) => clampControlPosition(resources, position))
      handle.on(`dragmove${namespace}`, (event) => {
        event.cancelBubble = true
        updatePointFromControl(control)
        this.updateAuthorLabelPosition(resources, annotation.id, group)
        resources.layer.batchDraw()
      })
      handle.on(`dragend${namespace}`, (event) => {
        event.cancelBubble = true
        updatePointFromControl(control)
        this.commitTransform(resources, annotation.id, group)
      })
      resources.pointControls.push(control)
      resources.layer.add(handle)
    }
    positionPointControls(resources)
    return true
  }

  /** Serializes one completed direct manipulation without transient controls. */
  private commitTransform(
    resources: PageResources,
    annotationId: string,
    group: Konva.Group
  ): void {
    const hovered = annotationId === this.hoveredId
    const annotation = resources.annotations.get(annotationId)
    group.opacity(annotation?.appearance.opacity ?? 1)
    const bounds = group.getClientRect({ relativeTo: resources.stage })
    const serialized = serializeWithoutHitRegions(group)
    if (annotation !== undefined) this.applyHover(group, annotation, hovered)
    this.options.onTransform(annotationId, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    }, serialized)
  }

  /** Attaches page-scoped pointer editors for the current tool. */
  private attachPointerEditors(resources: PageResources): void {
    const namespace = `.inklayer-${this.options.instanceId}`
    resources.stage.on(`mousedown${namespace} touchstart${namespace}`, (event) => {
      if (event.target === resources.gestureStartHandle) return
      const tool = this.options.getTool()
      const point = resources.stage.getRelativePointerPosition()
      if (point === null) return
      if (tool === 'select' || tool === 'text-select') {
        if (tool === 'select' && event.target === resources.stage) this.options.onClearSelection()
        return
      }
      const controller = this.options.getCreationController(tool)
      if (controller === 'text-selection' || controller === 'image-placement') return
      // FreeText starts after the completed click/tap below. Opening and focusing
      // an input during pointer-down allows the same native gesture to blur it.
      if (controller === 'text-input') return
      if (controller === 'point') {
        this.options.onCreate({
          type: tool, pageIndex: resources.pageIndex,
          bounds: { x: point.x, y: point.y, width: 24, height: 24 }
        })
        return
      }
      const multiPoint = controller === 'polyline'
      if (controller === 'freehand' && tool === 'freehand') this.pauseFreehandCommit(resources)
      if (multiPoint && resources.gesture?.type === tool) {
        resources.gesture.points.push(point.x, point.y)
      } else {
        resources.gesture = {
          type: tool,
          geometry: this.options.getGeometry(tool),
          controller,
          points: [point.x, point.y],
          multiPoint
        }
        // Only closed multi-point tools expose a clickable first vertex.
        // Polyline is intentionally open and finishes with a double-click.
        if (multiPoint && (tool === 'polygon' || tool === 'cloud')) {
          this.createGestureStartHandle(resources, point)
        }
      }
      this.updateGesturePreview(resources, resources.gesture, point)
      if (!multiPoint) this.capturePointerRelease(resources)
    })
    resources.stage.on(`mousemove${namespace} touchmove${namespace}`, () => {
      const gesture = resources.gesture
      const point = resources.stage.getRelativePointerPosition()
      if (gesture === null || point === null) return
      if (gesture.multiPoint) {
        this.updateGesturePreview(resources, gesture, point)
        return
      }
      if (gesture.type === 'freehand' || gesture.type === 'free-highlight') {
        gesture.points.push(point.x, point.y)
      } else if (gesture.points.length === 2) {
        gesture.points.push(point.x, point.y)
      } else {
        gesture.points.splice(2, 2, point.x, point.y)
      }
      this.updateGesturePreview(resources, gesture, point)
    })
    resources.stage.on(`mouseup${namespace} touchend${namespace}`, () => {
      this.finishSinglePointGesture(resources)
    })
    resources.stage.on(`click${namespace} tap${namespace}`, () => {
      const tool = this.options.getTool()
      const point = resources.stage.getRelativePointerPosition()
      if (point === null) return
      const controller = tool === 'select' || tool === 'text-select'
        ? undefined
        : this.options.getCreationController(tool)
      if (controller === 'text-input') {
        this.options.onRequestFreeText(resources.pageIndex, {
          x: point.x, y: point.y, width: 160, height: 40
        })
        return
      }
      if (controller !== 'image-placement' || !isImageTool(tool)) return
      const asset = this.options.getImageAsset(tool)
      if (asset === null) {
        this.options.onImageAssetRequired(tool)
        return
      }
      const pageWidth = resources.stage.width() / Math.max(resources.stage.scaleX(), 0.01)
      const pageHeight = resources.stage.height() / Math.max(resources.stage.scaleY(), 0.01)
      const width = Math.min(asset.width, pageWidth)
      const height = Math.min(asset.height, pageHeight)
      const bounds = {
        x: Math.max(0, Math.min(point.x - width / 2, pageWidth - width)),
        y: Math.max(0, Math.min(point.y - height / 2, pageHeight - height)),
        width,
        height
      }
      const text = asset.text ?? (tool === 'signature' ? 'Signature' : 'Stamp')
      this.options.onCreate({
        type: tool,
        pageIndex: resources.pageIndex,
        bounds,
        content: tool === 'signature'
          ? { text, signature: { kind: 'image', image: asset.image } }
          : { text, image: asset.image }
      })
    })
    resources.stage.on(`dblclick${namespace} dbltap${namespace}`, () => {
      this.finishMultiPointGesture(resources)
    })
  }

  /** Adds a fixed-size first-vertex target that completes a multi-point gesture. */
  private createGestureStartHandle(
    resources: PageResources,
    point: { x: number; y: number }
  ): void {
    const KonvaRuntime = this.KonvaModule
    if (KonvaRuntime === null) return
    resources.gestureStartHandle?.destroy()
    const scale = Math.max(resources.stage.scaleX(), 0.01)
    const size = 12 / scale
    const normalStroke = '#64748b'
    const hoverStroke = this.options.interactionTheme?.accentColor ?? '#1677ff'
    const handle = new KonvaRuntime.Rect({
      x: point.x - size / 2,
      y: point.y - size / 2,
      width: size,
      height: size,
      fill: this.options.interactionTheme?.handleFill ?? '#ffffff',
      stroke: normalStroke,
      strokeWidth: 1.5 / scale,
      cornerRadius: 2 / scale,
      dash: [4 / scale, 2 / scale],
      hitStrokeWidth: 10 / scale,
      name: 'inklayer-gesture-start-handle'
    })
    const namespace = `.inklayer-${this.options.instanceId}`
    handle.on(`mouseenter${namespace}`, () => {
      handle.stroke(hoverStroke)
      resources.layer.batchDraw()
    })
    handle.on(`mouseleave${namespace}`, () => {
      handle.stroke(normalStroke)
      resources.layer.batchDraw()
    })
    handle.on(`mouseup${namespace} touchend${namespace}`, (event) => {
      event.cancelBubble = true
      this.finishMultiPointGesture(resources)
    })
    resources.gestureStartHandle = handle
    resources.layer.add(handle)
    handle.moveToTop()
  }

  /** Completes a valid multi-point gesture without discarding an incomplete one. */
  private finishMultiPointGesture(resources: PageResources): void {
    const gesture = resources.gesture
    if (gesture === null || !gesture.multiPoint) return
    const points = removeConsecutiveDuplicatePoints(gesture.points)
    if (points.length < 6) return
    const completedPoints = gesture.type === 'polygon' || gesture.type === 'cloud'
      ? closePointLoop(points)
      : points
    resources.gesture = null
    clearGesturePreview(resources)
    this.completeGesture(resources.pageIndex, { ...gesture, points: completedPoints })
  }

  /** Updates one non-persisted shape continuously from the active pointer gesture. */
  private updateGesturePreview(
    resources: PageResources,
    gesture: PainterGestureState,
    pointer: { x: number; y: number }
  ): void {
    const KonvaRuntime = this.KonvaModule
    if (KonvaRuntime === null) return
    const previewPoints = gesture.multiPoint
      ? [...gesture.points, pointer.x, pointer.y]
      : [...gesture.points]
    const desiredClass = gesture.type === 'rectangle'
      ? 'Rect'
      : gesture.type === 'circle'
        ? 'Ellipse'
        : gesture.type === 'arrow'
          ? 'Arrow'
          : gesture.type === 'cloud'
            ? 'Path'
            : gesture.geometry === 'box' || gesture.geometry === 'text-box'
              ? 'Rect'
              : 'Line'
    if (resources.gesturePreview?.getClassName() !== desiredClass) {
      clearGesturePreviewShape(resources)
      resources.gesturePreview = createGesturePreview(
        KonvaRuntime,
        desiredClass,
        this.options.getAppearance(gesture.type)
      )
      resources.layer.add(resources.gesturePreview)
    }
    const preview = resources.gesturePreview
    if (preview === null) return
    preview.setAttrs(gesturePreviewAttributes(gesture, previewPoints))
    preview.moveToTop()
    resources.gestureStartHandle?.moveToTop()
    resources.layer.batchDraw()
  }

  /** Completes a pointer editor gesture when it has usable geometry. */
  private completeGesture(pageIndex: number, gesture: PainterGestureState): void {
    if (gesture.points.length < 4) return
    if (gesture.multiPoint && gesture.points.length < 6) return
    const bounds = boundsFromPoints(gesture.points)
    if (bounds.width === 0 && bounds.height === 0) return
    this.options.onCreate({
      type: gesture.type,
      pageIndex,
      bounds,
      points: [...gesture.points]
    })
  }

  /** Completes a drag gesture from either Stage or document-level pointer release. */
  private finishSinglePointGesture(resources: PageResources): void {
    const gesture = resources.gesture
    if (gesture === null || gesture.multiPoint) return
    const point = resources.stage.getRelativePointerPosition()
    if (point !== null && gesture.points.length === 2) gesture.points.push(point.x, point.y)
    resources.gesture = null
    resources.pointerReleaseCleanup?.()
    resources.pointerReleaseCleanup = null
    if (gesture.type === 'freehand') {
      this.retainFreehandStroke(resources, gesture)
      return
    }
    clearGesturePreview(resources)
    this.completeGesture(resources.pageIndex, gesture.type === 'free-highlight'
      ? { ...gesture, points: correctFreeHighlightPoints(gesture.points) }
      : gesture)
  }

  /** Captures releases that occur outside Konva's Stage hit surface. */
  private capturePointerRelease(resources: PageResources): void {
    resources.pointerReleaseCleanup?.()
    const view = resources.container.ownerDocument.defaultView
    if (view === null || view === undefined) {
      resources.pointerReleaseCleanup = null
      return
    }
    const finish = (): void => this.finishSinglePointGesture(resources)
    view.addEventListener('mouseup', finish, { once: true })
    view.addEventListener('touchend', finish, { once: true })
    resources.pointerReleaseCleanup = () => {
      view.removeEventListener('mouseup', finish)
      view.removeEventListener('touchend', finish)
    }
  }

  /** Retains one completed stroke and restarts the page-local merge window. */
  private retainFreehandStroke(resources: PageResources, gesture: PainterGestureState): void {
    const bounds = boundsFromPoints(gesture.points)
    const preview = resources.gesturePreview
    resources.gesturePreview = null
    if (gesture.points.length < 4 || (bounds.width === 0 && bounds.height === 0)) {
      preview?.destroy()
      return
    }
    const batch = resources.pendingFreehand ?? { strokes: [], previews: [], timer: null }
    batch.strokes.push([...gesture.points])
    if (preview?.getClassName() === 'Line') batch.previews.push(preview as Konva.Line)
    resources.pendingFreehand = batch
    batch.timer = setTimeout(() => this.flushFreehandBatch(resources), this.freehandMergeDelay())
  }

  /** Stops the idle commit while another Freehand stroke is starting. */
  private pauseFreehandCommit(resources: PageResources): void {
    const timer = resources.pendingFreehand?.timer
    if (timer !== null && timer !== undefined) clearTimeout(timer)
    if (resources.pendingFreehand !== null) resources.pendingFreehand.timer = null
  }

  /** Converts every pending stroke into one canonical annotation. */
  private flushFreehandBatch(resources: PageResources): void {
    const batch = resources.pendingFreehand
    if (batch === null) return
    resources.pendingFreehand = null
    if (batch.timer !== null) clearTimeout(batch.timer)
    for (const preview of batch.previews) preview.destroy()
    resources.layer.batchDraw()
    if (this.destroyed || batch.strokes.length === 0) return
    const points = batch.strokes.flat()
    const bounds = boundsFromPoints(points)
    if (bounds.width === 0 && bounds.height === 0) return
    this.options.onCreate({
      type: 'freehand',
      pageIndex: resources.pageIndex,
      bounds,
      points: [...(batch.strokes[0] ?? [])],
      strokes: batch.strokes.map((stroke) => [...stroke])
    })
  }

  /** Cancels a pending batch during final engine teardown. */
  private cancelFreehandBatch(resources: PageResources): void {
    const batch = resources.pendingFreehand
    if (batch === null) return
    resources.pendingFreehand = null
    if (batch.timer !== null) clearTimeout(batch.timer)
    for (const preview of batch.previews) preview.destroy()
  }

  /** Returns a validated merge delay without introducing a shared timer. */
  private freehandMergeDelay(): number {
    const delay = this.options.freehandMergeDelayMs ?? 1000
    return Number.isFinite(delay) && delay >= 0 && delay <= 5000 ? delay : 1000
  }

  /** Prevents operations after painter destruction. */
  private assertActive(): void {
    if (this.destroyed) throw new Error('Konva painter has been destroyed.')
  }
}

/** Narrows pointer tools that place an application-provided raster asset. */
function isImageTool(tool: AnnotationTool): tool is AnnotationImageTool {
  return tool === 'signature' || tool === 'stamp'
}

/** Serializes canonical state without transient enlarged hit-width attrs. */
function serializeWithoutHitRegions(group: Konva.Group): string {
  const hitTargets = group.find(`.${INTERACTION_HIT_TARGET_NAME}`) as unknown as Konva.Shape[]
  for (const target of hitTargets) target.remove()
  const shapes = group.find('Line, Arrow, Path, Rect') as unknown as Konva.Shape[]
  const values = shapes.map((shape) => shape.getAttr('hitStrokeWidth') as number | undefined)
  shapes.forEach((shape) => shape.setAttr('hitStrokeWidth', undefined))
  try {
    return group.toJSON()
  } finally {
    shapes.forEach((shape, index) => {
      const value = values[index]
      if (value !== undefined) shape.hitStrokeWidth(value)
    })
    for (const target of hitTargets) {
      group.add(target)
      target.moveToBottom()
    }
  }
}

/** Creates the minimal Konva shape class needed by one gesture preview. */
function createGesturePreview(
  runtime: typeof Konva,
  className: 'Rect' | 'Ellipse' | 'Arrow' | 'Line' | 'Path',
  appearance: AnnotationAppearance
): Konva.Shape {
  const stroke = appearance.stroke
  const fill = appearance.fill
  const common = {
    listening: false,
    opacity: appearance.opacity,
    ...(stroke === null ? {} : {
      stroke: colorWithOpacity(stroke.color, stroke.opacity),
      strokeWidth: stroke.width,
      dash: [...stroke.dash],
      dashOffset: stroke.dashOffset,
      lineCap: stroke.lineCap,
      lineJoin: stroke.lineJoin
    }),
    ...(fill === null ? {} : { fill: colorWithOpacity(fill.color, fill.opacity) })
  }
  switch (className) {
    case 'Rect': return new runtime.Rect(common)
    case 'Ellipse': return new runtime.Ellipse({
      ...common,
      radiusX: 0,
      radiusY: 0,
      strokeScaleEnabled: false,
      perfectDrawEnabled: false
    })
    case 'Arrow': return new runtime.Arrow({
      ...common, points: [], pointerLength: 10, pointerWidth: 10
    })
    case 'Line': return new runtime.Line({ ...common, points: [], lineCap: 'round', lineJoin: 'round' })
    case 'Path': return new runtime.Path(common)
  }
}

/** Converts semantic component opacity to a Konva-compatible RGBA color. */
function colorWithOpacity(color: string, opacity: number): string {
  const [red, green, blue] = parseAnnotationColor(color)
  return `rgba(${Math.round(red * 255)}, ${Math.round(green * 255)}, ${Math.round(blue * 255)}, ${opacity})`
}

/** Enlarges only the interactive hit region while preserving visual paint and persistence. */
function configureHitRegions(group: Konva.Group, scale: number): void {
  const minimumPageWidth = 16 / Math.max(scale, 0.01)
  for (const shape of group.find('Line, Arrow, Path, Rect')) {
    const className = shape.getClassName()
    const visibleWidth = typeof (shape as Konva.Shape).strokeWidth === 'function'
      ? (shape as Konva.Shape).strokeWidth()
      : 0
    const thinRect = className === 'Rect' && typeof shape.height === 'function' && shape.height() <= 6
    if (className === 'Line' || className === 'Arrow' || className === 'Path' || thinRect) {
      ;(shape as Konva.Shape).hitStrokeWidth(Math.max(visibleWidth, minimumPageWidth))
    }
  }
}

/** Returns live preview attributes without mutating persisted renderer state. */
function gesturePreviewAttributes(
  gesture: PainterGestureState,
  points: readonly number[]
): Record<string, unknown> {
  const bounds = boundsFromPoints(points)
  if (gesture.type !== 'circle' && (gesture.type === 'rectangle'
    || gesture.geometry === 'box' || gesture.geometry === 'text-box')) {
    return { ...bounds, dash: [6, 4] }
  }
  if (gesture.type === 'circle') {
    const startX = gesture.points[0] ?? bounds.x
    const startY = gesture.points[1] ?? bounds.y
    const endX = points.at(-2) ?? startX
    const endY = points.at(-1) ?? startY
    return {
      x: startX + (endX - startX) / 2,
      y: startY + (endY - startY) / 2,
      radiusX: Math.abs(endX - startX) / 2,
      radiusY: Math.abs(endY - startY) / 2,
      dash: [6, 4]
    }
  }
  if (gesture.type === 'cloud') {
    return {
      x: 0,
      y: 0,
      data: buildCloudPathFromPoints(points, { x: 0, y: 0, width: 0, height: 0 }, false)
    }
  }
  return {
    points: [...points],
    closed: false,
    dash: gesture.type === 'freehand' || gesture.type === 'free-highlight'
      || gesture.type === 'signature' ? [] : [6, 4]
  }
}

const INTERACTION_HIT_TARGET_NAME = 'inklayer-interaction-hit-target'

/** Adds a non-persisted bounds hit surface for raster-only and transparent native appearances. */
function addInteractionHitTarget(
  runtime: typeof Konva,
  group: Konva.Group,
  bounds: Annotation['bounds']
): void {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) return
  const target = new runtime.Rect({
    name: INTERACTION_HIT_TARGET_NAME,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fill: 'rgba(0, 0, 0, 0.001)',
    strokeEnabled: false,
    perfectDrawEnabled: false,
    listening: true
  })
  group.add(target)
  target.moveToBottom()
}

/** Snaps a nearly straight Free-highlight path to one horizontal or vertical axis. */
function correctFreeHighlightPoints(points: readonly number[], thresholdDegrees = 2): number[] {
  if (points.length < 4) return [...points]
  const startX = points[0]
  const startY = points[1]
  const endX = points[points.length - 2]
  const endY = points[points.length - 1]
  if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
    return [...points]
  }
  const deltaX = endX - startX
  const deltaY = endY - startY
  if (deltaX === 0 && deltaY === 0) return [...points]
  const angle = Math.abs(Math.atan2(deltaY, deltaX) * 180 / Math.PI)
  const horizontalDistance = Math.min(angle, Math.abs(180 - angle))
  if (horizontalDistance <= thresholdDegrees) {
    return points.map((value, index) => index % 2 === 0 ? value : startY)
  }
  if (Math.abs(angle - 90) <= thresholdDegrees) {
    return points.map((value, index) => index % 2 === 0 ? startX : value)
  }
  return [...points]
}

/** Removes the current creation preview idempotently. */
function clearGesturePreview(resources: PageResources): void {
  clearGesturePreviewShape(resources)
  resources.gestureStartHandle?.destroy()
  resources.gestureStartHandle = null
}

/** Removes only the cursor-following shape while retaining a start handle. */
function clearGesturePreviewShape(resources: PageResources): void {
  resources.gesturePreview?.destroy()
  resources.gesturePreview = null
}

/** Removes duplicate click coordinates emitted by the closing double-click. */
function removeConsecutiveDuplicatePoints(points: readonly number[]): number[] {
  const output: number[] = []
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]
    const y = points[index + 1]
    if (x === undefined || y === undefined) continue
    if (output.at(-2) === x && output.at(-1) === y) continue
    output.push(x, y)
  }
  return output
}

/** Appends the first vertex once so closed canonical paths have explicit topology. */
function closePointLoop(points: readonly number[]): number[] {
  const output = [...points]
  const firstX = output[0]
  const firstY = output[1]
  if (firstX === undefined || firstY === undefined) return output
  if (output.at(-2) !== firstX || output.at(-1) !== firstY) output.push(firstX, firstY)
  return output
}

/** Returns unique editable x indexes, excluding a duplicated closing point. */
function pointIndexes(points: readonly number[]): number[] {
  const indexes = Array.from({ length: points.length / 2 }, (_value, index) => index * 2)
  const lastIndex = points.length - 2
  if (lastIndex > 0 && points[0] === points[lastIndex] && points[1] === points[lastIndex + 1]) {
    indexes.pop()
  }
  return indexes
}

/** Positions all layer-owned point handles from their annotation-local points. */
function positionPointControls(resources: PageResources): void {
  for (const control of resources.pointControls) {
    const points = control.shape.points()
    const x = points[control.pointIndex]
    const y = points[control.pointIndex + 1]
    if (x === undefined || y === undefined) continue
    const shapePoint = control.shape.getTransform().point({ x, y })
    control.node.position(control.group.getTransform().point(shapePoint))
  }
}

/** Writes one dragged layer handle back into annotation-local line points. */
function updatePointFromControl(control: PointControl): void {
  const groupPoint = control.group.getTransform().copy().invert().point(control.node.position())
  const localPoint = control.shape.getTransform().copy().invert().point(groupPoint)
  const points = [...control.shape.points()]
  points[control.pointIndex] = localPoint.x
  points[control.pointIndex + 1] = localPoint.y
  if (control.pointIndex === 0 && control.shape.closed() && points.length >= 6) {
    points[points.length - 2] = localPoint.x
    points[points.length - 1] = localPoint.y
  }
  control.shape.points(points)
}

/** Destroys all transient geometry controls before render or serialization. */
function clearPointControls(resources: PageResources): void {
  for (const control of resources.pointControls) control.node.destroy()
  resources.pointControls = []
}

/** Keeps endpoint and vertex handles inside the visible Stage bounds. */
function clampControlPosition(
  resources: PageResources,
  position: { x: number; y: number }
): { x: number; y: number } {
  const pageWidth = resources.stage.width()
  const pageHeight = resources.stage.height()
  return {
    x: Math.min(Math.max(position.x, 0), pageWidth),
    y: Math.min(Math.max(position.y, 0), pageHeight)
  }
}

/** Applies geometry-specific selection handles and safe page bounds. */
function configureTransformer(
  resources: PageResources,
  definition: PainterTypeInteraction | undefined,
  tool: AnnotationTool,
  permitted: boolean
): void {
  const enabled = tool === 'select' && definition !== undefined && permitted
  const mode = definition?.transformMode ?? 'none'
  resources.transformer.resizeEnabled(enabled && definition.resizable)
  resources.transformer.rotateEnabled(enabled && definition.rotatable)
  resources.transformer.keepRatio(mode === 'uniform')
  resources.transformer.flipEnabled(false)
  resources.transformer.enabledAnchors(transformerAnchors(mode))
  resources.transformer.boundBoxFunc((oldBox, nextBox) =>
    clampTransformBox(resources, oldBox, nextBox))
}

/** Returns the familiar handle set for one annotation geometry. */
function transformerAnchors(mode: AnnotationTransformMode): string[] {
  switch (mode) {
    case 'box':
      return [
        'top-left', 'top-center', 'top-right', 'middle-left',
        'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'
      ]
    case 'uniform':
      return ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    case 'endpoints':
      return ['top-left', 'bottom-right']
    case 'vertices':
      return ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    case 'none':
    case 'move':
      return []
  }
}

/** Keeps an absolute Transformer box usable and within the visible Stage bounds. */
function clampTransformBox(
  resources: PageResources,
  oldBox: { x: number; y: number; width: number; height: number; rotation: number },
  nextBox: { x: number; y: number; width: number; height: number; rotation: number }
): typeof oldBox {
  if (nextBox.width < 8 || nextBox.height < 8) return oldBox
  const pageWidth = resources.stage.width()
  const pageHeight = resources.stage.height()
  if (nextBox.x < 0 || nextBox.y < 0
    || nextBox.x + nextBox.width > pageWidth
    || nextBox.y + nextBox.height > pageHeight) return oldBox
  return nextBox
}

/** Clamps one one-to-one drag while preserving the pointer grab offset. */
function clampDragPosition(
  group: Konva.Group,
  resources: PageResources,
  position: { x: number; y: number }
): { x: number; y: number } {
  const bounds = group.getClientRect()
  const absolutePosition = group.getAbsolutePosition()
  const offsetX = bounds.x - absolutePosition.x
  const offsetY = bounds.y - absolutePosition.y
  const pageWidth = resources.stage.width()
  const pageHeight = resources.stage.height()
  const x = Math.min(Math.max(position.x, -offsetX), pageWidth - bounds.width - offsetX)
  const y = Math.min(Math.max(position.y, -offsetY), pageHeight - bounds.height - offsetY)
  return { x, y }
}

/** Validates page attachment dimensions and indexes. */
function validateAttachment(attachment: AnnotationPageAttachment): void {
  if (!Number.isSafeInteger(attachment.pageIndex) || attachment.pageIndex < 0
    || !Number.isFinite(attachment.width) || attachment.width <= 0
    || !Number.isFinite(attachment.height) || attachment.height <= 0
    || (attachment.scale !== undefined && (!Number.isFinite(attachment.scale) || attachment.scale <= 0))) {
    throw new RangeError('Annotation page attachment has invalid geometry.')
  }
}

/** Finds one author label without constructing a selector from an external ID. */
function findAuthorLabel(labels: HTMLDivElement, annotationId: string): HTMLElement | undefined {
  return [...labels.children].find((child) =>
    (child as HTMLElement).dataset['annotationId'] === annotationId) as HTMLElement | undefined
}

/** Finds one semantic canvas alternative without interpolating external IDs. */
function findAccessibilityItem(root: HTMLDivElement, annotationId: string): HTMLElement | undefined {
  return [...root.children].find((child) =>
    (child as HTMLElement).dataset['annotationId'] === annotationId) as HTMLElement | undefined
}

/** Produces a concise, localizable-by-adapter fallback description. */
function annotationAccessibilityLabel(annotation: Annotation): string {
  const text = annotation.content?.text || annotation.content?.selectedText
  const suffix = text === undefined || text.length === 0 ? '' : `: ${text.slice(0, 160)}`
  return `${annotation.type} annotation by ${annotation.author.name}${suffix}`
}

/** Returns whether two axis-aligned DOM label boxes overlap. */
function rectanglesOverlap(
  first: { left: number; top: number; right: number; bottom: number },
  second: { left: number; top: number; right: number; bottom: number }
): boolean {
  return first.left < second.right && first.right > second.left
    && first.top < second.bottom && first.bottom > second.top
}

/** Returns the axis-aligned bounds of finite x/y point pairs. */
function boundsFromPoints(points: readonly number[]): Annotation['bounds'] {
  const xs: number[] = []
  const ys: number[] = []
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]
    const y = points[index + 1]
    if (x !== undefined && y !== undefined) {
      xs.push(x)
      ys.push(y)
    }
  }
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Hydrates serialized image sources with instance-owned DOM image elements. */
function hydrateImageNodes(group: Konva.Group, resources: PageResources): HTMLImageElement[] {
  const images: HTMLImageElement[] = []
  for (const node of group.find('Image')) {
    const source = node.getAttr('src') as unknown
    if (typeof source !== 'string' || source.length === 0) continue
    const image = resources.labels.ownerDocument.createElement('img')
    image.onload = () => {
      if (node.getLayer() === resources.layer) {
        (node as Konva.Image).image(image)
        resources.layer.batchDraw()
      }
    }
    image.src = source
    images.push(image)
  }
  return images
}

/** Releases callbacks retained by DOM images after node or page removal. */
function releaseImages(images: readonly HTMLImageElement[]): void {
  for (const image of images) {
    image.onload = null
    image.onerror = null
  }
}
