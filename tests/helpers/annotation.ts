/**
 * @file Canonical annotation test factory.
 * @description Produces complete, valid annotations so unit tests can override
 * only fields relevant to their behavior.
 */

import type { Annotation } from '../../src/domain/annotation'

/** Creates one complete canonical annotation with shallow field overrides. */
export function createTestAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation-1',
    schemaVersion: 1,
    type: 'rectangle',
    pageIndex: 0,
    bounds: { x: 10, y: 20, width: 100, height: 50 },
    coordinateSpace: 'konva-stage',
    comments: [],
    author: { id: 'alice', name: 'Alice' },
    createdAt: '2025-08-10T12:00:00Z',
    native: false,
    rendererState: {
      engine: 'konva',
      schemaVersion: 1,
      serialized: '{"className":"Group","attrs":{"id":"annotation-1"}}'
    },
    ...overrides
  }
}
