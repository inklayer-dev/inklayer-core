/**
 * @file Secure raster print policy tests.
 * @description Verifies ready-document, permission, and request validation
 * before any browser Canvas or PDF output work begins.
 */

import { describe, expect, it } from 'vitest'
import type { InkLayerError } from '../../src/domain/errors'
import { buildSecureRasterPrintPdf } from '../../src/raster-print'
import type { PdfDocumentHandle, PdfViewerEngine } from '../../src/viewer/types'

/** Creates a minimal Viewer facade exposing one immutable ready snapshot. */
function viewerWithPrintPermission(
  print: PdfDocumentHandle['permissions']['print']
): PdfViewerEngine {
  return {
    getSnapshot: () => ({
      status: 'ready',
      generation: 1,
      error: null,
      progress: null,
      document: {
        document: {} as PdfDocumentHandle['document'],
        numPages: 2,
        fingerprints: ['fixture'],
        passwordProtected: true,
        permissions: {
          print,
          copy: false,
          copyForAccessibility: true,
          modify: false,
          annotate: false,
          fillForms: false,
          assemble: false
        }
      }
    })
  } as unknown as PdfViewerEngine
}

describe('secure raster print policy', () => {
  it('fails closed before rendering when PDF permissions prohibit printing', async () => {
    await expect(buildSecureRasterPrintPdf({
      viewer: viewerWithPrintPermission('none')
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'PDF_PERMISSION_DENIED'
    }))
  })

  it('rejects invalid raster density before requiring browser resources', async () => {
    await expect(buildSecureRasterPrintPdf({
      viewer: viewerWithPrintPermission('high-resolution'),
      pixelRatio: 0
    })).rejects.toEqual(expect.objectContaining<Partial<InkLayerError>>({
      code: 'EXPORT_FAILED'
    }))
  })
})
