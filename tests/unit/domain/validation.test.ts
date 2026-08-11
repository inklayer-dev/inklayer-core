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
    expect(() => parseAnnotation(createTestAnnotation({ extensions: extension as Record<string, unknown> })))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })

  it('rejects non-JSON extension values', () => {
    expect(() => parseAnnotation(createTestAnnotation({ extensions: { created: new Date() } })))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
    expect(() => parseAnnotation(createTestAnnotation({ extensions: { value: undefined } })))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })
})
