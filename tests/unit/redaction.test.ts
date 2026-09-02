/**
 * @file Secure redaction policy tests.
 * @description Verifies fail-closed validation before browser raster resources are used.
 */

import { describe, expect, it } from 'vitest'
import type { InkLayerError } from '../../src/domain/errors'
import { buildSecureRedactedPdf } from '../../src/redaction'
import type { PdfDocumentHandle, PdfViewerEngine } from '../../src/viewer/types'

/** Creates a minimal Viewer facade exposing one immutable document snapshot. */
function viewerWith(
  status: 'idle' | 'ready',
  print: PdfDocumentHandle['permissions']['print'] = 'high-resolution'
): PdfViewerEngine {
  return {
    getSnapshot: () => ({
      status,
      generation: 1,
      error: null,
      progress: null,
      document: status === 'ready' ? {
        document: {} as PdfDocumentHandle['document'],
        numPages: 1,
        fingerprints: ['fixture'],
        passwordProtected: false,
        permissions: {
          print,
          copy: true,
          copyForAccessibility: true,
          modify: true,
          annotate: true,
          fillForms: true,
          assemble: true
        }
      } : null
    })
  } as unknown as PdfViewerEngine
}

const range = { pageIndex: 0, start: 0, length: 4 } as const

describe('secure redaction policy', () => {
  it('requires a ready Viewer before accepting ranges', async () => {
    await expect(buildSecureRedactedPdf({
      viewer: viewerWith('idle'), ranges: [range]
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'EXPORT_FAILED'
    }))
  })

  it('fails closed when raster output is prohibited', async () => {
    await expect(buildSecureRedactedPdf({
      viewer: viewerWith('ready', 'none'), ranges: [range]
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_PERMISSION_DENIED'
    }))
  })

  it('rejects an empty reviewed range set', async () => {
    await expect(buildSecureRedactedPdf({
      viewer: viewerWith('ready'), ranges: []
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'EXPORT_FAILED'
    }))
  })

  it('rejects invalid density and bleed before requiring browser resources', async () => {
    await expect(buildSecureRedactedPdf({
      viewer: viewerWith('ready'), ranges: [range], pixelRatio: 0
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'EXPORT_FAILED'
    }))
    await expect(buildSecureRedactedPdf({
      viewer: viewerWith('ready'), ranges: [range], margin: 21
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'EXPORT_FAILED'
    }))
  })
})
