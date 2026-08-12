/**
 * @file Legacy annotation compatibility fixture tests.
 * @description Proves verified field mapping, one-based page conversion, exact
 * renderer preservation, unknown field retention, warnings, and invalid input.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  parseLegacyAnnotation,
  serializeLegacyAnnotation
} from '../../../src/compat/legacy/legacy-annotation'
import type { InkLayerError } from '../../../src/domain/errors'
import { createTestAnnotation } from '../../helpers/annotation'
import { resolveAnnotationAppearance } from '../../../src/domain/appearance'

/** Reads the maintained legacy fixture as untrusted JSON. */
async function readLegacyFixture(): Promise<unknown> {
  const path = resolve(import.meta.dirname, '../../fixtures/annotations/legacy-highlight.json')
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

describe('legacy annotation compatibility', () => {
  it('maps the fixture to one canonical source of truth', async () => {
    const onWarning = vi.fn()
    const annotation = parseLegacyAnnotation(await readLegacyFixture(), { onWarning })
    expect(annotation).toMatchObject({
      id: 'legacy-highlight-1',
      type: 'highlight',
      pageIndex: 1,
      coordinateSpace: 'konva-stage',
      referenceNumber: 7,
      source: { kind: 'legacy', subtype: 'Highlight', pdfjsType: 9 }
    })
    expect(annotation.rendererState.serialized).toContain('legacy-highlight-1')
    expect(annotation.comments[0]?.author?.id).toBe('bob')
    expect(annotation.extensions?.['legacyUnknown']).toEqual({
      applicationTag: { workflow: 'review' }
    })
    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ code: 'LEGACY_FIELD_PRESERVED' }))
  })

  it('round-trips all verified fixture fields and unknown metadata', async () => {
    const input = await readLegacyFixture()
    const serialized = serializeLegacyAnnotation(parseLegacyAnnotation(input))
    expect(serialized).toEqual(input)
  })

  it('rejects unknown tool values and PDF-space serialization', () => {
    expect(() => parseLegacyAnnotation({ id: 'bad', type: 99 })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_TYPE_UNSUPPORTED' })
    )
    expect(() => serializeLegacyAnnotation(createTestAnnotation({ coordinateSpace: 'pdf-user-space' })))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'ANNOTATION_INVALID' }))
  })

  it('reports canonical fields that legacy cannot represent', () => {
    const onWarning = vi.fn()
    serializeLegacyAnnotation(createTestAnnotation({
      updatedAt: '2025-08-10T13:00:00Z',
      appearance: resolveAnnotationAppearance('rectangle', { opacity: 0.5, stroke: { color: '#000000' } })
    }), { onWarning })
    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ code: 'LEGACY_FIELD_OMITTED' }))
  })
})
