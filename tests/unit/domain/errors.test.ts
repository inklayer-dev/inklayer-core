/**
 * @file Structured error contract tests.
 * @description Verifies machine-readable context and native Error cause support.
 * @remarks These tests do not cover feature-specific error translation.
 */

import { describe, expect, it } from 'vitest'
import { InkLayerError } from '../../../src/domain/errors'

describe('InkLayerError', () => {
  it('preserves stable context without expanding the cause into the message', () => {
    const cause = new Error('network detail')
    const error = new InkLayerError('PDF_LOAD_FAILED', 'Unable to load PDF.', {
      operation: 'viewer.load',
      annotationId: 'annotation-1',
      pageIndex: 2,
      cause
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('InkLayerError')
    expect(error.code).toBe('PDF_LOAD_FAILED')
    expect(error.operation).toBe('viewer.load')
    expect(error.annotationId).toBe('annotation-1')
    expect(error.pageIndex).toBe(2)
    expect(error.cause).toBe(cause)
    expect(error.message).toBe('Unable to load PDF.')
  })

  it('supports an error without optional context', () => {
    const error = new InkLayerError('ENGINE_DESTROYED', 'Engine is destroyed.')

    expect(error.code).toBe('ENGINE_DESTROYED')
    expect(error.operation).toBeUndefined()
    expect(error.cause).toBeUndefined()
  })
})
