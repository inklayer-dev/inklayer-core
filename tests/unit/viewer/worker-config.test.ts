/**
 * @file PDF.js worker configuration ownership tests.
 * @description Covers empty URLs, compatible multi-owner use, active conflicts,
 * release idempotency, and later reconfiguration.
 */

import { describe, expect, it } from 'vitest'
import type { InkLayerError } from '../../../src/domain/errors'
import { acquirePdfJsWorkerConfiguration } from '../../../src/viewer/worker-config'

describe('PDF.js worker configuration', () => {
  it('rejects an empty worker URL', () => {
    expect(() => acquirePdfJsWorkerConfiguration('  ', { workerSrc: '' })).toThrowError(
      expect.objectContaining<Partial<InkLayerError>>({ code: 'ENVIRONMENT_UNSUPPORTED' })
    )
  })

  it('supports matching owners and rejects active conflicts', () => {
    const firstTarget = { workerSrc: '' }
    const secondTarget = { workerSrc: '' }
    const releaseFirst = acquirePdfJsWorkerConfiguration('/pdf.worker.mjs', firstTarget)
    const releaseSecond = acquirePdfJsWorkerConfiguration('/pdf.worker.mjs', secondTarget)
    expect(firstTarget.workerSrc).toBe('/pdf.worker.mjs')
    expect(() => acquirePdfJsWorkerConfiguration('/other.worker.mjs', { workerSrc: '' }))
      .toThrowError(expect.objectContaining<Partial<InkLayerError>>({ code: 'PDF_WORKER_CONFLICT' }))
    releaseFirst()
    releaseFirst()
    releaseSecond()
    const releaseOther = acquirePdfJsWorkerConfiguration('/other.worker.mjs', secondTarget)
    expect(secondTarget.workerSrc).toBe('/other.worker.mjs')
    releaseOther()
  })
})
