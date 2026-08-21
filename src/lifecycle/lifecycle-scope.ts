/**
 * @file Instance-owned lifecycle scope.
 * @description Owns reversible synchronous and asynchronous effects, child
 * scopes, abort propagation, setup rollback, and deterministic teardown.
 */

import { InkLayerError } from '../domain/errors'

/** Synchronous or asynchronous cleanup owned by one lifecycle scope. */
export type InkLayerDisposer = () => void | Promise<void>

/** Setup callback installed transactionally inside a dedicated child scope. */
export type InkLayerLifecycleSetup<T> = (
  scope: InkLayerLifecycleScope
) => T | InkLayerDisposer | Promise<T | InkLayerDisposer>

/** Instance-scoped owner for abortable reversible resources. */
export interface InkLayerLifecycleScope {
  /** Diagnostic label that does not contain document or credential data. */
  readonly label: string
  /** Signal aborted before this scope begins resource teardown. */
  readonly signal: AbortSignal
  /** Whether disposal has started. */
  readonly disposed: boolean
  /** Registers one cleanup and returns its shared idempotent disposer. */
  add(disposer: InkLayerDisposer, label?: string): InkLayerDisposer
  /** Creates a nested scope owned as one effect of this scope. */
  child(label: string): InkLayerLifecycleScope
  /** Aborts and releases every owned effect in reverse registration order. */
  dispose(): Promise<void>
}

interface LifecycleEffect {
  label: string
  disposer: InkLayerDisposer | undefined
  task: Promise<void> | undefined
}

/** Creates an active root lifecycle scope. */
export function createInkLayerLifecycleScope(label = 'inklayer'): InkLayerLifecycleScope {
  return new InkLayerLifecycleScopeImpl(normalizeLabel(label), undefined)
}

/**
 * Installs setup transactionally inside an owned child scope.
 * @returns The setup value, excluding a returned disposer which is registered
 * on the child scope instead.
 */
export async function installInkLayerLifecycleSetup<T = void>(
  owner: InkLayerLifecycleScope,
  label: string,
  setup: InkLayerLifecycleSetup<T>
): Promise<Exclude<T, InkLayerDisposer> | undefined> {
  const normalizedLabel = normalizeLabel(label)
  const scope = owner.child(normalizedLabel)
  try {
    const result = await setup(scope)
    if (typeof result === 'function') {
      scope.add(result as InkLayerDisposer, `${normalizedLabel}:setup-result`)
      return undefined
    }
    return result as Exclude<T, InkLayerDisposer> | undefined
  } catch (cause) {
    try {
      await scope.dispose()
    } catch (cleanupCause) {
      throw new InkLayerError(
        'LIFECYCLE_SETUP_FAILED',
        `Lifecycle setup "${normalizedLabel}" failed and rollback reported cleanup errors.`,
        {
          operation: 'installInkLayerLifecycleSetup',
          cause: new AggregateError([cause, cleanupCause], 'Lifecycle setup and rollback failed.')
        }
      )
    }
    if (cause instanceof InkLayerError && cause.code === 'LIFECYCLE_INACTIVE') throw cause
    throw new InkLayerError(
      'LIFECYCLE_SETUP_FAILED',
      `Lifecycle setup "${normalizedLabel}" failed.`,
      { operation: 'installInkLayerLifecycleSetup', cause }
    )
  }
}

/** Concrete deterministic lifecycle scope. */
class InkLayerLifecycleScopeImpl implements InkLayerLifecycleScope {
  private readonly controller = new AbortController()
  private readonly effects: LifecycleEffect[] = []
  private disposeTask: Promise<void> | undefined
  private ownerDisposer: InkLayerDisposer | undefined
  private disposing = false

  /** Creates one scope and links its abort signal to an optional parent. */
  public constructor(
    public readonly label: string,
    parentSignal: AbortSignal | undefined
  ) {
    if (parentSignal === undefined) return
    const abortFromParent = (): void => {
      this.abort(parentSignal.reason)
    }
    if (parentSignal.aborted) {
      abortFromParent()
      return
    }
    parentSignal.addEventListener('abort', abortFromParent, { once: true })
    this.add(
      () => parentSignal.removeEventListener('abort', abortFromParent),
      `${label}:parent-abort-listener`
    )
  }

  /** Returns the signal aborted before resource cleanup. */
  public get signal(): AbortSignal {
    return this.controller.signal
  }

  /** Returns whether this scope has entered disposal. */
  public get disposed(): boolean {
    return this.disposing
  }

  /** Registers one reversible effect while the scope remains active. */
  public add(disposer: InkLayerDisposer, label = 'anonymous'): InkLayerDisposer {
    if (typeof disposer !== 'function') {
      throw new TypeError('Lifecycle disposer must be a function.')
    }
    this.assertActive('add')
    const effect: LifecycleEffect = {
      label: normalizeLabel(label),
      disposer,
      task: undefined
    }
    const dispose = (): Promise<void> => {
      const index = this.effects.indexOf(effect)
      if (index >= 0) this.effects.splice(index, 1)
      effect.task ??= invokeLifecycleEffect(effect)
      return effect.task
    }
    this.effects.push(effect)
    return dispose
  }

  /** Creates and registers one child scope. */
  public child(label: string): InkLayerLifecycleScope {
    this.assertActive('child')
    const child = new InkLayerLifecycleScopeImpl(
      `${this.label}/${normalizeLabel(label)}`,
      this.signal
    )
    child.ownerDisposer = this.add(
      () => child.disposeDirect(),
      `${child.label}:scope`
    )
    return child
  }

  /** Starts or joins deterministic reverse-order teardown. */
  public dispose(): Promise<void> {
    const ownerDisposer = this.ownerDisposer
    this.ownerDisposer = undefined
    if (ownerDisposer !== undefined) return Promise.resolve(ownerDisposer())
    return this.disposeDirect()
  }

  /** Starts or joins teardown without re-entering an owning parent effect. */
  private disposeDirect(): Promise<void> {
    this.ownerDisposer = undefined
    this.disposeTask ??= this.disposeOwnedEffects()
    return this.disposeTask
  }

  /** Aborts and sequentially releases every current effect. */
  private async disposeOwnedEffects(): Promise<void> {
    this.disposing = true
    this.abort(new InkLayerError(
      'LIFECYCLE_INACTIVE',
      `Lifecycle scope "${this.label}" is disposing.`,
      { operation: 'disposeInkLayerLifecycleScope' }
    ))
    const failures: Error[] = []
    for (const effect of this.effects.splice(0).reverse()) {
      try {
        effect.task ??= invokeLifecycleEffect(effect)
        await effect.task
      } catch (cause) {
        failures.push(new Error(`Lifecycle disposer "${effect.label}" failed.`, { cause }))
      }
    }
    if (failures.length > 0) {
      throw new InkLayerError(
        'LIFECYCLE_DISPOSE_FAILED',
        `Lifecycle scope "${this.label}" reported ${failures.length} cleanup failure${failures.length === 1 ? '' : 's'}.`,
        {
          operation: 'disposeInkLayerLifecycleScope',
          cause: new AggregateError(failures, 'Lifecycle cleanup failed.')
        }
      )
    }
  }

  /** Aborts this scope once without replacing the first reason. */
  private abort(reason: unknown): void {
    if (!this.signal.aborted) this.controller.abort(reason)
  }

  /** Rejects operations after disposal starts. */
  private assertActive(operation: string): void {
    if (!this.disposing && !this.signal.aborted) return
    throw new InkLayerError(
      'LIFECYCLE_INACTIVE',
      `Lifecycle scope "${this.label}" is inactive.`,
      { operation: `InkLayerLifecycleScope.${operation}` }
    )
  }
}

/** Runs one effect exactly once and releases its captured disposer reference. */
async function invokeLifecycleEffect(effect: LifecycleEffect): Promise<void> {
  const disposer = effect.disposer
  effect.disposer = undefined
  if (disposer !== undefined) await disposer()
}

/** Validates and normalizes a diagnostic-only lifecycle label. */
function normalizeLabel(label: string): string {
  const normalized = label.trim()
  if (normalized.length === 0) throw new TypeError('Lifecycle label cannot be empty.')
  if (normalized.length > 256) throw new TypeError('Lifecycle label cannot exceed 256 characters.')
  return normalized
}
