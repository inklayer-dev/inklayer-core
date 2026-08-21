/**
 * @file Instance Capability registry.
 * @description Installs ordered pre-engine providers, protects single-provider
 * services, and activates post-engine effects in a later lifecycle scope.
 */

import { InkLayerError } from '../domain/errors'
import type { InkLayerLifecycleScope } from '../lifecycle/lifecycle-scope'
import type { AnnotationTypeRegistry } from '../annotation-types/contracts'
import type {
  InkLayerCapability,
  InkLayerCapabilityContext,
  InkLayerCapabilityRegistry,
  InkLayerReadyContext,
  InkLayerReadyEffect
} from './contracts'
import type {
  InkLayerCapabilityServiceKey,
  InkLayerCapabilityServiceMap
} from './ports'

interface CapabilityRecord {
  id: string
  readyEffects: InkLayerReadyEffect[]
}

interface ServiceRecord {
  capabilityId: string
  value: unknown
}

/** Mutable registry used only by the Composition Root during setup. */
export class InkLayerCapabilityRegistryImpl implements InkLayerCapabilityRegistry {
  private readonly records: CapabilityRecord[] = []
  private readonly services = new Map<string, ServiceRecord>()
  private activated = false

  /** Creates one registry over the provider lifecycle branch. */
  public constructor(
    private readonly root: HTMLElement,
    private readonly providerScope: InkLayerLifecycleScope,
    private readonly annotationTypes: AnnotationTypeRegistry
  ) {}

  /** Installs every configured Capability sequentially and transactionally. */
  public async install(capabilities: readonly InkLayerCapability[]): Promise<void> {
    const ids = new Set<string>()
    for (const capability of capabilities) {
      const id = normalizeIdentifier(capability.id, 'Capability ID')
      if (ids.has(id)) {
        throw new InkLayerError('CAPABILITY_DUPLICATE', `Capability "${id}" is duplicated.`, {
          operation: 'installInkLayerCapabilities'
        })
      }
      ids.add(id)
    }
    for (const capability of capabilities) await this.installOne(capability)
  }

  /** Activates every ready effect in Capability and registration order. */
  public async activateReady(
    ready: InkLayerReadyContext,
    readyScope: InkLayerLifecycleScope
  ): Promise<void> {
    if (this.activated) {
      throw new InkLayerError('CAPABILITY_SETUP_FAILED', 'Capability ready effects were already activated.', {
        operation: 'activateInkLayerCapabilities'
      })
    }
    this.activated = true
    for (const record of this.records) {
      const scope = readyScope.child(`capability:${record.id}`)
      for (const [index, effect] of record.readyEffects.splice(0).entries()) {
        try {
          const disposer = await effect(ready)
          if (typeof disposer === 'function') scope.add(disposer, `ready:${index + 1}`)
        } catch (cause) {
          throw new InkLayerError(
            'CAPABILITY_SETUP_FAILED',
            `Capability "${record.id}" failed during ready activation.`,
            { operation: 'activateInkLayerCapabilities', cause }
          )
        }
      }
    }
  }

  /** Returns installed Capability IDs in deterministic order. */
  public list(): readonly string[] {
    return this.records.map((record) => record.id)
  }

  /** Returns whether a Capability ID is installed. */
  public has(id: string): boolean {
    const normalizedId = normalizeIdentifier(id, 'Capability ID')
    return this.records.some((record) => record.id === normalizedId)
  }

  /** Reads one currently provided service. */
  public get<K extends InkLayerCapabilityServiceKey>(
    key: K
  ): InkLayerCapabilityServiceMap[K] | undefined
  /** Reads one custom service whose value type is selected by the caller. */
  public get<T>(key: string): T | undefined
  /** Resolves the normalized key from this instance's single-provider map. */
  public get<T>(key: string): T | undefined {
    const normalizedKey = normalizeIdentifier(key, 'Capability service key')
    return this.services.get(normalizedKey)?.value as T | undefined
  }

  /** Installs one Capability inside its own provider child scope. */
  private async installOne(capability: InkLayerCapability): Promise<void> {
    const id = normalizeIdentifier(capability.id, 'Capability ID')
    const scope = this.providerScope.child(`capability:${id}`)
    const record: CapabilityRecord = { id, readyEffects: [] }
    let acceptingSetup = true
    const context: InkLayerCapabilityContext = {
      root: this.root,
      lifecycle: scope,
      annotationTypes: this.annotationTypes,
      provide: <T>(key: string, value: T) => {
        if (!acceptingSetup) throw capabilitySetupClosed(id)
        const normalizedKey = normalizeIdentifier(key, 'Capability service key')
        const existing = this.services.get(normalizedKey)
        if (existing !== undefined) {
          throw new InkLayerError(
            'CAPABILITY_SERVICE_CONFLICT',
            `Service "${normalizedKey}" is already provided by Capability "${existing.capabilityId}".`,
            { operation: 'provideInkLayerCapabilityService' }
          )
        }
        this.services.set(normalizedKey, { capabilityId: id, value })
        return scope.add(() => { this.services.delete(normalizedKey) }, `service:${normalizedKey}`)
      },
      get: <T>(key: string) => this.get<T>(key),
      onReady: (effect: InkLayerReadyEffect) => {
        if (!acceptingSetup) throw capabilitySetupClosed(id)
        if (typeof effect !== 'function') throw new TypeError('Capability ready effect must be a function.')
        record.readyEffects.push(effect)
      }
    }
    try {
      const disposer = await capability.setup(context)
      if (typeof disposer === 'function') scope.add(disposer, 'setup-result')
      acceptingSetup = false
      this.records.push(record)
    } catch (cause) {
      acceptingSetup = false
      try {
        await scope.dispose()
      } catch (cleanupCause) {
        throw new InkLayerError(
          'CAPABILITY_SETUP_FAILED',
          `Capability "${id}" setup failed and rollback reported cleanup errors.`,
          {
            operation: 'installInkLayerCapability',
            cause: new AggregateError([cause, cleanupCause], 'Capability setup and rollback failed.')
          }
        )
      }
      if (cause instanceof InkLayerError) throw cause
      throw new InkLayerError('CAPABILITY_SETUP_FAILED', `Capability "${id}" setup failed.`, {
        operation: 'installInkLayerCapability', cause
      })
    }
  }
}

/** Creates the stable error for setup-only context use after setup settles. */
function capabilitySetupClosed(id: string): InkLayerError {
  return new InkLayerError('CAPABILITY_SETUP_FAILED', `Capability "${id}" setup context is closed.`, {
    operation: 'useInkLayerCapabilityContext'
  })
}

/** Validates one bounded diagnostic identifier or service key. */
function normalizeIdentifier(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > 256) {
    throw new TypeError(`${name} must contain between 1 and 256 characters.`)
  }
  return normalized
}
