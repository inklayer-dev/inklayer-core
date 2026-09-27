/** @file Tests public viewport geometry without coupling callers to renderer internals. */
import { describe, expect, it, vi } from 'vitest'
import { createAnnotationEngine } from '../../../src/annotation/annotation-engine'

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
})
