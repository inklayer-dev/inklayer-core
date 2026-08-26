/**
 * @file Protected built-in Definition contract tests.
 * @description Proves every V1 family resolves defaults, creation, interaction,
 * rendering ownership, and PDF policy through the instance Registry.
 */

import { describe, expect, it } from 'vitest'
import { createAnnotationTypeRegistry } from '../../../src/annotation-types/annotation-type-registry'
import { BUILT_IN_ANNOTATION_TYPES, type AnnotationType } from '../../../src/domain/annotation'
import type { AnnotationTypeDefinition } from '../../../src/annotation-types/contracts'
import type { InkLayerError } from '../../../src/domain/errors'
import { createTestAnnotationTypeDefinition } from '../../helpers/annotation-type'

const EXPECTED: Readonly<Record<AnnotationType, readonly [string, string]>> = {
  highlight: ['text-markup', 'text-selection'],
  strikeout: ['text-markup', 'text-selection'],
  underline: ['text-markup', 'text-selection'],
  'free-text': ['text-box', 'text-input'],
  rectangle: ['box', 'drag-box'],
  circle: ['box', 'drag-box'],
  freehand: ['path', 'freehand'],
  'free-highlight': ['path', 'freehand'],
  signature: ['image', 'image-placement'],
  stamp: ['image', 'image-placement'],
  note: ['point', 'point'],
  line: ['line', 'line'],
  arrow: ['line', 'line'],
  polygon: ['polyline', 'polyline'],
  polyline: ['polyline', 'polyline'],
  cloud: ['polyline', 'polyline']
}

describe('built-in Annotation Type Definitions', () => {
  it('installs all seven behavior families as immutable protected Definitions', () => {
    const registry = createAnnotationTypeRegistry()
    expect(registry.list()).toEqual(BUILT_IN_ANNOTATION_TYPES)
    for (const type of BUILT_IN_ANNOTATION_TYPES) {
      const definition = registry.get(type)
      expect(definition).toBeDefined()
      expect([definition?.geometry, definition?.creation.controller]).toEqual(EXPECTED[type])
      expect(definition?.capabilities.creation).toBe(definition?.creation.controller)
      expect(definition?.appearance.controls).toBeDefined()
      expect(definition?.renderer.strategy).toBe('core')
      expect(definition?.capabilities.printable).toBe(true)
      expect(definition?.capabilities.exportable).toBe(true)
      expect(definition?.pdf?.exportStrategy).not.toBe('unsupported')
      expect(Object.isFrozen(definition)).toBe(true)
    }
    expect(registry.get('polygon')?.capabilities.transform).toMatchObject({
      move: true,
      resize: true,
      vertices: false
    })
    expect(registry.get('polyline')?.capabilities.transform.vertices).toBe(true)
    registry.destroy()
  })

  it('keeps built-ins available after custom cleanup and rejects the private renderer marker', () => {
    const registry = createAnnotationTypeRegistry()
    const dispose = registry.register(createTestAnnotationTypeDefinition())
    dispose()
    expect(registry.get('rectangle')?.renderer.strategy).toBe('core')
    expect(() => registry.register({
      ...createTestAnnotationTypeDefinition(), renderer: { strategy: 'core' }
    } as AnnotationTypeDefinition)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_DEFINITION_INVALID' })
    )
    registry.destroy()
  })
})
