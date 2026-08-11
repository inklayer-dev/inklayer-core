/**
 * @file Canonical permission contract tests.
 * @description Covers anonymous, owner, non-owner, native, override, and
 * fail-closed resolver behavior for every supported action.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  canPerformAnnotationAction,
  type AnnotationPermissionAction
} from '../../../src/domain/permissions'
import { createTestAnnotation } from '../../helpers/annotation'

const resourceActions: AnnotationPermissionAction[] = [
  'annotation.transform', 'annotation.edit', 'annotation.delete', 'annotation.change-status'
]

describe('annotation permissions', () => {
  it('allows every action in unrestricted mode', () => {
    const annotation = createTestAnnotation({ native: true })
    const actions: AnnotationPermissionAction[] = [
      'annotation.create', 'annotation.comment', ...resourceActions, 'comment.edit', 'comment.delete'
    ]
    for (const action of actions) {
      expect(canPerformAnnotationAction({ action, currentUser: null, annotation })).toBe(true)
    }
  })

  it('requires authentication and ownership in owner-only mode', () => {
    const annotation = createTestAnnotation()
    expect(canPerformAnnotationAction({
      action: 'annotation.create', currentUser: null, permissions: { mode: 'owner-only' }
    })).toBe(false)
    expect(canPerformAnnotationAction({
      action: 'annotation.comment', currentUser: { id: 'bob', name: 'Bob' },
      permissions: { mode: 'owner-only' }
    })).toBe(true)
    for (const action of resourceActions) {
      expect(canPerformAnnotationAction({
        action, currentUser: { id: 'alice', name: 'Alice' }, annotation,
        permissions: { mode: 'owner-only' }
      })).toBe(true)
      expect(canPerformAnnotationAction({
        action, currentUser: { id: 'bob', name: 'Bob' }, annotation,
        permissions: { mode: 'owner-only' }
      })).toBe(false)
    }
  })

  it('uses comment authors for comment-level ownership', () => {
    const comment = {
      id: 'comment-1', title: 'Bob', content: 'Review', date: null,
      author: { id: 'bob', name: 'Bob' }
    }
    expect(canPerformAnnotationAction({
      action: 'comment.edit', currentUser: { id: 'bob', name: 'Bob' }, comment,
      permissions: { mode: 'owner-only' }
    })).toBe(true)
    expect(canPerformAnnotationAction({
      action: 'comment.delete', currentUser: { id: 'alice', name: 'Alice' }, comment,
      permissions: { mode: 'owner-only' }
    })).toBe(false)
  })

  it('passes the canonical annotation to overrides and fails closed on throw', () => {
    const annotation = createTestAnnotation()
    const onResolverError = vi.fn()
    const override = vi.fn(() => false)
    expect(canPerformAnnotationAction({
      action: 'annotation.edit', currentUser: { id: 'alice', name: 'Alice' }, annotation,
      permissions: { mode: 'owner-only', can: override }
    })).toBe(false)
    expect(override).toHaveBeenCalledWith(expect.objectContaining({ annotation, defaultAllowed: true }))
    expect(canPerformAnnotationAction({
      action: 'annotation.edit', currentUser: { id: 'alice', name: 'Alice' }, annotation,
      permissions: { can: () => { throw new Error('resolver failed') }, onResolverError }
    })).toBe(false)
    expect(onResolverError).toHaveBeenCalledOnce()
  })
})
