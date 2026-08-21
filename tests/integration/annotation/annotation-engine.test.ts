/**
 * @file Annotation Engine facade integration tests.
 * @description Covers every persisted tool, canonical events, text selection,
 * permissions, updates, transforms, deletion, text input, strategies, and leaks.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  BUILT_IN_ANNOTATION_TYPES,
  type Annotation,
  type AnnotationType
} from '../../../src/domain/annotation'
import type { InkLayerError } from '../../../src/domain/errors'
import { createMemoryAnnotationRepository } from '../../../src/repository/memory-annotation-repository'
import { parseAndValidateKonvaSnapshot } from '../../../src/renderer/konva/snapshot'
import {
  createAnnotationEngine,
  type AnnotationEngineOptions
} from '../../../src/annotation/annotation-engine'
import { createTestAnnotation } from '../../helpers/annotation'
import { createAnnotationTypeRegistry } from '../../../src/annotation-types/annotation-type-registry'
import { createTestAnnotationTypeDefinition } from '../../helpers/annotation-type'

/** Creates the root state surface used before a page renderer is attached. */
function createRoot(): HTMLElement & { classNames: Set<string>; attributes: Map<string, string> } {
  const classNames = new Set<string>()
  const attributes = new Map<string, string>()
  return {
    classNames,
    attributes,
    dataset: {},
    classList: {
      add: (...tokens: string[]) => tokens.forEach((token) => classNames.add(token)),
      remove: (...tokens: string[]) => tokens.forEach((token) => classNames.delete(token))
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    focus: vi.fn()
  } as unknown as HTMLElement & { classNames: Set<string>; attributes: Map<string, string> }
}

/** Creates deterministic engine options and unique annotation identifiers. */
function createOptions(overrides: Partial<AnnotationEngineOptions> = {}): AnnotationEngineOptions {
  let sequence = 0
  return {
    root: createRoot(),
    currentUser: { id: 'alice', name: 'Alice' },
    clock: { now: () => '2025-08-10T12:00:00Z' },
    idGenerator: { next: () => `id-${sequence += 1}` },
    logger: { warn: vi.fn(), error: vi.fn() },
    ...overrides
  }
}

/** Returns tool-specific creation fields required by image and line tools. */
function toolFields(type: AnnotationType): Partial<Parameters<ReturnType<typeof createAnnotationEngine>['createAnnotation']>[0]> {
  if (type === 'stamp') return { content: { text: '', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=' } }
  if (type === 'free-text' || type === 'note') return { content: { text: 'Hello' } }
  if (['freehand', 'free-highlight', 'line', 'arrow', 'polygon', 'polyline'].includes(type)) {
    return { points: [10, 20, 100, 70] }
  }
  if (type === 'signature') return { points: [10, 20, 100, 70] }
  return {}
}

describe('Annotation Engine tools', () => {
  it('owns only fallback root semantics and validates keyboard movement steps', () => {
    const root = createRoot()
    const engine = createAnnotationEngine(createOptions({ root }))
    expect(Object.fromEntries(root.attributes)).toEqual({
      tabindex: '0', role: 'region', 'aria-label': 'PDF annotation canvas'
    })
    engine.destroy()
    expect(root.attributes.size).toBe(0)

    const labelled = createRoot()
    labelled.attributes.set('role', 'document')
    labelled.attributes.set('aria-label', 'Localized document')
    const preserved = createAnnotationEngine(createOptions({
      root: labelled,
      keyboard: { enabled: false }
    }))
    expect(Object.fromEntries(labelled.attributes)).toEqual({
      role: 'document', 'aria-label': 'Localized document'
    })
    preserved.destroy()
    expect(Object.fromEntries(labelled.attributes)).toEqual({
      role: 'document', 'aria-label': 'Localized document'
    })

    expect(() => createAnnotationEngine(createOptions({
      keyboard: { nudgeStep: 0 }
    }))).toThrowError(expect.objectContaining({ code: 'ANNOTATION_INVALID' }))
  })

  it('publishes default and overridden interactive creation modes', () => {
    const engine = createAnnotationEngine(createOptions({
      creationModes: { rectangle: 'continuous' }
    }))
    expect(engine.getCreationMode('highlight')).toBe('continuous')
    expect(engine.getCreationMode('rectangle')).toBe('continuous')
    expect(engine.getCreationMode('stamp')).toBe('once')
    expect(() => createAnnotationEngine(createOptions({
      creationModes: { circle: 'invalid' as 'once' }
    }))).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    engine.destroy()
  })

  it('selects an installed custom tool through Definition metadata and resets it on unload', () => {
    const registry = createAnnotationTypeRegistry()
    const unregister = registry.register(createTestAnnotationTypeDefinition())
    const engine = createAnnotationEngine(createOptions({ annotationTypes: registry }))

    engine.setTool('custom:test/box')
    expect(engine.getTool()).toBe('custom:test/box')
    expect(engine.getCreationMode('custom:test/box')).toBe('once')
    expect(engine.getAppearanceCapabilities('custom:test/box')).toMatchObject({
      stroke: true, fill: true, text: false
    })

    unregister()
    expect(engine.getTool()).toBe('select')
    expect(() => engine.setTool('custom:test/box')).toThrowError(
      expect.objectContaining({ code: 'ANNOTATION_TYPE_UNAVAILABLE' })
    )
    engine.destroy()
    registry.destroy()
  })

  it('initializes and transforms custom canonical data through pure Definition callbacks', () => {
    const registry = createAnnotationTypeRegistry()
    const initialize = vi.fn((input: { readonly bounds: Annotation['bounds'] }) => {
      expect(Object.isFrozen(input)).toBe(true)
      expect(Object.isFrozen(input.bounds)).toBe(true)
      return {
        bounds: { ...input.bounds },
        typeData: {
          schemaVersion: 1,
          payload: { width: input.bounds.width, height: input.bounds.height }
        }
      }
    })
    const base = createTestAnnotationTypeDefinition('custom:test/initialized', {
      supportedSchemaVersions: [1],
      /** Requires positive generated dimensions. */
      validate(payload) {
        if (typeof payload !== 'object' || payload === null) throw new Error('Invalid dimensions.')
      }
    })
    registry.register({
      ...base,
      creation: { controller: 'drag-box', initialize },
      interaction: {
        /** Synchronizes dimensions after a direct transform. */
        reduceTransform(_annotation, input) {
          return {
            bounds: { ...input.bounds },
            typeData: {
              schemaVersion: 1,
              payload: { width: input.bounds.width, height: input.bounds.height }
            }
          }
        }
      }
    })
    const engine = createAnnotationEngine(createOptions({ annotationTypes: registry }))
    const created = engine.createAnnotation({
      type: 'custom:test/initialized', pageIndex: 0,
      bounds: { x: 5, y: 6, width: 70, height: 30 }
    })
    expect(initialize).toHaveBeenCalledOnce()
    expect(created.typeData).toEqual({
      schemaVersion: 1, payload: { width: 70, height: 30 }
    })

    const transformed = engine.transformAnnotation(created.id, {
      bounds: { x: 15, y: 16, width: 90, height: 40 },
      serialized: 'custom-transform-does-not-trust-konva-input'
    })
    expect(transformed.bounds).toEqual({ x: 15, y: 16, width: 90, height: 40 })
    expect(transformed.typeData).toEqual({
      schemaVersion: 1, payload: { width: 90, height: 40 }
    })
    engine.destroy()
    registry.destroy()
  })

  it('owns image placement assets and exposes active cursor readiness state', () => {
    const root = createRoot()
    const engine = createAnnotationEngine(createOptions({ root }))
    const asset = {
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=',
      width: 120,
      height: 50,
      text: 'Approved'
    }
    engine.setTool('stamp')
    expect(root.dataset['inklayerImageAsset']).toBe('missing')
    engine.setImageAsset('stamp', asset)
    expect(root.dataset['inklayerImageAsset']).toBe('ready')
    expect(engine.getImageAsset('stamp')).toEqual(asset)
    const detached = engine.getImageAsset('stamp')
    if (detached !== null) detached.width = 1
    expect(engine.getImageAsset('stamp')?.width).toBe(120)
    engine.setImageAsset('stamp', null)
    expect(engine.getImageAsset('stamp')).toBeNull()
    expect(() => engine.setImageAsset('signature', { ...asset, width: 0 })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' })
    )
    engine.destroy()
  })

  it('creates every persisted type with validated exact Konva state', () => {
    const engine = createAnnotationEngine(createOptions())
    const types = [...BUILT_IN_ANNOTATION_TYPES]
    expect(types).toHaveLength(16)
    for (const type of types) {
      const annotation = engine.createAnnotation({
        type,
        pageIndex: 0,
        bounds: { x: 10, y: 20, width: 100, height: 50 },
        ...toolFields(type)
      })
      const snapshot = parseAndValidateKonvaSnapshot(annotation.rendererState.serialized, {
        annotationId: annotation.id
      })
      expect(snapshot.nodeCount).toBeGreaterThan(1)
      expect(annotation.type).toBe(type)
      expect(annotation.referenceNumber).toBe(types.indexOf(type) + 1)
    }
    expect(engine.repository.getAll()).toHaveLength(16)
    engine.destroy()
  })

  it('supports explicit image and ink Signature variants without fallback geometry', () => {
    const engine = createAnnotationEngine(createOptions())
    const image = engine.createAnnotation({
      type: 'signature', pageIndex: 0, bounds: { x: 10, y: 20, width: 80, height: 30 },
      content: {
        text: '',
        signature: { kind: 'image', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=' }
      }
    })
    const ink = engine.createAnnotation({
      type: 'signature', pageIndex: 0, bounds: { x: 1, y: 2, width: 30, height: 20 },
      strokes: [[1, 2, 10, 8], [15, 10, 30, 22]]
    })
    expect(JSON.parse(image.rendererState.serialized)).toMatchObject({
      children: [{ className: 'Image', attrs: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=' } }]
    })
    expect(ink.content?.signature).toEqual({
      kind: 'ink', strokes: [[1, 2, 10, 8], [15, 10, 30, 22]]
    })
    expect(JSON.parse(ink.rendererState.serialized).children).toHaveLength(2)
    expect(() => engine.createAnnotation({
      type: 'signature', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    engine.destroy()
  })

  it('creates distinct markup geometry and emits normalized text selection', () => {
    const engine = createAnnotationEngine(createOptions())
    const listener = vi.fn()
    engine.subscribe(listener)
    const selection = {
      pageIndex: 2,
      text: 'selected',
      rects: [
        { x: 10, y: 20, width: 40, height: 10 },
        { x: 10, y: 32, width: 60, height: 10 }
      ]
    }
    const highlight = engine.createTextMarkup('highlight', selection)
    const strikeout = engine.createTextMarkup('strikeout', selection)
    const underline = engine.createTextMarkup('underline', selection)
    expect(highlight.bounds).toEqual({ x: 10, y: 20, width: 60, height: 22 })
    expect(highlight.content?.selectedText).toBe('selected')
    expect(strikeout.rendererState.serialized).not.toBe(highlight.rendererState.serialized)
    expect(underline.rendererState.serialized).not.toBe(strikeout.rendererState.serialized)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'textSelected' }))
    engine.destroy()
  })

  it('resolves per-type tool appearance and restyles an existing snapshot', () => {
    const engine = createAnnotationEngine(createOptions({
      defaultAppearances: { highlight: { fill: { color: '#00ff00' } } }
    }))
    expect(engine.getToolAppearance('highlight')).toMatchObject({
      stroke: null,
      fill: { color: '#00ff00', opacity: 0.5 }
    })
    expect(engine.getAppearanceCapabilities('highlight')).toMatchObject({
      stroke: false, fill: true, text: false
    })
    engine.setToolAppearance('rectangle', {
      stroke: { color: '#1677ff', width: 4, dash: [8, 4] },
      fill: { color: '#e6f4ff', opacity: 0.2 }
    })
    const created = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 1, y: 2, width: 30, height: 40 }
    })
    expect(created.appearance).toMatchObject({
      stroke: { color: '#1677ff', width: 4, dash: [8, 4] },
      fill: { color: '#e6f4ff', opacity: 0.2 }
    })
    const before = parseAndValidateKonvaSnapshot(created.rendererState.serialized).root
    const updated = engine.updateAppearance(created.id, { stroke: { width: 7 } })
    const after = parseAndValidateKonvaSnapshot(updated.rendererState.serialized).root
    expect(updated.appearance.stroke?.width).toBe(7)
    expect(after.children?.[0]?.attrs).toMatchObject({
      x: before.children?.[0]?.attrs['x'],
      y: before.children?.[0]?.attrs['y'],
      strokeWidth: 7
    })
    expect(() => engine.setToolAppearance('highlight', { stroke: { color: '#000000' } }))
      .toThrow(RangeError)
    engine.destroy()
  })

  it('emits detached add, update, selection, transform, delete, and tool events', () => {
    const engine = createAnnotationEngine(createOptions())
    const events: string[] = []
    engine.subscribe((event) => events.push(event.type))
    engine.setTool('rectangle')
    const annotation = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })
    engine.updateAnnotation(annotation.id, (current) => ({
      ...current, content: { text: 'updated' }
    }))
    engine.setSelection({ ids: [annotation.id], primaryId: annotation.id })
    engine.transformAnnotation(annotation.id, {
      bounds: { x: 5, y: 5, width: 10, height: 10 },
      serialized: annotation.rendererState.serialized
    })
    engine.deleteAnnotation(annotation.id)
    expect(events).toEqual([
      'toolChanged', 'annotationAdded', 'annotationUpdated', 'selectionChanged',
      'annotationUpdated', 'annotationDeleted', 'selectionChanged'
    ])
    engine.destroy()
  })

  it('emits selection origins and coordinates independent hover sources', () => {
    const engine = createAnnotationEngine(createOptions())
    const first = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })
    const second = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 20, y: 0, width: 10, height: 10 }
    })
    const events: Array<{ type: string; source?: string | null; annotationId?: string | null; isClick?: boolean }> = []
    engine.subscribe((event) => events.push(event))
    engine.setSelection({ ids: [first.id], primaryId: first.id }, 'sidebar', true)
    engine.setHoveredAnnotation(first.id, 'sidebar-pointer')
    engine.setHoveredAnnotation(second.id, 'canvas')
    engine.setHoveredAnnotation(null, 'canvas')
    expect(events).toEqual([
      expect.objectContaining({ type: 'selectionChanged', source: 'sidebar', isClick: true }),
      expect.objectContaining({ type: 'hoverChanged', source: 'sidebar-pointer', annotationId: first.id }),
      expect.objectContaining({ type: 'hoverChanged', source: 'canvas', annotationId: second.id }),
      expect.objectContaining({ type: 'hoverChanged', source: 'sidebar-pointer', annotationId: first.id })
    ])
    engine.destroy()
  })

  it('enforces owner permissions for edits and deletion', () => {
    const engine = createAnnotationEngine(createOptions({ permissions: { mode: 'owner-only' } }))
    const annotation = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })
    engine.setCurrentUser({ id: 'bob', name: 'Bob' })
    expect(() => engine.updateAnnotation(annotation.id, (current) => current)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' })
    )
    expect(() => engine.deleteAnnotation(annotation.id)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' })
    )
    engine.destroy()
  })

  it('rejects oversized creation geometry before building renderer JSON', () => {
    const engine = createAnnotationEngine(createOptions())
    expect(() => engine.createAnnotation({
      type: 'cloud', pageIndex: 0,
      bounds: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 }
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    expect(() => engine.createAnnotation({
      type: 'freehand', pageIndex: 0,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      points: [0, Number.NaN]
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    engine.destroy()
  })

  it('uses the text input port and cancels it during destruction', async () => {
    const requestText = vi.fn(async () => ({ value: 'Typed text' }))
    const submitted = createAnnotationEngine(createOptions({
      textInputProvider: { requestText }
    }))
    await expect(submitted.requestFreeText(0, { x: 0, y: 0, width: 100, height: 30 }))
      .resolves.toMatchObject({ type: 'free-text', content: { text: 'Typed text' } })
    expect(requestText).toHaveBeenCalledWith(expect.objectContaining({
      pageIndex: 0,
      scale: 1,
      pageBounds: { x: 0, y: 0, width: 100, height: 30 },
      bounds: { x: 0, y: 0, width: 100, height: 30 }
    }))
    submitted.destroy()

    const pending = createAnnotationEngine(createOptions({
      textInputProvider: {
        requestText: (request) => new Promise((resolve) => {
          request.signal.addEventListener('abort', () => resolve({ value: null }), { once: true })
        })
      }
    }))
    const result = pending.requestFreeText(0, { x: 0, y: 0, width: 100, height: 30 })
    pending.destroy()
    await expect(result).resolves.toBeNull()
  })

  it('edits existing FreeText through the input port and synchronizes renderer text', async () => {
    const requestText = vi.fn(async () => ({ value: 'Edited text' }))
    const engine = createAnnotationEngine(createOptions({ textInputProvider: { requestText } }))
    const annotation = engine.createAnnotation({
      type: 'free-text', pageIndex: 0,
      bounds: { x: 10, y: 20, width: 100, height: 30 },
      content: { text: 'Original text' }
    })
    const updated = await engine.requestEditText(annotation.id)
    const snapshot = parseAndValidateKonvaSnapshot(updated?.rendererState.serialized ?? '{}').root
    expect(requestText).toHaveBeenCalledWith(expect.objectContaining({
      pageIndex: 0,
      initialValue: 'Original text',
      pageBounds: annotation.bounds
    }))
    expect(updated?.content?.text).toBe('Edited text')
    expect(snapshot.children?.find((child) => child.className === 'Text')?.attrs['text'])
      .toBe('Edited text')
    engine.destroy()
  })

  it('keeps content and appearance snapshots canonical during semantic updates', () => {
    const engine = createAnnotationEngine(createOptions())
    const note = engine.createAnnotation({
      type: 'note', pageIndex: 0, bounds: { x: 1, y: 2, width: 24, height: 24 },
      content: { text: 'Before' }
    })
    const updated = engine.updateAnnotation(note.id, (current) => ({
      ...current,
      content: { text: 'After' },
      appearance: {
        ...current.appearance,
        text: current.appearance.text === null
          ? null
          : { ...current.appearance.text, fontSize: 18 }
      }
    }))
    const snapshot = parseAndValidateKonvaSnapshot(updated.rendererState.serialized).root
    const text = snapshot.children?.find((child) => child.className === 'Text')
    expect(text?.attrs).toMatchObject({ text: 'After', fontSize: 18 })
    expect(() => engine.updateAnnotation(note.id, (current) => ({
      ...current, bounds: { ...current.bounds, x: 99 }
    }))).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    engine.destroy()
  })

  it('rejects text editing for annotations without editable text surfaces', async () => {
    const engine = createAnnotationEngine(createOptions())
    const rectangle = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })
    await expect(engine.requestEditText(rectangle.id)).rejects.toMatchObject({
      code: 'ANNOTATION_INVALID'
    })
    engine.destroy()
  })

  it('applies comment permissions without changing exact renderer state', () => {
    const engine = createAnnotationEngine(createOptions({ permissions: { mode: 'owner-only' } }))
    const annotation = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })
    const rendererState = annotation.rendererState
    const withComment = engine.addComment(annotation.id, {
      id: 'comment-1', title: 'Alice', content: 'Review', date: null,
      author: { id: 'alice', name: 'Alice' }
    })
    expect(withComment.rendererState).toEqual(rendererState)
    engine.changeCommentStatus(annotation.id, 'comment-1', 'Completed')
    engine.setCurrentUser({ id: 'bob', name: 'Bob' })
    expect(() => engine.updateComment(annotation.id, 'comment-1', (comment) => ({
      ...comment, content: 'Not allowed'
    }))).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    engine.setCurrentUser({ id: 'alice', name: 'Alice' })
    const withoutComment = engine.deleteComment(annotation.id, 'comment-1')
    expect(withoutComment.comments).toEqual([])
    expect(withoutComment.rendererState).toEqual(rendererState)
    engine.destroy()
  })

  it('restores deleted comments and annotations from bounded command history', () => {
    const engine = createAnnotationEngine(createOptions())
    const annotation = engine.createAnnotation({
      type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 10, height: 10 }
    })
    engine.addComment(annotation.id, {
      id: 'comment-1', title: 'Alice', content: 'Restore me', date: null,
      author: { id: 'alice', name: 'Alice' }
    })
    engine.deleteComment(annotation.id, 'comment-1')
    expect(engine.canUndoDeletion()).toBe(true)
    expect(engine.undoLastDeletion()?.comments).toMatchObject([{ id: 'comment-1' }])
    engine.deleteAnnotation(annotation.id)
    expect(engine.repository.getById(annotation.id)).toBeUndefined()
    expect(engine.undoLastDeletion()).toMatchObject({ id: annotation.id })
    expect(engine.repository.getById(annotation.id)).toBeDefined()
    expect(engine.canUndoDeletion()).toBe(false)
    engine.destroy()
  })
})

describe('Annotation Engine safety and lifecycle', () => {
  it('preserves unavailable custom annotations, allows generic operations, and restores behavior', () => {
    const repository = createMemoryAnnotationRepository()
    const annotationTypes = createAnnotationTypeRegistry()
    repository.add(createTestAnnotation({
      type: 'custom:test/box',
      rendererState: {
        engine: 'konva', schemaVersion: 1, serialized: 'unknown-state-must-not-be-parsed'
      },
      typeData: { schemaVersion: 1, payload: { label: 'A' } }
    }))
    const engine = createAnnotationEngine(createOptions({
      repository, annotationTypes, snapshotStrategy: 'strict'
    }))

    const commented = engine.addComment('annotation-1', {
      id: 'comment-1', title: 'Alice', content: 'Preserved', date: null,
      author: { id: 'alice', name: 'Alice' }
    })
    expect(commented.typeData).toEqual({ schemaVersion: 1, payload: { label: 'A' } })
    expect(commented.rendererState.serialized).toBe('unknown-state-must-not-be-parsed')
    expect(() => engine.updateAnnotation('annotation-1', (current) => current)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_UNAVAILABLE' })
    )

    const unregister = annotationTypes.register(createTestAnnotationTypeDefinition(
      'custom:test/box',
      {
        supportedSchemaVersions: [1],
        /** Accepts the fixture payload. */
        validate() {}
      }
    ))
    const updated = engine.updateAnnotation('annotation-1', (current) => ({
      ...current, content: { text: 'Definition restored' }
    }))
    expect(updated.content?.text).toBe('Definition restored')
    expect(updated.rendererState.serialized).not.toContain('unknown-state-must-not-be-parsed')
    expect(parseAndValidateKonvaSnapshot(updated.rendererState.serialized).root.children?.[0]?.className)
      .toBe('Rect')

    unregister()
    expect(() => engine.updateAppearance('annotation-1', { opacity: 0.5 })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_UNAVAILABLE' })
    )
    expect(engine.deleteAnnotation('annotation-1')?.typeData).toEqual({
      schemaVersion: 1, payload: { label: 'A' }
    })
    engine.destroy()
    repository.destroy()
    annotationTypes.destroy()
  })

  it('supports strict failure and observable lenient skipping', () => {
    const repository = createMemoryAnnotationRepository()
    repository.add(createTestAnnotation({ rendererState: {
      engine: 'konva', schemaVersion: 1, serialized: '{bad'
    } }))
    const strictRoot = createRoot()
    expect(() => createAnnotationEngine(createOptions({
      root: strictRoot, repository, snapshotStrategy: 'strict'
    }))).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'KONVA_SNAPSHOT_INVALID' }))
    expect(strictRoot.classNames).not.toContain('inklayer-engine')
    const onWarning = vi.fn()
    const lenient = createAnnotationEngine(createOptions({ repository, onWarning }))
    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ANNOTATION_SKIPPED', annotationId: 'annotation-1'
    }))
    lenient.destroy()
    repository.destroy()
  })

  it('isolates listener errors through Logger', () => {
    const logger = { warn: vi.fn(), error: vi.fn() }
    const engine = createAnnotationEngine(createOptions({ logger }))
    engine.subscribe(() => { throw new Error('listener') })
    engine.setTool('circle')
    expect(logger.error).toHaveBeenCalledOnce()
    engine.destroy()
  })

  it('creates and destroys 100 instances without retained root state', () => {
    for (let index = 0; index < 100; index += 1) {
      const root = createRoot()
      const engine = createAnnotationEngine(createOptions({ root }))
      engine.setTool('rectangle')
      engine.destroy()
      engine.destroy()
      expect(root.classNames.size).toBe(0)
      expect(root.dataset).toEqual({})
      expect(() => engine.createAnnotation({
        type: 'rectangle', pageIndex: 0, bounds: { x: 0, y: 0, width: 1, height: 1 }
      })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ENGINE_DESTROYED' }))
    }
  })

  it('does not destroy an externally owned repository', () => {
    const repository = createMemoryAnnotationRepository()
    const engine = createAnnotationEngine(createOptions({ repository }))
    engine.destroy()
    expect(repository.getAll()).toEqual([])
    repository.destroy()
  })
})
