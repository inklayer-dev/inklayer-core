/**
 * @file In-memory annotation repository contract tests.
 * @description Covers page indexes, detached reads, functional updates,
 * duplicate replacement, selection reconciliation, subscriptions, and destroy.
 */

import { describe, expect, it, vi } from 'vitest'
import type { InkLayerError } from '../../../src/domain/errors'
import { createMemoryAnnotationRepository } from '../../../src/repository/memory-annotation-repository'
import { createTestAnnotation } from '../../helpers/annotation'

describe('memory annotation repository', () => {
  it('indexes pages and never exposes mutable stored objects', () => {
    const repository = createMemoryAnnotationRepository()
    repository.add(createTestAnnotation({ extensions: { nested: { value: 1 } } }))
    const read = repository.getById('annotation-1')
    if (read === undefined) throw new Error('Expected annotation')
    read.bounds.x = 999
    read.extensions = { changed: true }
    expect(repository.getByPage(0)[0]?.bounds.x).toBe(10)
    expect(repository.getById('annotation-1')?.extensions).toEqual({ nested: { value: 1 } })
  })

  it('updates page indexes and rejects ID changes', () => {
    const repository = createMemoryAnnotationRepository()
    repository.add(createTestAnnotation())
    repository.update('annotation-1', (annotation) => ({ ...annotation, pageIndex: 3 }))
    expect(repository.getByPage(0)).toEqual([])
    expect(repository.getByPage(3)).toHaveLength(1)
    expect(() => repository.update('annotation-1', (annotation) => ({ ...annotation, id: 'changed' })))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })

  it('round-trips unknown custom types and typeData without a Definition', () => {
    const repository = createMemoryAnnotationRepository()
    const listener = vi.fn()
    repository.subscribe(listener)
    const annotation = createTestAnnotation({
      type: 'custom:workflow/approval',
      typeData: { schemaVersion: 7, payload: { state: 'pending', actors: ['a', 'b'] } },
      extensions: { application: { retained: true } },
      rendererState: { engine: 'konva', schemaVersion: 1, serialized: 'opaque-custom-state' }
    })
    repository.replaceAll([annotation])
    annotation.typeData = { schemaVersion: 1, payload: null }
    const stored = repository.getById('annotation-1')
    expect(stored).toMatchObject({
      type: 'custom:workflow/approval',
      typeData: { schemaVersion: 7, payload: { state: 'pending', actors: ['a', 'b'] } },
      rendererState: { serialized: 'opaque-custom-state' }
    })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'replace', annotations: [expect.objectContaining({ type: 'custom:workflow/approval' })]
    }))
    repository.destroy()
  })

  it('atomically rejects duplicates without losing current state', () => {
    const repository = createMemoryAnnotationRepository()
    repository.add(createTestAnnotation())
    const duplicate = createTestAnnotation({ pageIndex: 4 })
    expect(() => repository.replaceAll([duplicate, duplicate])).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_DUPLICATE_ID' })
    )
    expect(repository.getAll()).toHaveLength(1)
    expect(repository.getByPage(0)).toHaveLength(1)
  })

  it('keeps selection consistent across remove and replace', () => {
    const repository = createMemoryAnnotationRepository()
    repository.replaceAll([
      createTestAnnotation({ id: 'a' }),
      createTestAnnotation({ id: 'b' })
    ])
    repository.setSelection({ ids: ['a', 'b'], primaryId: 'b' })
    repository.remove('b')
    expect(repository.getSelection()).toEqual({ ids: ['a'] })
    repository.replaceAll([])
    expect(repository.getSelection()).toEqual({ ids: [] })
  })

  it('subscribes, unsubscribes, and destroys idempotently', () => {
    const repository = createMemoryAnnotationRepository()
    const listener = vi.fn()
    const unsubscribe = repository.subscribe(listener)
    repository.add(createTestAnnotation())
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'add' }))
    unsubscribe()
    unsubscribe()
    repository.remove('annotation-1')
    expect(listener).toHaveBeenCalledTimes(1)
    repository.destroy()
    repository.destroy()
    expect(() => repository.getAll()).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ENGINE_DESTROYED' })
    )
  })

  it('rejects invalid selection IDs and duplicate adds', () => {
    const repository = createMemoryAnnotationRepository()
    repository.add(createTestAnnotation())
    expect(() => repository.add(createTestAnnotation())).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_DUPLICATE_ID' })
    )
    expect(() => repository.setSelection({ ids: ['missing'] })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' })
    )
  })
})
