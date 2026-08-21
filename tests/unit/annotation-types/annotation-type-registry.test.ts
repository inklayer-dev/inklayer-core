/**
 * @file Annotation Type Registry contract tests.
 * @description Covers identity protection, Definition validation, payload
 * compatibility, lifecycle cleanup, and structured unavailable behavior.
 */

import { describe, expect, it, vi } from 'vitest'
import { createAnnotationTypeRegistry } from '../../../src/annotation-types/annotation-type-registry'
import type { AnnotationTypeDefinition } from '../../../src/annotation-types/contracts'
import type { InkLayerError } from '../../../src/domain/errors'
import { createTestAnnotation } from '../../helpers/annotation'
import { createTestAnnotationTypeDefinition } from '../../helpers/annotation-type'

describe('Annotation Type Registry', () => {
  it('protects built-ins and rejects invalid or duplicate external Definitions', () => {
    const registry = createAnnotationTypeRegistry()
    expect(registry.has('rectangle')).toBe(true)
    expect(registry.list()).toContain('cloud')
    expect(registry.get('rectangle')).toMatchObject({
      type: 'rectangle', geometry: 'box', renderer: { strategy: 'core' }
    })

    expect(() => registry.register({
      ...createTestAnnotationTypeDefinition(), type: 'rectangle'
    } as unknown as AnnotationTypeDefinition)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_RESERVED' })
    )
    expect(() => registry.register({
      ...createTestAnnotationTypeDefinition(), type: 'custom:Bad/id'
    } as AnnotationTypeDefinition)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_DEFINITION_INVALID' })
    )

    const definition = createTestAnnotationTypeDefinition()
    registry.register(definition)
    expect(() => registry.register(definition)).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_DUPLICATE' })
    )
    registry.destroy()
  })

  it('publishes registration changes and returns an idempotent disposer', () => {
    const registry = createAnnotationTypeRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    const dispose = registry.register(createTestAnnotationTypeDefinition())
    expect(registry.has('custom:test/box')).toBe(true)
    dispose()
    dispose()
    expect(registry.has('custom:test/box')).toBe(false)
    expect(listener.mock.calls.map(([event]) => event.type)).toEqual(['registered', 'unregistered'])
    registry.destroy()
  })

  it('preserves missing and unsupported payloads while validating compatible data', () => {
    const validate = vi.fn((payload: unknown) => {
      expect(Object.isFrozen(payload)).toBe(true)
    })
    const registry = createAnnotationTypeRegistry()
    const annotation = createTestAnnotation({
      type: 'custom:test/box',
      typeData: { schemaVersion: 2, payload: { length: 12 } }
    })
    expect(registry.resolve(annotation).status).toBe('missing-definition')
    expect(() => registry.require(annotation, 'editCustom')).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_UNAVAILABLE' })
    )

    registry.register(createTestAnnotationTypeDefinition('custom:test/box', {
      supportedSchemaVersions: [1], validate
    }))
    expect(registry.resolve(annotation).status).toBe('unsupported-data-version')
    expect(validate).not.toHaveBeenCalled()

    const compatible = createTestAnnotation({
      ...annotation,
      typeData: { schemaVersion: 1, payload: { length: 12 } }
    })
    expect(registry.validate(compatible).status).toBe('available')
    expect(validate).toHaveBeenCalledTimes(1)
    expect(compatible.typeData?.payload).toEqual({ length: 12 })
    registry.destroy()
  })

  it('invokes controlled renderers with detached deeply frozen annotations', () => {
    const render = vi.fn((annotation: Readonly<ReturnType<typeof createTestAnnotation>>) => {
      expect(Object.isFrozen(annotation)).toBe(true)
      expect(Object.isFrozen(annotation.bounds)).toBe(true)
      return { children: [] as const }
    })
    const registry = createAnnotationTypeRegistry()
    registry.register(createTestAnnotationTypeDefinition('custom:test/box', undefined, {
      renderer: { render }
    }))
    const annotation = createTestAnnotation({ type: 'custom:test/box' })
    expect(registry.renderControlled(annotation, 'testRender')).toEqual({ children: [] })
    expect(render).toHaveBeenCalledOnce()
    expect(() => registry.renderControlled(
      createTestAnnotation({ type: 'rectangle' }), 'testBuiltInRender'
    )).toThrowError(expect.objectContaining<Partial<InkLayerError>>({
      code: 'ANNOTATION_TYPE_UNAVAILABLE'
    }))
    registry.destroy()
  })

  it('rejects malformed capability, appearance, and codec contracts before publication', () => {
    const registry = createAnnotationTypeRegistry()
    const valid = createTestAnnotationTypeDefinition()
    for (const definition of [
      { ...valid, apiVersion: 2 },
      { ...valid, geometry: 'arbitrary' },
      { ...valid, creation: { controller: 'point' } },
      { ...valid, appearance: { defaults: { ...valid.appearance.defaults, opacity: 2 } } },
      { ...valid, appearance: {
        ...valid.appearance,
        controls: {
          stroke: false, fill: true, text: false,
          dash: false, lineCap: false, lineJoin: false
        }
      } },
      { ...valid, data: {
        supportedSchemaVersions: [1, 1],
        /** Accepts any payload; duplicate versions make the codec invalid. */
        validate() {}
      } }
    ]) {
      expect(() => registry.register(definition as AnnotationTypeDefinition)).toThrowError(
        expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_DEFINITION_INVALID' })
      )
    }
    registry.destroy()
  })
})
