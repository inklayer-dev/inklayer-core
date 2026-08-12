/**
 * @file Annotation Engine facade integration tests.
 * @description Covers every persisted tool, canonical events, text selection,
 * permissions, updates, transforms, deletion, text input, strategies, and leaks.
 */

import { describe, expect, it, vi } from 'vitest'
import type { AnnotationType } from '../../../src/domain/annotation'
import type { InkLayerError } from '../../../src/domain/errors'
import { createMemoryAnnotationRepository } from '../../../src/repository/memory-annotation-repository'
import { parseAndValidateKonvaSnapshot } from '../../../src/renderer/konva/snapshot'
import {
  createAnnotationEngine,
  type AnnotationEngineOptions
} from '../../../src/annotation/annotation-engine'
import { ANNOTATION_TOOL_DEFINITIONS } from '../../../src/annotation/tools'
import { createTestAnnotation } from '../../helpers/annotation'

/** Creates the root state surface used before a page renderer is attached. */
function createRoot(): HTMLElement & { classNames: Set<string> } {
  const classNames = new Set<string>()
  return {
    classNames,
    dataset: {},
    classList: {
      add: (...tokens: string[]) => tokens.forEach((token) => classNames.add(token)),
      remove: (...tokens: string[]) => tokens.forEach((token) => classNames.delete(token))
    }
  } as unknown as HTMLElement & { classNames: Set<string> }
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
  if (type === 'stamp') return { content: { text: '', image: 'data:image/png;base64,AA==' } }
  if (type === 'free-text' || type === 'note') return { content: { text: 'Hello' } }
  if (['freehand', 'free-highlight', 'signature', 'line', 'arrow', 'polygon', 'polyline'].includes(type)) {
    return { points: [10, 20, 100, 70] }
  }
  return {}
}

describe('Annotation Engine tools', () => {
  it('creates every persisted type with validated exact Konva state', () => {
    const engine = createAnnotationEngine(createOptions())
    const types = Object.keys(ANNOTATION_TOOL_DEFINITIONS) as AnnotationType[]
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
})

describe('Annotation Engine safety and lifecycle', () => {
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
