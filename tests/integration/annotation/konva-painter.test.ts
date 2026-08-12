/**
 * @file Konva painter ownership integration tests using the runtime module seam.
 * @description Verifies page attachment, rendering, selection, transform routing,
 * labels, multi-instance isolation, detach, and destroy without browser canvas.
 */

import { describe, expect, it, vi } from 'vitest'
import { createAnnotationEngine } from '../../../src/annotation/annotation-engine'

const runtime = vi.hoisted(() => ({
  stages: [] as Array<{
    destroyed: boolean
    setPointer: (x: number, y: number) => void
    trigger: (event: string) => void
  }>,
  groups: new Map<string, {
    triggerTransformMove: () => void
    triggerTransform: () => void
    triggerHover: (hovered: boolean) => void
    destroyed: boolean
    draggable: boolean
  }>(),
  transformers: [] as Array<{
    selected: unknown[]
    resize: boolean
    rotate: boolean
    anchors: string[]
    ratioLocked: boolean
  }>,
  previews: [] as Array<{
    className: string
    attrs: Record<string, unknown>
    destroyed: boolean
  }>
}))

vi.mock('konva', () => {
  class MockStage {
    public destroyed = false
    private pointer = { x: 0, y: 0 }
    private readonly listeners = new Map<string, (event: { target: MockStage }) => void>()
    private readonly horizontalScale: number
    private readonly verticalScale: number

    /** Creates and records one Stage. */
    public constructor(options: { scaleX?: number; scaleY?: number }) {
      this.horizontalScale = options.scaleX ?? 1
      this.verticalScale = options.scaleY ?? 1
      runtime.stages.push(this)
    }

    /** Accepts a layer. */
    public add(_layer: unknown): void {}

    /** Registers namespaced Stage pointer listeners. */
    public on(events: string, listener: (event: { target: MockStage }) => void): void {
      events.split(' ').forEach((event) => this.listeners.set(event.split('.')[0] ?? event, listener))
    }

    /** Returns the configured Stage-space pointer. */
    public getRelativePointerPosition(): { x: number; y: number } {
      return { ...this.pointer }
    }

    /** Replaces the pointer used by the next mock event. */
    public setPointer(x: number, y: number): void {
      this.pointer = { x, y }
    }

    /** Invokes one registered pointer event. */
    public trigger(event: string): void {
      this.listeners.get(event)?.({ target: this })
    }

    /** Returns the deterministic physical Stage width. */
    public width(): number { return 400 }

    /** Returns the deterministic physical Stage height. */
    public height(): number { return 600 }

    /** Returns the deterministic horizontal Stage scale. */
    public scaleX(): number { return this.horizontalScale }

    /** Returns the deterministic vertical Stage scale. */
    public scaleY(): number { return this.verticalScale }

    /** Marks the Stage destroyed. */
    public destroy(): void {
      this.destroyed = true
      this.listeners.clear()
    }
  }

  class MockLayer {
    public destroyed = false

    /** Attaches a Transformer or Group to this layer. */
    public add(node: { layer?: MockLayer }): void {
      node.layer = this
    }

    /** Records a draw request. */
    public batchDraw(): void {}

    /** Marks the Layer destroyed. */
    public destroy(): void {
      this.destroyed = true
    }
  }

  class MockTransformer {
    public layer: MockLayer | undefined
    public selected: unknown[] = []
    public resize = false
    public rotate = false
    public anchors: string[] = []
    public ratioLocked = false

    /** Creates and records one Transformer. */
    public constructor(_options: unknown) {
      runtime.transformers.push(this)
    }

    /** Replaces selected nodes. */
    public nodes(nodes: unknown[]): void {
      this.selected = nodes
    }

    /** Replaces resize capability. */
    public resizeEnabled(value: boolean): void {
      this.resize = value
    }

    /** Accepts rotation capability. */
    public rotateEnabled(value: boolean): void { this.rotate = value }

    /** Accepts aspect-ratio behavior. */
    public keepRatio(value: boolean): void { this.ratioLocked = value }

    /** Accepts flip behavior. */
    public flipEnabled(_value: boolean): void {}

    /** Accepts the active anchor set. */
    public enabledAnchors(value: string[]): void { this.anchors = [...value] }

    /** Accepts the box constraint callback. */
    public boundBoxFunc(_value: unknown): void {}

    /** Releases the Transformer. */
    public destroy(): void {}
  }

  class MockGroup {
    public layer: MockLayer | undefined
    public destroyed = false
    private opacityValue = 1
    private transformMoveListener: (() => void) | undefined
    private transformListener: (() => void) | undefined
    private enterListener: (() => void) | undefined
    private leaveListener: (() => void) | undefined

    /** Creates a group from serialized renderer state. */
    public constructor(private readonly serialized: string, id: string) {
      const record = {
        triggerTransformMove: () => this.transformMoveListener?.(),
        triggerTransform: () => this.transformListener?.(),
        triggerHover: (hovered: boolean) => hovered ? this.enterListener?.() : this.leaveListener?.(),
        destroyed: false,
        draggable: false
      }
      this.record = record
      runtime.groups.set(id, record)
    }

    private readonly record: {
      triggerTransformMove: () => void
      triggerTransform: () => void
      triggerHover: (hovered: boolean) => void
      destroyed: boolean
      draggable: boolean
    }

    /** Returns the verified root class name. */
    public getClassName(): string {
      return 'Group'
    }

    /** Accepts drag capability. */
    public draggable(value: boolean): void { this.record.draggable = value }

    /** Accepts a drag constraint callback. */
    public dragBoundFunc(_value: unknown): void {}

    /** Returns the deterministic group x position. */
    public x(): number { return 5 }

    /** Returns the deterministic group y position. */
    public y(): number { return 6 }

    /** Registers selection or transform listeners. */
    public on(events: string, listener: () => void): void {
      if (events.includes('mouseenter')) {
        this.enterListener = listener
      } else if (events.includes('mouseleave')) {
        this.leaveListener = listener
      } else if (events.includes('transformend')) {
        this.transformListener = listener
      } else if (events.includes('transform')) {
        this.transformMoveListener = listener
      }
    }

    /** Removes namespaced listeners. */
    public off(_namespace: string): void {}

    /** Marks this group destroyed. */
    public destroy(): void {
      this.destroyed = true
      this.record.destroyed = true
    }

    /** Returns deterministic transformed bounds. */
    public getClientRect(_options: unknown): { x: number; y: number; width: number; height: number } {
      return { x: 5, y: 6, width: 20, height: 30 }
    }

    /** Returns exact serialized state. */
    public toJSON(): string {
      return this.serialized
    }

    /** Gets or sets transient opacity. */
    public opacity(value?: number): number | MockGroup {
      if (value === undefined) return this.opacityValue
      this.opacityValue = value
      return this
    }

    /** Returns the current layer. */
    public getLayer(): MockLayer | undefined {
      return this.layer
    }

    /** Returns matching descendants; fixtures contain no image hydration. */
    public find(_selector: string): unknown[] {
      return []
    }

    /** Returns no point-editable child in the lightweight mock. */
    public findOne(_selector: string): undefined {
      return undefined
    }
  }

  class MockShape {
    public layer: MockLayer | undefined
    private readonly record: { className: string; attrs: Record<string, unknown>; destroyed: boolean }

    /** Creates one lightweight gesture preview of a fixed class. */
    public constructor(private readonly className: string, _options: unknown) {
      this.record = { className, attrs: {}, destroyed: false }
      runtime.previews.push(this.record)
    }

    /** Returns the preview node class. */
    public getClassName(): string { return this.className }

    /** Accepts live preview geometry. */
    public setAttrs(attrs: Record<string, unknown>): void { this.record.attrs = structuredClone(attrs) }

    /** Accepts preview stacking changes. */
    public moveToTop(): void {}

    /** Releases the preview. */
    public destroy(): void { this.record.destroyed = true }
  }

  /** Creates a mock shape constructor with a stable Konva class name. */
  function shapeConstructor(className: string): new (options: unknown) => MockShape {
    return class extends MockShape {
      /** Creates one named mock shape. */
      public constructor(options: unknown) { super(className, options) }
    }
  }

  return {
    default: {
      Stage: MockStage,
      Layer: MockLayer,
      Transformer: MockTransformer,
      Rect: shapeConstructor('Rect'),
      Ellipse: shapeConstructor('Ellipse'),
      Arrow: shapeConstructor('Arrow'),
      Line: shapeConstructor('Line'),
      Node: {
        create: (serialized: string) => {
          const parsed = JSON.parse(serialized) as { attrs: { id: string } }
          return new MockGroup(serialized, parsed.attrs.id)
        }
      }
    }
  }
})

/** Minimal fake DOM element used by painter overlays. */
interface FakeElement {
  /** CSS class string. */
  className: string
  /** Element dataset. */
  dataset: Record<string, string>
  /** Inline style object. */
  style: Record<string, string>
  /** Child elements. */
  children: FakeElement[]
  /** Owning fake document. */
  ownerDocument: FakeDocument
  /** Text content. */
  textContent: string | null
  /** Appends children. */
  append(...children: FakeElement[]): void
  /** Removes every child. */
  replaceChildren(): void
  /** Removes this element from its parent. */
  remove(): void
}

/** Minimal fake document used to create labels. */
interface FakeDocument {
  /** Creates one fake element. */
  createElement(tag: string): FakeElement
}

/** Creates a fake DOM tree with removal ownership. */
function createContainer(): HTMLDivElement & { fakeChildren: FakeElement[] } {
  const document: FakeDocument = {
    createElement: () => createElement(document)
  }
  const root = createElement(document)
  return Object.assign(root, {
    fakeChildren: root.children,
    scrollIntoView: vi.fn()
  }) as unknown as HTMLDivElement & { fakeChildren: FakeElement[] }
}

/** Creates one fake element with local parent tracking. */
function createElement(document: FakeDocument): FakeElement {
  const element: FakeElement = {
    className: '',
    dataset: {},
    style: {},
    children: [],
    ownerDocument: document,
    textContent: null,
    append: (...children) => {
      element.children.push(...children)
      children.forEach((child) => {
        child.remove = () => {
          const index = element.children.indexOf(child)
          if (index >= 0) element.children.splice(index, 1)
        }
      })
    },
    replaceChildren: () => { element.children.splice(0) },
    remove: () => undefined
  }
  return element
}

/** Creates the fake instance root required by Annotation Engine. */
function createRoot(): HTMLElement {
  const classes = new Set<string>()
  return {
    dataset: {},
    classList: {
      add: (...tokens: string[]) => tokens.forEach((token) => classes.add(token)),
      remove: (...tokens: string[]) => tokens.forEach((token) => classes.delete(token))
    }
  } as unknown as HTMLElement
}

describe('Konva painter ownership', () => {
  it('applies auto, always, and hidden Tag policies with Canvas hover and selection', async () => {
    runtime.groups.clear()
    const engine = createAnnotationEngine({
      root: createRoot(), currentUser: { id: 'a', name: 'A' }
    })
    const container = createContainer()
    await engine.attachPage({ pageIndex: 0, container, width: 200, height: 300 })
    const annotation = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 10, y: 20, width: 30, height: 40 }
    })
    const label = container.fakeChildren[0]?.children[0] as unknown as HTMLElement
    expect(engine.getAuthorLabelVisibility()).toBe('auto')
    expect(label.hidden).toBe(true)
    runtime.groups.get(annotation.id)?.triggerHover(true)
    expect(label.hidden).toBe(false)
    runtime.groups.get(annotation.id)?.triggerHover(false)
    expect(label.hidden).toBe(true)
    engine.setSelection({ ids: [annotation.id], primaryId: annotation.id })
    expect(label.hidden).toBe(false)
    engine.setAuthorLabelVisibility('hidden')
    expect(label.hidden).toBe(true)
    engine.setAuthorLabelVisibility('always')
    expect(label.hidden).toBe(false)
    engine.destroy()
  })

  it('projects FreeText input requests into the attached page overlay', async () => {
    runtime.stages.splice(0)
    const requestText = vi.fn(async () => ({ value: null }))
    const engine = createAnnotationEngine({
      root: createRoot(),
      currentUser: { id: 'a', name: 'A' },
      textInputProvider: { requestText }
    })
    const container = createContainer()
    await engine.attachPage({ pageIndex: 0, container, width: 200, height: 300, scale: 2 })
    engine.setTool('free-text')
    runtime.stages[0]?.setPointer(20, 30)
    runtime.stages[0]?.trigger('mousedown')
    await vi.waitFor(() => expect(requestText).toHaveBeenCalledOnce())
    expect(requestText).toHaveBeenCalledWith(expect.objectContaining({
      root: container,
      pageIndex: 0,
      scale: 2,
      pageBounds: { x: 20, y: 30, width: 160, height: 40 },
      bounds: { x: 40, y: 60, width: 320, height: 80 }
    }))
    engine.destroy()
  })

  it('projects author labels through the page scale during render and transform', async () => {
    runtime.stages.splice(0)
    runtime.groups.clear()
    const engine = createAnnotationEngine({
      root: createRoot(),
      currentUser: { id: 'a', name: 'A' }
    })
    const container = createContainer()
    await engine.attachPage({ pageIndex: 0, container, width: 200, height: 300, scale: 2 })
    const annotation = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 10, y: 20, width: 30, height: 40 }
    })
    const label = container.fakeChildren[0]?.children[0]
    expect(label?.style).toMatchObject({ left: '20px', top: '40px' })

    engine.setSelection({ ids: [annotation.id], primaryId: annotation.id })
    runtime.groups.get(annotation.id)?.triggerTransformMove()
    expect(label?.style).toMatchObject({ left: '10px', top: '12px' })
    engine.destroy()
  })

  it('isolates two instances and routes transform state through the facade', async () => {
    runtime.stages.splice(0)
    runtime.groups.clear()
    runtime.transformers.splice(0)
    let firstSequence = 0
    let secondSequence = 0
    const first = createAnnotationEngine({
      root: createRoot(), currentUser: { id: 'a', name: 'A' },
      idGenerator: { next: () => `first-${firstSequence += 1}` }
    })
    const second = createAnnotationEngine({
      root: createRoot(), currentUser: { id: 'b', name: 'B' },
      idGenerator: { next: () => `second-${secondSequence += 1}` }
    })
    const firstContainer = createContainer()
    const secondContainer = createContainer()
    await first.attachPage({ pageIndex: 0, container: firstContainer, width: 200, height: 300, scale: 2 })
    await second.attachPage({ pageIndex: 0, container: secondContainer, width: 200, height: 300 })
    const annotation = first.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })
    first.setSelection({ ids: [annotation.id], primaryId: annotation.id })
    expect(runtime.transformers[0]?.selected).toHaveLength(1)
    expect(runtime.transformers[0]?.resize).toBe(true)
    expect(runtime.transformers[0]?.rotate).toBe(true)
    expect(runtime.transformers[0]?.anchors).toHaveLength(8)
    expect(runtime.groups.get(annotation.id)?.draggable).toBe(true)
    runtime.groups.get(annotation.id)?.triggerTransform()
    expect(first.repository.getById(annotation.id)?.bounds).toEqual({ x: 5, y: 6, width: 20, height: 30 })
    first.setTool('circle')
    expect(runtime.transformers[0]?.selected).toHaveLength(0)
    expect(runtime.groups.get(annotation.id)?.draggable).toBe(false)
    runtime.stages[0]?.setPointer(40, 50)
    runtime.stages[0]?.trigger('mousedown')
    runtime.stages[0]?.setPointer(80, 90)
    runtime.stages[0]?.trigger('mousemove')
    runtime.stages[0]?.trigger('mouseup')
    expect(first.repository.getAll().some((item) => item.type === 'circle')).toBe(true)
    const line = first.createAnnotation({
      type: 'line', pageIndex: 0,
      bounds: { x: 10, y: 10, width: 80, height: 40 },
      points: [10, 10, 90, 50]
    })
    first.setTool('select')
    first.setSelection({ ids: [line.id], primaryId: line.id })
    expect(runtime.transformers[0]?.anchors).toEqual(['top-left', 'bottom-right'])
    expect(runtime.transformers[0]?.rotate).toBe(false)
    expect(firstContainer.fakeChildren).toHaveLength(1)
    expect(secondContainer.fakeChildren).toHaveLength(1)
    first.destroy()
    expect(runtime.stages[0]?.destroyed).toBe(true)
    expect(runtime.stages[1]?.destroyed).toBe(false)
    expect(firstContainer.fakeChildren).toHaveLength(0)
    expect(secondContainer.fakeChildren).toHaveLength(1)
    second.destroy()
    expect(runtime.stages[1]?.destroyed).toBe(true)
  })

  it('merges successive Freehand strokes into one renderer group after one idle interval', async () => {
    vi.useFakeTimers()
    runtime.stages.splice(0)
    runtime.previews.splice(0)
    const engine = createAnnotationEngine({
      root: createRoot(),
      currentUser: { id: 'a', name: 'A' },
      freehandMergeDelayMs: 1000
    })
    await engine.attachPage({ pageIndex: 0, container: createContainer(), width: 200, height: 300 })
    engine.setTool('freehand')
    const stage = runtime.stages[0]
    stage?.setPointer(20, 20)
    stage?.trigger('mousedown')
    stage?.setPointer(60, 60)
    stage?.trigger('mousemove')
    stage?.trigger('mouseup')
    await vi.advanceTimersByTimeAsync(500)
    expect(engine.repository.getAll()).toHaveLength(0)
    stage?.setPointer(60, 20)
    stage?.trigger('mousedown')
    stage?.setPointer(20, 60)
    stage?.trigger('mousemove')
    stage?.trigger('mouseup')
    await vi.advanceTimersByTimeAsync(1000)
    const annotations = engine.repository.getAll()
    const snapshot = JSON.parse(annotations[0]?.rendererState.serialized ?? '{}') as {
      children?: Array<{ className: string }>
    }
    expect(annotations).toHaveLength(1)
    expect(snapshot.children?.filter((child) => child.className === 'Line')).toHaveLength(2)
    engine.destroy()
    vi.useRealTimers()
  })

  it('snaps near-axis Free-highlight input and keeps Polygon/Cloud previews open', async () => {
    runtime.stages.splice(0)
    runtime.previews.splice(0)
    const engine = createAnnotationEngine({ root: createRoot(), currentUser: { id: 'a', name: 'A' } })
    await engine.attachPage({ pageIndex: 0, container: createContainer(), width: 200, height: 300 })
    const stage = runtime.stages[0]
    engine.setTool('free-highlight')
    stage?.setPointer(10, 10)
    stage?.trigger('mousedown')
    stage?.setPointer(100, 12)
    stage?.trigger('mousemove')
    stage?.trigger('mouseup')
    const highlight = engine.repository.getAll()[0]
    const highlightSnapshot = JSON.parse(highlight?.rendererState.serialized ?? '{}') as {
      children?: Array<{ attrs?: { points?: number[] } }>
    }
    expect(highlightSnapshot.children?.[0]?.attrs?.points).toEqual([10, 10, 100, 10])

    for (const tool of ['polygon', 'cloud'] as const) {
      engine.setTool(tool)
      stage?.setPointer(20, 20)
      stage?.trigger('mousedown')
      stage?.setPointer(80, 20)
      stage?.trigger('mousemove')
      expect(runtime.previews.at(-1)?.attrs['closed']).toBe(false)
      stage?.trigger('dblclick')
    }
    engine.destroy()
  })
})
