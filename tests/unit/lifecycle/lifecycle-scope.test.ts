/**
 * @file Lifecycle scope contract tests.
 * @description Verifies reverse asynchronous cleanup, abort propagation,
 * children, shared idempotent disposal, failure aggregation, and setup rollback.
 */

import { describe, expect, it, vi } from 'vitest'
import type { InkLayerError } from '../../../src/domain/errors'
import {
  createInkLayerLifecycleScope,
  installInkLayerLifecycleSetup
} from '../../../src/lifecycle/lifecycle-scope'

describe('InkLayer lifecycle scope', () => {
  it('aborts before releasing effects in reverse sequential order', async () => {
    const scope = createInkLayerLifecycleScope('root')
    const order: string[] = []
    scope.add(() => {
      expect(scope.signal.aborted).toBe(true)
      order.push('first')
    }, 'first')
    scope.add(async () => {
      expect(scope.signal.aborted).toBe(true)
      order.push('second:start')
      await Promise.resolve()
      order.push('second:end')
    }, 'second')

    await scope.dispose()

    expect(order).toEqual(['second:start', 'second:end', 'first'])
    expect(scope.disposed).toBe(true)
  })

  it('shares one cleanup between manual, concurrent, and owner disposal', async () => {
    const scope = createInkLayerLifecycleScope()
    const cleanup = vi.fn(async () => Promise.resolve())
    const disposeEffect = scope.add(cleanup, 'shared')

    const first = disposeEffect()
    const second = disposeEffect()
    expect(first).toBe(second)
    await Promise.all([first, second, scope.dispose(), scope.dispose()])

    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('owns child scopes, propagates abort, and preserves nested reverse order', async () => {
    const root = createInkLayerLifecycleScope('root')
    const order: string[] = []
    root.add(() => { order.push('parent-before-child') }, 'parent-before-child')
    const child = root.child('feature')
    child.add(() => {
      expect(root.signal.aborted).toBe(true)
      expect(child.signal.aborted).toBe(true)
      order.push('child')
    }, 'child-resource')
    root.add(() => { order.push('parent-after-child') }, 'parent-after-child')

    await root.dispose()

    expect(order).toEqual(['parent-after-child', 'child', 'parent-before-child'])
    expect(child.disposed).toBe(true)
  })

  it('rejects registrations after disposal starts', async () => {
    const scope = createInkLayerLifecycleScope()
    await scope.dispose()

    expect(() => scope.add(() => {})).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'LIFECYCLE_INACTIVE' })
    )
    expect(() => scope.child('late')).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'LIFECYCLE_INACTIVE' })
    )
  })

  it('continues cleanup and reports every labelled disposer failure', async () => {
    const scope = createInkLayerLifecycleScope('root')
    const order: string[] = []
    scope.add(() => {
      order.push('survived')
    }, 'survived')
    scope.add(() => {
      order.push('failed-two')
      throw new Error('second failure')
    }, 'failed-two')
    scope.add(() => {
      order.push('failed-one')
      throw new Error('first failure')
    }, 'failed-one')

    const failure = await captureInkLayerError(scope.dispose())

    expect(order).toEqual(['failed-one', 'failed-two', 'survived'])
    expect(failure).toMatchObject({
      code: 'LIFECYCLE_DISPOSE_FAILED',
      operation: 'disposeInkLayerLifecycleScope'
    })
    expect(failure.cause).toBeInstanceOf(AggregateError)
    expect((failure.cause as AggregateError).errors).toHaveLength(2)
  })

  it('rolls back partial asynchronous setup before reporting its failure', async () => {
    const root = createInkLayerLifecycleScope('root')
    const order: string[] = []

    const failure = await captureInkLayerError(installInkLayerLifecycleSetup(root, 'feature', async (scope) => {
      scope.add(() => { order.push('first') }, 'first')
      scope.add(async () => {
        await Promise.resolve()
        order.push('second')
      }, 'second')
      throw new Error('setup failed')
    }))

    expect(order).toEqual(['second', 'first'])
    expect(failure).toMatchObject({
      code: 'LIFECYCLE_SETUP_FAILED',
      operation: 'installInkLayerLifecycleSetup'
    })
    await root.dispose()
    expect(order).toEqual(['second', 'first'])
  })

  it('owns a disposer returned by successful setup', async () => {
    const root = createInkLayerLifecycleScope('root')
    const cleanup = vi.fn()

    const result = await installInkLayerLifecycleSetup(root, 'feature', () => cleanup)
    expect(result).toBeUndefined()
    expect(cleanup).not.toHaveBeenCalled()

    await root.dispose()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('combines setup and rollback failures without abandoning the root', async () => {
    const root = createInkLayerLifecycleScope('root')

    const failure = await captureInkLayerError(installInkLayerLifecycleSetup(root, 'feature', (scope) => {
      scope.add(() => { throw new Error('rollback failed') }, 'rollback')
      throw new Error('setup failed')
    }))

    expect(failure.code).toBe('LIFECYCLE_SETUP_FAILED')
    expect(failure.cause).toBeInstanceOf(AggregateError)
    expect((failure.cause as AggregateError).errors).toHaveLength(2)
    await root.dispose()
  })
})

/** Captures one expected structured lifecycle rejection. */
async function captureInkLayerError(operation: Promise<unknown>): Promise<InkLayerError> {
  try {
    await operation
  } catch (cause) {
    return cause as InkLayerError
  }
  throw new Error('Expected lifecycle operation to reject.')
}
