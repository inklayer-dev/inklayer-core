/**
 * @file Password-safe browser raster print pipeline.
 * @description Renders already-unlocked PDF.js pages, composites canonical
 * annotations and print watermarks, and creates transient printable PDF bytes.
 * @remarks Output is intentionally rasterized and unencrypted; it is for a
 * print dialog, not a replacement download of the protected source document.
 */

import type { AnnotationEngine } from './annotation/annotation-engine'
import { createAnnotationEngine } from './annotation/annotation-engine'
import { InkLayerError } from './domain/errors'
import type { PdfViewerEngine } from './viewer/types'

/** Secure raster print request around one ready Viewer. */
export interface SecureRasterPrintOptions {
  /** Ready Viewer whose PDF.js document has already passed password handling. */
  viewer: PdfViewerEngine
  /** Optional canonical Annotation Engine whose repository is rendered. */
  annotations?: AnnotationEngine
  /** Requested physical pixels per PDF layout unit; defaults to two. */
  pixelRatio?: number
  /** Optional inclusive zero-based page range. */
  pages?: { from: number; to: number }
  /** Progress callback after each composited page. */
  onProgress?: (completed: number, total: number) => void
  /** Cancellation checked between and during page renders. */
  signal?: AbortSignal
}

/** Builds a rasterized printable PDF from a ready, possibly encrypted document. */
export async function buildSecureRasterPrintPdf(
  options: SecureRasterPrintOptions
): Promise<Uint8Array> {
  const snapshot = options.viewer.getSnapshot()
  const handle = snapshot.document
  if (snapshot.status !== 'ready' || handle === null) {
    throw rasterPrintError('A ready PDF document is required.')
  }
  if (handle.permissions.print === 'none') {
    throw new InkLayerError('PDF_PERMISSION_DENIED', 'PDF printing is not permitted.', {
      operation: 'buildSecureRasterPrintPdf'
    })
  }
  const requestedPixelRatio = options.pixelRatio ?? 2
  if (!Number.isFinite(requestedPixelRatio) || requestedPixelRatio <= 0
    || requestedPixelRatio > 4) {
    throw rasterPrintError('Raster print pixel ratio is invalid.')
  }
  const pixelRatio = handle.permissions.print === 'low-resolution'
    ? Math.min(requestedPixelRatio, 1)
    : requestedPixelRatio
  const range = normalizePageRange(options.pages, handle.numPages)
  const pageIndexes = Array.from(
    { length: range.to - range.from + 1 },
    (_, index) => range.from + index
  )
  const document = globalThis.document
  if (document === undefined || typeof globalThis.createImageBitmap !== 'function') {
    throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'Browser raster printing is unavailable.', {
      operation: 'buildSecureRasterPrintPdf'
    })
  }
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()
  const temporaryRoot = document.createElement('div')
  const printAnnotations = options.annotations === undefined
    ? null
    : createAnnotationEngine({
        root: temporaryRoot,
        repository: options.annotations.repository,
        snapshotStrategy: 'strict'
      })
  try {
    for (const [position, pageIndex] of pageIndexes.entries()) {
      throwIfAborted(options.signal)
      const page = await options.viewer.renderPageRaster({
        pageIndex,
        scale: 1,
        pixelRatio,
        target: 'print'
      })
      const annotationHost = document.createElement('div')
      temporaryRoot.append(annotationHost)
      let annotationCanvas: HTMLCanvasElement | null = null
      if (printAnnotations !== null) {
        await printAnnotations.attachPage({
          pageIndex,
          container: annotationHost,
          width: page.width,
          height: page.height,
          scale: 1
        })
        annotationCanvas = printAnnotations.renderPageRaster(pageIndex, pixelRatio)
      }
      const merged = await compositePrintPage(page.blob, annotationCanvas, page.width, page.height, pixelRatio)
      if (printAnnotations !== null) printAnnotations.detachPage(pageIndex)
      annotationHost.remove()
      const embedded = await output.embedPng(await merged.arrayBuffer())
      const outputPage = output.addPage([page.width, page.height])
      outputPage.drawImage(embedded, { x: 0, y: 0, width: page.width, height: page.height })
      options.onProgress?.(position + 1, pageIndexes.length)
    }
    throwIfAborted(options.signal)
    return await output.save()
  } catch (cause) {
    if (cause instanceof InkLayerError || cause instanceof DOMException) throw cause
    throw new InkLayerError('EXPORT_FAILED', 'Raster print PDF generation failed.', {
      operation: 'buildSecureRasterPrintPdf', cause
    })
  } finally {
    printAnnotations?.destroy()
    temporaryRoot.remove()
  }
}

/** Composites the PDF raster and transparent annotation raster in paint order. */
async function compositePrintPage(
  pdfBlob: Blob,
  annotationCanvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  pixelRatio: number
): Promise<Blob> {
  const bitmap = await globalThis.createImageBitmap(pdfBlob)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width * pixelRatio))
  canvas.height = Math.max(1, Math.ceil(height * pixelRatio))
  const context = canvas.getContext('2d')
  if (context === null) throw rasterPrintError('Raster print Canvas context is unavailable.')
  try {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    if (annotationCanvas !== null) {
      context.drawImage(annotationCanvas, 0, 0, canvas.width, canvas.height)
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob === null) reject(rasterPrintError('Raster print page encoding failed.'))
      else resolve(blob)
    }, 'image/png'))
  } finally {
    bitmap.close()
  }
}

/** Validates an optional inclusive page range. */
function normalizePageRange(
  pages: SecureRasterPrintOptions['pages'],
  pageCount: number
): { from: number; to: number } {
  const range = pages ?? { from: 0, to: pageCount - 1 }
  if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to)
    || range.from < 0 || range.to < range.from || range.to >= pageCount) {
    throw rasterPrintError('Raster print page range is invalid.')
  }
  return { ...range }
}

/** Throws a standard abort failure without retaining document state. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new DOMException('Raster printing was cancelled.', 'AbortError')
}

/** Creates one structured raster-print validation failure. */
function rasterPrintError(message: string): InkLayerError {
  return new InkLayerError('EXPORT_FAILED', message, {
    operation: 'buildSecureRasterPrintPdf'
  })
}
