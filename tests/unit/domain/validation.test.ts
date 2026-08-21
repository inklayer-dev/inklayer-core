/**
 * @file Canonical annotation runtime validation tests.
 * @description Covers structured errors, finite geometry, schema versions,
 * extensions, renderer envelopes, and duplicate collections.
 */

import { describe, expect, it } from 'vitest'
import type { InkLayerError } from '../../../src/domain/errors'
import { parseAnnotation, parseAnnotations } from '../../../src/domain/validation'
import { createTestAnnotation } from '../../helpers/annotation'

describe('canonical annotation validation', () => {
  it('detaches valid unknown extensions without deleting them', () => {
    const input = createTestAnnotation({ extensions: { application: { flag: true } } })
    const parsed = parseAnnotation(input)
    input.extensions = { changed: true }
    expect(parsed.extensions).toEqual({ application: { flag: true } })
  })

  it.each([
    { bounds: { x: Number.NaN, y: 0, width: 1, height: 1 } },
    { bounds: { x: 0, y: 0, width: -1, height: 1 } },
    { pageIndex: -1 },
    { schemaVersion: 2 },
    { rendererState: { engine: 'other', schemaVersion: 1, serialized: '{}' } }
  ])('rejects invalid external input with a structured error', (override) => {
    expect(() => parseAnnotation({ ...createTestAnnotation(), ...override })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' })
    )
  })

  it('rejects duplicate IDs before returning a collection', () => {
    const annotation = createTestAnnotation()
    expect(() => parseAnnotations([annotation, annotation])).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_DUPLICATE_ID' })
    )
  })

  it('rejects dangerous extension keys parsed from JSON', () => {
    const extension = JSON.parse('{"constructor":{"polluted":true}}') as unknown
    expect(() => parseAnnotation({ ...createTestAnnotation(), extensions: extension }))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })

  it('rejects non-JSON extension values', () => {
    expect(() => parseAnnotation({ ...createTestAnnotation(), extensions: { created: new Date() } }))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    expect(() => parseAnnotation({ ...createTestAnnotation(), extensions: { value: undefined } }))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })

  it('validates explicit image and bounded ink Signature content', () => {
    expect(parseAnnotation(createTestAnnotation({
      type: 'signature',
      content: { text: '', signature: { kind: 'image', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=' } }
    })).content?.signature).toMatchObject({ kind: 'image' })
    expect(() => parseAnnotation(createTestAnnotation({
      type: 'signature', content: { text: '', signature: { kind: 'ink', strokes: [[1, 2, 3]] } }
    }))).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })

  it.each([
    'custom:acme/measurement',
    'custom:medical.region/approval_stamp',
    'custom:a/b'
  ])('accepts and preserves a valid namespaced custom type: %s', (type) => {
    const parsed = parseAnnotation(createTestAnnotation({
      type: type as `custom:${string}/${string}`,
      typeData: { schemaVersion: 3, payload: { unit: 'mm', values: [1, 2, null] } }
    }))
    expect(parsed.type).toBe(type)
    expect(parsed.typeData).toEqual({
      schemaVersion: 3,
      payload: { unit: 'mm', values: [1, 2, null] }
    })
  })

  it.each([
    'custom:Acme/measurement',
    'custom:acme',
    'custom:/measurement',
    'custom:acme/',
    'custom:acme/measure ment',
    'rectangle-extra'
  ])('rejects an invalid or unqualified custom type: %s', (type) => {
    expect(() => parseAnnotation({ ...createTestAnnotation(), type })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' })
    )
  })

  it('detaches typeData and rejects non-lossless JSON or invalid versions', () => {
    const payload = { nested: [{ value: true }] }
    const parsed = parseAnnotation(createTestAnnotation({
      type: 'custom:test/data', typeData: { schemaVersion: 1, payload }
    }))
    const nested = payload.nested[0]
    if (nested === undefined) throw new Error('Expected nested payload fixture.')
    nested.value = false
    expect(parsed.typeData?.payload).toEqual({ nested: [{ value: true }] })

    for (const typeData of [
      { schemaVersion: 0, payload: null },
      { schemaVersion: 1, payload: Number.NaN },
      { schemaVersion: 1, payload: new Date() },
      { schemaVersion: 1, payload: { value: undefined } }
    ]) {
      expect(() => parseAnnotation({
        ...createTestAnnotation(), type: 'custom:test/data', typeData
      })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    }
  })

  it('rejects cyclic, symbol-keyed, hidden, and accessor JSON payloads', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    const symbolKeyed = { visible: true } as Record<PropertyKey, unknown>
    symbolKeyed[Symbol('hidden')] = true
    const hidden = { visible: true }
    Object.defineProperty(hidden, 'secret', { value: true, enumerable: false })
    const accessor = Object.defineProperty({}, 'value', { get: () => true, enumerable: true })
    for (const payload of [cyclic, symbolKeyed, hidden, accessor]) {
      expect(() => parseAnnotation({
        ...createTestAnnotation(), type: 'custom:test/data',
        typeData: { schemaVersion: 1, payload }
      })).toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    }
  })
})
