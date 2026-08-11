/**
 * @file Root entry import-safety contract.
 * @description Proves that importing implemented root exports does not require a
 * browser global during Node-based build and test execution.
 * @remarks Packed-tarball import receives an additional package test in Phase 7.
 */

import { describe, expect, it } from 'vitest'

describe('root entry', () => {
  it('imports without browser globals', async () => {
    const root = await import('../../src/index')

    expect(root.CORE_VERSION).toBe('0.1.0')
    expect(root.ANNOTATION_SCHEMA_VERSION).toBe(1)
    expect(root.InkLayerError).toBeTypeOf('function')
    expect(root.parseAnnotation).toBeTypeOf('function')
    expect(root.createMemoryAnnotationRepository).toBeTypeOf('function')
    expect(root.parseLegacyAnnotation).toBeTypeOf('function')
    expect(root.createPdfViewerEngine).toBeTypeOf('function')
    expect(root.createAnnotationEngine).toBeTypeOf('function')
    expect(root.parseAndValidateKonvaSnapshot).toBeTypeOf('function')
  })
})
