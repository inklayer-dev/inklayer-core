/**
 * @file Canonical annotation test factory.
 * @description Produces complete, valid annotations so unit tests can override
 * only fields relevant to their behavior.
 */

import { isBuiltInAnnotationType, type Annotation } from '../../src/domain/annotation'
import { getDefaultAnnotationAppearance } from '../../src/domain/appearance'

/** Creates one complete canonical annotation with shallow field overrides. */
export function createTestAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  const type = overrides.type ?? 'rectangle'
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
    appearance: overrides.appearance ?? getDefaultAnnotationAppearance(
      isBuiltInAnnotationType(type) ? type : 'rectangle'
    ),
    rendererState: {
      engine: 'konva',
      schemaVersion: 1,
      serialized: '{"className":"Group","attrs":{"id":"annotation-1"}}'
    },
    ...overrides
  }
}
