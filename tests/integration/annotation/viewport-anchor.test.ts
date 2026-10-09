/** @file Tests public viewport geometry without coupling callers to renderer internals. */
import { describe, expect, it, vi } from 'vitest'
import { createAnnotationEngine } from '../../../src/annotation/annotation-engine'
import type { InkLayerError } from '../../../src/domain/errors'
import { parseAndValidateKonvaSnapshot } from '../../../src/renderer/konva/snapshot'

vi.mock('../../../src/annotation/internal/painter/konva-painter', () => ({
  createKonvaPainter: () => new Proxy({}, { get: () => vi.fn() })
}))

/** Minimal root supporting engine-owned attributes and lifecycle. */
function root(): HTMLElement {
  const attrs = new Map<string, string>()
  return {
    dataset: {}, style: { removeProperty: vi.fn() },
    classList: { add: vi.fn(), remove: vi.fn() },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    hasAttribute: (key: string) => attrs.has(key),
    setAttribute: (key: string, value: string) => attrs.set(key, value),
    getAttribute: (key: string) => attrs.get(key) ?? null,
    removeAttribute: (key: string) => attrs.delete(key)
  } as unknown as HTMLElement
}

describe('viewport anchors', () => {
  it('projects fresh CSS geometry, not device pixels, and returns null through detach/destroy', async () => {
    const engine = createAnnotationEngine({ root: root(), currentUser: { id: 'a', name: 'A' } })
    const events: string[] = []
    engine.subscribe((event) => events.push(event.type))
    const annotation = engine.createAnnotation({ type: 'rectangle', pageIndex: 0, bounds: { x: 10, y: 20, width: 100, height: 50 } })
    expect(engine.getViewportAnchor(annotation.id)).toBeNull()
    let rect = { left: 200, top: 100, width: 900, height: 1200 }
    const container = { isConnected: true, getBoundingClientRect: () => rect } as HTMLDivElement
    await engine.attachPage({ pageIndex: 0, container, width: 600, height: 800, scale: 1.5 })
    const before = engine.getAnnotations()
    expect(engine.getViewportAnchor(annotation.id)?.bounds).toEqual({ left: 215, top: 130, width: 150, height: 75 })
    rect = { left: 40, top: -300, width: 600, height: 800 }
    expect(engine.getViewportAnchor(annotation.id)?.bounds).toEqual({ left: 50, top: -280, width: 100, height: 50 })
    expect(engine.getAnnotations()).toEqual(before)
    expect(engine.getViewportAnchor('missing')).toBeNull()
    engine.detachPage(0)
    expect(engine.getViewportAnchor(annotation.id)).toBeNull()
    expect(events.filter((type) => type === 'viewportAnchorsChanged')).toHaveLength(3)
    engine.destroy()
    expect(engine.getViewportAnchor(annotation.id)).toBeNull()
  })

  it('uses attached landscape geometry and invalidates after deletion', async () => {
    const engine = createAnnotationEngine({ root: root() })
    const annotation = engine.createAnnotation({ type: 'rectangle', pageIndex: 2, bounds: { x: 20, y: 40, width: 80, height: 30 } })
    const container = { isConnected: true, getBoundingClientRect: () => ({ left: 10, top: 20, width: 1600, height: 1200 }) } as HTMLDivElement
    await engine.attachPage({ pageIndex: 2, container, width: 800, height: 600, scale: 2 })
    expect(engine.getViewportAnchor(annotation.id)?.bounds).toEqual({ left: 50, top: 100, width: 160, height: 60 })
    engine.deleteAnnotation(annotation.id)
    expect(engine.getViewportAnchor(annotation.id)).toBeNull()
    engine.destroy()
  })

  it('updates image bounds without exposing renderer state and preserves related data', async () => {
    const engine = createAnnotationEngine({
      root: root(), currentUser: { id: 'a', name: 'A' }
    })
    const annotation = engine.createAnnotation({
      type: 'stamp', pageIndex: 0, bounds: { x: 20, y: 30, width: 80, height: 40 },
      content: {
        text: 'Approved',
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII='
      },
      extensions: { purpose: 'seal' }
    })
    const container = {
      isConnected: true,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 600 })
    } as HTMLDivElement
    await engine.attachPage({ pageIndex: 0, container, width: 200, height: 300, scale: 2 })
    engine.setSelection({ ids: [annotation.id], primaryId: annotation.id })
    const updates: string[] = []
    engine.subscribe((event) => { if (event.type === 'annotationUpdated') updates.push(event.annotation.id) })

    const resized = engine.updateAnnotationBounds(annotation.id, {
      x: 16, y: 28, width: 88, height: 44
    })
    const rootNode = parseAndValidateKonvaSnapshot(resized.rendererState.serialized).root
    expect(resized).toMatchObject({
      bounds: { x: 16, y: 28, width: 88, height: 44 },
      content: annotation.content,
      extensions: annotation.extensions
    })
    expect(rootNode.attrs).toMatchObject({ x: -6, y: -5, scaleX: 1.1, scaleY: 1.1 })
    expect(engine.repository.getSelection()).toEqual({ ids: [annotation.id], primaryId: annotation.id })
    expect(engine.getViewportAnchor(annotation.id)?.bounds).toEqual({
      left: 42, top: 76, width: 176, height: 88
    })
    expect(updates).toEqual([annotation.id])

    engine.updateAnnotationBounds(annotation.id, resized.bounds)
    expect(updates).toEqual([annotation.id])

    const restored = engine.updateAnnotationBounds(annotation.id, annotation.bounds)
    const restoredAttrs = parseAndValidateKonvaSnapshot(restored.rendererState.serialized).root.attrs
    expect(restoredAttrs.x).toBeCloseTo(0)
    expect(restoredAttrs.y).toBeCloseTo(0)
    expect(restoredAttrs.scaleX).toBeCloseTo(1)
    expect(restoredAttrs.scaleY).toBeCloseTo(1)
    expect(updates).toEqual([annotation.id, annotation.id])

    expect(() => engine.updateAnnotationBounds(annotation.id, {
      x: 20, y: 30, width: 90, height: 40
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    expect(() => engine.updateAnnotationBounds(annotation.id, {
      x: 160, y: 28, width: 88, height: 44
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))

    const note = engine.createAnnotation({
      type: 'note', pageIndex: 0, bounds: { x: 10, y: 10, width: 24, height: 24 },
      content: { text: 'Read' }
    })
    expect(() => engine.updateAnnotationBounds(note.id, {
      x: 8, y: 8, width: 28, height: 28
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    engine.detachPage(0)
    expect(() => engine.updateAnnotationBounds(annotation.id, {
      x: 20, y: 30, width: 80, height: 40
    })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    engine.destroy()
  })
})
