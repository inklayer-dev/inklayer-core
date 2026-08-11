/**
 * @file Annotation reference and numbering tests.
 * @description Covers label integrity, duplicate numbering, stable ordering,
 * invalid dates, renumbering, deletion, and safe-integer limits.
 */

import { describe, expect, it } from 'vitest'
import {
  assignAnnotationReferenceNumber,
  normalizeAnnotationReferenceNumbers
} from '../../../src/domain/numbering'
import {
  normalizeAnnotationReferences,
  synchronizeAnnotationReferenceLabels
} from '../../../src/domain/references'
import { createTestAnnotation } from '../../helpers/annotation'

describe('annotation numbering', () => {
  it('preserves unique numbers and deterministically resolves duplicates', () => {
    const annotations = [
      createTestAnnotation({ id: 'late', createdAt: 'invalid', pageIndex: 2, referenceNumber: 4 }),
      createTestAnnotation({ id: 'early', createdAt: '2025-01-01T00:00:00Z', referenceNumber: 4 }),
      createTestAnnotation({ id: 'middle', createdAt: 'D:20250102000000Z' })
    ]
    const normalized = normalizeAnnotationReferenceNumbers(annotations)
    expect(normalized.map((annotation) => annotation.referenceNumber)).toEqual([6, 4, 5])
  })

  it('guards the maximum safe integer', () => {
    const existing = createTestAnnotation({ referenceNumber: Number.MAX_SAFE_INTEGER })
    expect(() => assignAnnotationReferenceNumber(createTestAnnotation({ id: 'new' }), [existing]))
      .toThrow(RangeError)
  })
})

describe('annotation references', () => {
  it('drops missing, duplicate, unsafe, and ambiguous targets', () => {
    const references = normalizeAnnotationReferences('See #2 and #3', [
      { type: 'annotation', annotationId: 'a', label: '#2' },
      { type: 'annotation', annotationId: 'a', label: '#2' },
      { type: 'annotation', annotationId: 'b', label: '#2' },
      { type: 'annotation', annotationId: 'c', label: '#3' },
      { type: 'annotation', annotationId: 'd', label: '#9007199254740992' }
    ])
    expect(references).toEqual([{ type: 'annotation', annotationId: 'c', label: '#3' }])
  })

  it('synchronizes renumbered labels without cascading replacements', () => {
    const result = synchronizeAnnotationReferenceLabels('Swap #2 and #3', [
      { type: 'annotation', annotationId: 'a', label: '#2' },
      { type: 'annotation', annotationId: 'b', label: '#3' }
    ], [
      createTestAnnotation({ id: 'a', referenceNumber: 3 }),
      createTestAnnotation({ id: 'b', referenceNumber: 2 })
    ])
    expect(result.content).toBe('Swap #3 and #2')
    expect(result.references).toEqual([
      { type: 'annotation', annotationId: 'a', label: '#3' },
      { type: 'annotation', annotationId: 'b', label: '#2' }
    ])
  })

  it('keeps a deleted target stable when no replacement number exists', () => {
    const result = synchronizeAnnotationReferenceLabels('See #7', [
      { type: 'annotation', annotationId: 'deleted', label: '#7' }
    ], [])
    expect(result).toEqual({
      content: 'See #7',
      references: [{ type: 'annotation', annotationId: 'deleted', label: '#7' }]
    })
  })
})
