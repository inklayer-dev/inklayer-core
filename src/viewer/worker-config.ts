/**
 * @file Centralized PDF.js worker configuration ownership.
 * @description Validates explicit worker URLs and prevents active Viewer
 * instances from silently replacing each other's global PDF.js worker source.
 */

import { InkLayerError } from '../domain/errors'

/** Minimal PDF.js worker target used without importing PDF.js at module load. */
export interface PdfJsWorkerOptionsTarget {
  /** Global PDF.js worker script URL. */
  workerSrc: string
}

let activeWorkerSrc: string | null = null
let activeOwners = 0

/** Acquires compatible ownership of the process-wide PDF.js worker setting. */
export function acquirePdfJsWorkerConfiguration(
  workerSrc: string,
  target: PdfJsWorkerOptionsTarget
): () => void {
  const normalized = workerSrc.trim()
  if (normalized.length === 0) {
    throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'A non-empty PDF.js workerSrc is required.', {
      operation: 'configurePdfJsWorker'
    })
  }
  if (activeWorkerSrc !== null && activeWorkerSrc !== normalized) {
    throw new InkLayerError('PDF_WORKER_CONFLICT', 'Active Viewer instances require the same workerSrc.', {
      operation: 'configurePdfJsWorker'
    })
  }
  activeWorkerSrc = normalized
  activeOwners += 1
  target.workerSrc = normalized
  let released = false
  return () => {
    if (released) return
    released = true
    activeOwners -= 1
    if (activeOwners === 0) activeWorkerSrc = null
  }
}
