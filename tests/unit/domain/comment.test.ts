/**
 * @file Immutable canonical comment mutation tests.
 * @description Verifies detached creation and updates that leave unrelated
 * annotation renderer data untouched.
 */

import { describe, expect, it } from 'vitest'
import {
  createAnnotationComment,
  removeAnnotationComment,
  updateAnnotationComment
} from '../../../src/domain/comment'
import { createTestAnnotation } from '../../helpers/annotation'

describe('annotation comment mutations', () => {
  it('creates detached comments and references', () => {
    const references = [{ type: 'annotation' as const, annotationId: 'a', label: '#1' }]
    const comment = createAnnotationComment({
      id: 'c1', title: 'Alice', content: 'See #1', date: null, references
    })
    references[0] = { type: 'annotation', annotationId: 'changed', label: '#2' }
    expect(comment.references).toEqual([{ type: 'annotation', annotationId: 'a', label: '#1' }])
  })

  it('updates and removes comments without changing renderer state', () => {
    const annotation = createTestAnnotation({
      comments: [{ id: 'c1', title: 'Alice', content: 'Draft', date: null }]
    })
    const rendererState = structuredClone(annotation.rendererState)
    const comments = updateAnnotationComment(annotation.comments, 'c1', (comment) => ({
      ...comment,
      content: 'Reviewed',
      status: 'Completed'
    }))
    const updated = { ...annotation, comments }
    expect(updated.rendererState).toEqual(rendererState)
    expect(removeAnnotationComment(updated.comments, 'c1')).toEqual([])
  })
})
