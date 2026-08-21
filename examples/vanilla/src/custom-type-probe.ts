/**
 * @file Browser probe for unavailable and restored custom annotation rendering.
 * @description Supplies Playwright a source-backed real DOM/Konva acceptance
 * surface without adding controls or state to the interactive Vanilla demo.
 */

import { createAnnotationEngine } from 'inklayer-core/annotation'
import { createAnnotationTypeRegistry } from 'inklayer-core/annotation-types'
import { createMemoryAnnotationRepository } from 'inklayer-core'
import type { AnnotationTypeDefinition } from 'inklayer-core/annotation-types'

/** Observable pixel and accessibility evidence returned to browser tests. */
export interface CustomTypeProbeResult {
  /** Placeholder pixel sampled before Definition registration. */
  before: readonly number[]
  /** Controlled red scene pixel sampled after registration. */
  after: readonly number[]
  /** Canvas accessibility label retained across both render paths. */
  accessible: string | null
}

/** Runs a complete unknown-placeholder-to-controlled-scene browser cycle. */
export async function runCustomTypeBrowserProbe(): Promise<CustomTypeProbeResult> {
  const root = document.createElement('section')
  const pageContainer = document.createElement('div')
  root.append(pageContainer)
  document.body.append(root)
  const repository = createMemoryAnnotationRepository()
  const annotationTypes = createAnnotationTypeRegistry()
  try {
    repository.add({
      id: 'custom-browser', schemaVersion: 1, type: 'custom:test/browser', pageIndex: 0,
      bounds: { x: 10, y: 20, width: 100, height: 60 }, coordinateSpace: 'konva-stage',
      comments: [], author: { id: 'alice', name: 'Alice' }, createdAt: null, native: false,
      appearance: { opacity: 1, stroke: null, fill: { color: '#ff0000', opacity: 1 }, text: null },
      typeData: { schemaVersion: 1, payload: { retained: true } },
      rendererState: { engine: 'konva', schemaVersion: 1, serialized: 'DO_NOT_PARSE_UNKNOWN_STATE' }
    })
    const engine = createAnnotationEngine({ root, repository, annotationTypes, snapshotStrategy: 'strict' })
    try {
      await engine.attachPage({ pageIndex: 0, container: pageContainer, width: 200, height: 120 })
      const canvas = pageContainer.querySelector<HTMLCanvasElement>('.konvajs-content canvas')
      const context = canvas?.getContext('2d')
      if (canvas === null || canvas === undefined || context === null || context === undefined) {
        throw new Error('Custom annotation test Canvas is unavailable.')
      }
      await nextAnimationFrame()
      const ratio = canvas.width / 200
      const sample = Math.round(40 * ratio)
      const before = [...context.getImageData(sample, sample, 1, 1).data]
      const unregister = annotationTypes.register({
        type: 'custom:test/browser', apiVersion: 1, geometry: 'box',
        data: {
          supportedSchemaVersions: [1],
          /** Accepts the retained browser probe payload. */
          validate() {}
        },
        capabilities: {
          creation: 'drag-box', creationMode: 'one-shot',
          transform: { move: true, resize: true, rotate: false, endpoints: false, vertices: false },
          appearance: { opacity: true, stroke: false, fill: true, text: false },
          comments: true, printable: false, exportable: false
        },
        appearance: { defaults: {
          opacity: 1, stroke: null, fill: { color: '#ff0000', opacity: 1 }, text: null
        } },
        creation: { controller: 'drag-box' },
        renderer: {
          /** Projects the retained custom annotation as a controlled red box. */
          render(annotation) {
            return { children: [{
              kind: 'rectangle', bounds: { ...annotation.bounds },
              fill: { color: '#ff0000', opacity: 1 }
            }] }
          }
        }
      })
      await nextAnimationFrame()
      const after = [...context.getImageData(sample, sample, 1, 1).data]
      const accessible = pageContainer.querySelector('.inklayer-annotation-a11y-list button')
        ?.getAttribute('aria-label') ?? null
      unregister()
      return { before, after, accessible }
    } finally {
      engine.destroy()
    }
  } finally {
    repository.destroy()
    annotationTypes.destroy()
    root.remove()
  }
}

/** Waits until Konva's queued `batchDraw()` frame has painted. */
async function nextAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

/** Full custom pointer/transform/print probe state retained between Playwright calls. */
interface CustomProofSession {
  root: HTMLElement
  pageContainer: HTMLDivElement
  repository: ReturnType<typeof createMemoryAnnotationRepository>
  annotationTypes: ReturnType<typeof createAnnotationTypeRegistry>
  engine: ReturnType<typeof createAnnotationEngine>
  unregister: () => void
  rendererReceivedKonva: boolean
  errors: string[]
}

let proofSession: CustomProofSession | null = null

/** Observable external-type state read without touching private renderer objects. */
export interface CustomTypeEndToEndState {
  /** Number of canonical annotations created by pointer input. */
  count: number
  /** Current repository selection after one-shot creation. */
  selectedIds: readonly string[]
  /** Current canonical page bounds after direct manipulation. */
  bounds: { x: number; y: number; width: number; height: number } | null
  /** Independently versioned Definition-owned semantic data. */
  typeData: unknown
  /** Active Engine tool after the Definition creation lifecycle applies. */
  tool: string
  /** Computed controller-derived browser cursor. */
  cursor: string
  /** Whether an extension callback ever observed a Konva-like object. */
  rendererReceivedKonva: boolean
  /** Center alpha sampled from the print-safe raster renderer. */
  rasterAlpha: number
  /** Structured Engine errors observed during the proof. */
  errors: readonly string[]
}

/** Mounts one real custom drag-box Definition for browser pointer interaction. */
export async function mountCustomTypeEndToEndProbe(): Promise<void> {
  cleanupCustomTypeEndToEndProbe()
  const root = document.createElement('section')
  root.id = 'custom-type-e2e-probe'
  root.style.cssText = [
    'position: fixed', 'inset: 8px auto auto 8px', 'z-index: 1000',
    'width: 240px', 'height: 160px', 'background: white'
  ].join(';')
  const pageContainer = document.createElement('div')
  root.append(pageContainer)
  document.body.append(root)
  const repository = createMemoryAnnotationRepository()
  const annotationTypes = createAnnotationTypeRegistry()
  const session: CustomProofSession = {
    root,
    pageContainer,
    repository,
    annotationTypes,
    engine: null as unknown as ReturnType<typeof createAnnotationEngine>,
    unregister: () => {},
    rendererReceivedKonva: false,
    errors: []
  }
  session.unregister = annotationTypes.register(measurementDefinition(session))
  session.engine = createAnnotationEngine({ root, repository, annotationTypes })
  session.engine.subscribe((event) => {
    if (event.type === 'error') session.errors.push(`${event.error.code}: ${event.error.message}`)
  })
  proofSession = session
  await session.engine.attachPage({
    pageIndex: 0, container: pageContainer, width: 240, height: 160
  })
  session.engine.setTool('custom:proof/measurement')
  await nextAnimationFrame()
}

/** Reads creation, selection, transform, cursor, renderer, and raster evidence. */
export function readCustomTypeEndToEndState(): CustomTypeEndToEndState {
  const session = requireProofSession()
  const annotation = session.repository.getAll()[0]
  const canvas = session.engine.renderPageRaster(0, 1)
  const context = canvas.getContext('2d')
  const sampleX = annotation === undefined ? 0 : Math.round(annotation.bounds.x + annotation.bounds.width / 2)
  const sampleY = annotation === undefined ? 0 : Math.round(annotation.bounds.y + annotation.bounds.height / 2)
  const rasterAlpha = context?.getImageData(sampleX, sampleY, 1, 1).data[3] ?? 0
  return {
    count: session.repository.getAll().length,
    selectedIds: [...session.repository.getSelection().ids],
    bounds: annotation === undefined ? null : { ...annotation.bounds },
    typeData: annotation?.typeData === undefined ? null : structuredClone(annotation.typeData),
    tool: session.engine.getTool(),
    cursor: getComputedStyle(
      session.pageContainer.querySelector<HTMLElement>('.konvajs-content') ?? session.pageContainer
    ).cursor,
    rendererReceivedKonva: session.rendererReceivedKonva,
    rasterAlpha,
    errors: [...session.errors]
  }
}

/** Exercises Definition-owned Appearance editing and returns a center pixel. */
export async function updateCustomTypeEndToEndAppearance(): Promise<readonly number[]> {
  const session = requireProofSession()
  const annotation = session.repository.getAll()[0]
  if (annotation === undefined) throw new Error('Custom proof annotation is missing.')
  session.engine.updateAppearance(annotation.id, {
    stroke: { color: '#0066ff' }, fill: { color: '#00cc66', opacity: 0.8 }
  })
  await nextAnimationFrame()
  const canvas = session.pageContainer.querySelector<HTMLCanvasElement>('.konvajs-content canvas')
  const context = canvas?.getContext('2d')
  if (canvas === null || canvas === undefined || context === null || context === undefined) {
    throw new Error('Custom proof Canvas is unavailable.')
  }
  const ratio = canvas.width / 240
  const x = Math.round((annotation.bounds.x + annotation.bounds.width / 2) * ratio)
  const y = Math.round((annotation.bounds.y + annotation.bounds.height / 2) * ratio)
  return [...context.getImageData(x, y, 1, 1).data]
}

/** Unloads and restores the Definition while retaining canonical repository data. */
export async function cycleCustomTypeEndToEndDefinition(): Promise<{
  retained: string
  placeholder: readonly number[]
  restored: readonly number[]
}> {
  const session = requireProofSession()
  const annotation = session.repository.getAll()[0]
  if (annotation === undefined) throw new Error('Custom proof annotation is missing.')
  const retained = JSON.stringify(annotation)
  session.unregister()
  await nextAnimationFrame()
  const placeholder = sampleProofCenter(session, annotation.bounds)
  session.unregister = session.annotationTypes.register(measurementDefinition(session))
  await nextAnimationFrame()
  const restored = sampleProofCenter(session, annotation.bounds)
  return { retained, placeholder, restored }
}

/** Releases all browser proof resources and DOM nodes idempotently. */
export function cleanupCustomTypeEndToEndProbe(): void {
  const session = proofSession
  proofSession = null
  if (session === null) return
  session.engine.destroy()
  session.unregister()
  session.repository.destroy()
  session.annotationTypes.destroy()
  session.root.remove()
}

/** Creates the proof Definition without importing a framework or Konva value. */
function measurementDefinition(session: CustomProofSession): AnnotationTypeDefinition {
  return {
    type: 'custom:proof/measurement', apiVersion: 1, geometry: 'box',
    data: {
      supportedSchemaVersions: [1],
      /** Requires Definition-owned normalized measurement values. */
      validate(payload) {
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          throw new Error('Measurement payload must be an object.')
        }
      }
    },
    capabilities: {
      creation: 'drag-box', creationMode: 'one-shot',
      transform: { move: true, resize: true, rotate: false, endpoints: false, vertices: false },
      appearance: { opacity: true, stroke: true, fill: true, text: false },
      comments: true, printable: true, exportable: true
    },
    appearance: { defaults: {
      opacity: 1,
      stroke: {
        color: '#7c3aed', width: 2, opacity: 1, dash: [5, 3], dashOffset: 0,
        lineCap: 'butt', lineJoin: 'round'
      },
      fill: { color: '#c4b5fd', opacity: 0.55 }, text: null
    } },
    creation: {
      controller: 'drag-box',
      /** Converts normalized pointer geometry into independently versioned data. */
      initialize(input) {
        return {
          bounds: { ...input.bounds },
          content: { text: 'Measurement' },
          typeData: {
            schemaVersion: 1,
            payload: { width: input.bounds.width, height: input.bounds.height, unit: 'pt' }
          }
        }
      }
    },
    interaction: {
      /** Keeps semantic measurements synchronized with direct manipulation. */
      reduceTransform(_annotation, input) {
        return {
          bounds: { ...input.bounds },
          typeData: {
            schemaVersion: 1,
            payload: { width: input.bounds.width, height: input.bounds.height, unit: 'pt' }
          }
        }
      }
    },
    renderer: {
      /** Produces only renderer-neutral scene primitives. */
      render(annotation) {
        session.rendererReceivedKonva ||= 'getStage' in annotation || 'getClassName' in annotation
        return { children: [{
          kind: 'rectangle', bounds: { ...annotation.bounds },
          ...(annotation.appearance.stroke === null
            ? {}
            : { stroke: { ...annotation.appearance.stroke } }),
          ...(annotation.appearance.fill === null
            ? {}
            : { fill: { ...annotation.appearance.fill } })
        }] }
      }
    },
    pdf: { exportStrategy: 'appearance-stream' }
  }
}

/** Samples the current visible renderer at one canonical annotation center. */
function sampleProofCenter(
  session: CustomProofSession,
  bounds: { x: number; y: number; width: number; height: number }
): readonly number[] {
  const canvas = session.pageContainer.querySelector<HTMLCanvasElement>('.konvajs-content canvas')
  const context = canvas?.getContext('2d')
  if (canvas === null || canvas === undefined || context === null || context === undefined) return []
  const ratio = canvas.width / 240
  return [...context.getImageData(
    Math.round((bounds.x + bounds.width / 2) * ratio),
    Math.round((bounds.y + bounds.height / 2) * ratio),
    1, 1
  ).data]
}

/** Returns the active proof or fails with a focused test error. */
function requireProofSession(): CustomProofSession {
  if (proofSession === null) throw new Error('Custom proof is not mounted.')
  return proofSession
}
