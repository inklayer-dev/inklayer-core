/**
 * @file Instance-owned internal Konva painter.
 * @description Owns Stage, Layer, Transformer, nodes, author labels, page
 * listeners, scaling, selection, hover, and teardown for one Annotation Engine.
 */

import type Konva from 'konva'
import type { Annotation, AnnotationAppearance } from '../../../domain/annotation'
import { parseAnnotationColor } from '../../../domain/color'
import { InkLayerError } from '../../../domain/errors'
import { parseAndValidateKonvaSnapshot } from '../../../renderer/konva/snapshot'
import { ANNOTATION_TOOL_DEFINITIONS } from '../../tools'
import type { AnnotationTool, AnnotationTransformMode } from '../../tools'

/** Configuration used to attach one PDF page overlay. */
export interface AnnotationPageAttachment {
  /** Zero-based PDF page index. */
  pageIndex: number
  /** Container that will own the Konva Stage and labels. */
  container: HTMLDivElement
  /** Unscaled page width. */
  width: number
  /** Unscaled page height. */
  height: number
  /** Current visual page scale. */
  scale?: number
}

/** Internal painter construction options. */
export interface KonvaPainterOptions {
  /** Unique engine instance identifier used for event namespaces. */
  instanceId: string
  /** Initial Tag visibility; defaults to selected-or-hovered auto mode. */
  authorLabelVisibility?: AnnotationAuthorLabelVisibility
  /** Returns current annotations for one page attachment. */
  getAnnotationsByPage: (pageIndex: number) => readonly Annotation[]
  /** Handles annotation selection initiated from a Konva node. */
  onSelect: (annotationId: string) => void
  /** Handles a completed drag or transform with exact serialized state. */
  onTransform: (annotationId: string, bounds: Annotation['bounds'], serialized: string) => void
  /** Returns the current Annotation Engine tool. */
  getTool: () => AnnotationTool
  /** Returns the complete current appearance used by creation previews. */
  getAppearance: (type: Annotation['type']) => AnnotationAppearance
  /** Returns whether the current identity may directly transform an annotation. */
  canTransform: (annotation: Annotation) => boolean
  /** Creates an annotation after an instance-owned pointer gesture. */
  onCreate: (gesture: PainterCreationGesture) => void
  /** Opens instance-owned free-text input after a click gesture. */
  onRequestFreeText: (pageIndex: number, bounds: Annotation['bounds']) => void
  /** Clears selection after a background click in select mode. */
  onClearSelection: () => void
  /** Publishes Canvas hover so labels and product adapters share one state. */
  onHover: (annotationId: string | null) => void
  /** Idle interval that merges successive Freehand strokes; defaults to 1,000ms. */
  freehandMergeDelayMs?: number
}

/** Completed geometry emitted by internal pointer editors. */
export interface PainterCreationGesture {
  /** Persisted annotation type. */
  type: Annotation['type']
  /** Zero-based page index. */
  pageIndex: number
  /** Completed Stage-space bounds. */
  bounds: Annotation['bounds']
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
  type: Annotation['type']
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
  /** Renders one attached annotation page without selection affordances. */
  renderPageRaster(pageIndex: number, pixelRatio?: number): HTMLCanvasElement
  /** Destroys every attached page idempotently. */
  destroy(): void
}

/** Core-owned author/reference Tag visibility policy. */
export type AnnotationAuthorLabelVisibility = 'auto' | 'always' | 'hidden'

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
      anchorFill: '#ffffff',
      anchorStroke: '#1677ff',
      anchorStrokeWidth: 1.5,
      borderStroke: '#1677ff',
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
    attachment.container.dataset['inklayerPage'] = String(attachment.pageIndex)
    attachment.container.dataset['inklayerInstance'] = this.options.instanceId
    const resources: PageResources = {
      pageIndex: attachment.pageIndex,
      stage,
      layer,
      transformer,
      labels,
      container: attachment.container,
      nodes: new Map(),
      annotations: new Map(),
      images: new Map(),
      gesture: null,
      gesturePreview: null,
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
    group.draggable(this.options.getTool() === 'select'
      && ANNOTATION_TOOL_DEFINITIONS[annotation.type].draggable
      && this.options.canTransform(annotation))
    group.dragBoundFunc((position) => clampDragPosition(group, resources, position))
    const namespace = `.inklayer-${this.options.instanceId}`
    group.on(`click${namespace} tap${namespace}`, (event) => {
      event.cancelBubble = true
      if (this.options.getTool() === 'select') this.options.onSelect(annotation.id)
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
    }
    for (const annotation of annotations) this.render(annotation)
    this.applySelection()
  }

  /** Stores and applies selected node IDs across attached pages. */
  public setSelection(ids: readonly string[]): void {
    this.selectionIds = [...ids]
    this.applySelection()
  }

  /** Enables dragging only in select mode and refreshes transform affordances. */
  public setTool(tool: AnnotationTool): void {
    for (const resources of this.pages.values()) {
      this.flushFreehandBatch(resources)
      for (const [id, node] of resources.nodes) {
        const annotation = resources.annotations.get(id)
        node.draggable(tool === 'select' && annotation !== undefined
          && ANNOTATION_TOOL_DEFINITIONS[annotation.type].draggable
          && this.options.canTransform(annotation))
      }
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
    resources.layer.draw()
    try {
      return resources.stage.toCanvas({ pixelRatio })
    } finally {
      resources.transformer.visible(transformerVisible)
      for (const control of resources.pointControls) control.node.visible(true)
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
      configureTransformer(
        resources,
        primary,
        tool,
        primary !== undefined && this.options.canTransform(primary)
      )
      clearPointControls(resources)
      const usesPointControls = tool === 'select' && primary !== undefined
        && this.createPointControls(resources, primary)
      resources.transformer.nodes(tool === 'select' && !usesPointControls ? nodes : [])
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
      : `#${annotation.referenceNumber} ${annotation.author.name}`
    this.positionAuthorLabel(resources, label, annotation.bounds.x, annotation.bounds.y)
    resources.labels.append(label)
    this.applyAuthorLabelVisibility(label, annotation.id)
  }

  /** Applies policy precedence: hidden, always, then selected-or-hovered auto. */
  private applyAuthorLabelVisibility(label: HTMLElement, annotationId: string): void {
    const visible = this.authorLabelVisibility === 'always'
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
  }

  /** Projects one unscaled page coordinate into the DOM overlay viewport. */
  private positionAuthorLabel(
    resources: PageResources,
    label: HTMLElement,
    pageX: number,
    pageY: number
  ): void {
    label.style.left = `${pageX * resources.stage.scaleX()}px`
    label.style.top = `${pageY * resources.stage.scaleY()}px`
  }

  /** Creates endpoint or vertex handles for one selected line-based annotation. */
  private createPointControls(resources: PageResources, annotation: Annotation): boolean {
    const mode = ANNOTATION_TOOL_DEFINITIONS[annotation.type].transformMode
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
        fill: '#ffffff',
        stroke: '#1677ff',
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
      const tool = this.options.getTool()
      const point = resources.stage.getRelativePointerPosition()
      if (point === null) return
      if (tool === 'select' || tool === 'text-select') {
        if (tool === 'select' && event.target === resources.stage) this.options.onClearSelection()
        return
      }
      if (ANNOTATION_TOOL_DEFINITIONS[tool].textSelection || tool === 'stamp') return
      if (tool === 'free-text') {
        this.options.onRequestFreeText(resources.pageIndex, {
          x: point.x, y: point.y, width: 160, height: 40
        })
        return
      }
      if (tool === 'note') {
        this.options.onCreate({
          type: 'note', pageIndex: resources.pageIndex,
          bounds: { x: point.x, y: point.y, width: 24, height: 24 }
        })
        return
      }
      const multiPoint = tool === 'polygon' || tool === 'polyline' || tool === 'cloud'
      if (tool === 'freehand') this.pauseFreehandCommit(resources)
      if (multiPoint && resources.gesture?.type === tool) {
        resources.gesture.points.push(point.x, point.y)
      } else {
        resources.gesture = { type: tool, points: [point.x, point.y], multiPoint }
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
      if (gesture.type === 'freehand' || gesture.type === 'free-highlight' || gesture.type === 'signature') {
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
    resources.stage.on(`dblclick${namespace} dbltap${namespace}`, () => {
      const gesture = resources.gesture
      if (gesture === null || !gesture.multiPoint) return
      resources.gesture = null
      clearGesturePreview(resources)
      this.completeGesture(resources.pageIndex, gesture)
    })
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
          : 'Line'
    if (resources.gesturePreview?.getClassName() !== desiredClass) {
      clearGesturePreview(resources)
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

/** Serializes canonical state without transient enlarged hit-width attrs. */
function serializeWithoutHitRegions(group: Konva.Group): string {
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
  }
}

/** Creates the minimal Konva shape class needed by one gesture preview. */
function createGesturePreview(
  runtime: typeof Konva,
  className: 'Rect' | 'Ellipse' | 'Arrow' | 'Line',
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
    case 'Ellipse': return new runtime.Ellipse({ ...common, radiusX: 0, radiusY: 0 })
    case 'Arrow': return new runtime.Arrow({
      ...common, points: [], pointerLength: 10, pointerWidth: 10
    })
    case 'Line': return new runtime.Line({ ...common, points: [], lineCap: 'round', lineJoin: 'round' })
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
  if (gesture.type === 'rectangle') {
    return { ...bounds, dash: [6, 4] }
  }
  if (gesture.type === 'circle') {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      radiusX: bounds.width / 2,
      radiusY: bounds.height / 2,
      dash: [6, 4]
    }
  }
  return {
    points: [...points],
    closed: false,
    dash: gesture.type === 'freehand' || gesture.type === 'free-highlight'
      || gesture.type === 'signature' ? [] : [6, 4]
  }
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
  resources.gesturePreview?.destroy()
  resources.gesturePreview = null
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

/** Keeps endpoint and vertex handles inside the unscaled page. */
function clampControlPosition(
  resources: PageResources,
  position: { x: number; y: number }
): { x: number; y: number } {
  const pageWidth = resources.stage.width() / resources.stage.scaleX()
  const pageHeight = resources.stage.height() / resources.stage.scaleY()
  return {
    x: Math.min(Math.max(position.x, 0), pageWidth),
    y: Math.min(Math.max(position.y, 0), pageHeight)
  }
}

/** Applies geometry-specific selection handles and safe page bounds. */
function configureTransformer(
  resources: PageResources,
  annotation: Annotation | undefined,
  tool: AnnotationTool,
  permitted: boolean
): void {
  const definition = annotation === undefined ? undefined : ANNOTATION_TOOL_DEFINITIONS[annotation.type]
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

/** Keeps a transformed bounding box usable and within the unscaled page. */
function clampTransformBox(
  resources: PageResources,
  oldBox: { x: number; y: number; width: number; height: number; rotation: number },
  nextBox: { x: number; y: number; width: number; height: number; rotation: number }
): typeof oldBox {
  if (nextBox.width < 8 || nextBox.height < 8) return oldBox
  const pageWidth = resources.stage.width() / resources.stage.scaleX()
  const pageHeight = resources.stage.height() / resources.stage.scaleY()
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
  const bounds = group.getClientRect({ relativeTo: resources.stage })
  const offsetX = bounds.x - group.x()
  const offsetY = bounds.y - group.y()
  const pageWidth = resources.stage.width() / resources.stage.scaleX()
  const pageHeight = resources.stage.height() / resources.stage.scaleY()
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
