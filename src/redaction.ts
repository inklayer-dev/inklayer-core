/**
 * @file Secure browser raster redaction pipeline.
 * @description Resolves reviewed text ranges, removes every source text object
 * by rasterizing pages, paints opaque redaction boxes, and returns image-only PDF bytes.
 */

import { InkLayerError } from './domain/errors'
import type {
  PdfDocumentHandle,
  PdfResolvedTextRange,
  PdfTextRange,
  PdfViewerEngine
} from './viewer/types'

/** Secure image-only redaction request around one ready Viewer. */
export interface SecureRedactedPdfOptions {
  /** Ready Viewer that owns the already-open source document. */
  readonly viewer: PdfViewerEngine
  /** Reviewed source-text ranges that must be covered in the output. */
  readonly ranges: readonly PdfTextRange[]
  /** Requested physical pixels per PDF layout unit; defaults to two. */
  readonly pixelRatio?: number
  /** Extra scale-one page units painted around every resolved rectangle; defaults to one. */
  readonly margin?: number
  /** Progress callback after each redacted page is encoded. */
  readonly onProgress?: (completed: number, total: number) => void
  /** Cancellation checked during range resolution, rendering, and serialization. */
  readonly signal?: AbortSignal
}

/** Builds a new image-only PDF whose reviewed text ranges are irreversibly covered. */
export async function buildSecureRedactedPdf(
  options: SecureRedactedPdfOptions
): Promise<Uint8Array> {
  const handle = requireRedactionDocument(options.viewer)
  const requestedPixelRatio = validatePixelRatio(options.pixelRatio)
  const pixelRatio = handle.permissions.print === 'low-resolution'
    ? Math.min(requestedPixelRatio, 1)
    : requestedPixelRatio
  const margin = validateMargin(options.margin)
  if (options.ranges.length === 0) {
    throw redactionError('At least one text range is required.')
  }
  requireBrowserRedactionEnvironment()
  throwIfAborted(options.signal)
  const resolved = await options.viewer.resolveTextRanges(options.ranges, {
    ...(options.signal === undefined ? {} : { signal: options.signal })
  })
  throwIfAborted(options.signal)
  const rangesByPage = groupRangesByPage(resolved)
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()
  try {
    for (let pageIndex = 0; pageIndex < handle.numPages; pageIndex += 1) {
      throwIfAborted(options.signal)
      const page = await options.viewer.renderPageRaster({
        pageIndex,
        scale: 1,
        pixelRatio,
        target: 'print'
      })
      const redacted = await redactPageRaster(
        page.blob,
        page.width,
        page.height,
        pixelRatio,
        rangesByPage.get(pageIndex) ?? [],
        margin
      )
      const embedded = await output.embedPng(await redacted.arrayBuffer())
      const outputPage = output.addPage([page.width, page.height])
      outputPage.drawImage(embedded, { x: 0, y: 0, width: page.width, height: page.height })
      options.onProgress?.(pageIndex + 1, handle.numPages)
    }
    throwIfAborted(options.signal)
    return await output.save()
  } catch (cause) {
    if (cause instanceof InkLayerError || cause instanceof DOMException) throw cause
    throw new InkLayerError('EXPORT_FAILED', 'Secure redacted PDF generation failed.', {
      operation: 'buildSecureRedactedPdf', cause
    })
  }
}

/** Requires a ready, printable document without exposing its PDF.js handle. */
function requireRedactionDocument(viewer: PdfViewerEngine): PdfDocumentHandle {
  const snapshot = viewer.getSnapshot()
  const handle = snapshot.document
  if (snapshot.status !== 'ready' || handle === null) {
    throw redactionError('A ready PDF document is required.')
  }
  if (handle.permissions.print === 'none') {
    throw new InkLayerError('PDF_PERMISSION_DENIED', 'PDF raster output is not permitted.', {
      operation: 'buildSecureRedactedPdf'
    })
  }
  return handle
}

/** Applies the document's permitted density ceiling to one request. */
function validatePixelRatio(value: number | undefined): number {
  const pixelRatio = value ?? 2
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0 || pixelRatio > 4) {
    throw redactionError('Redaction pixel ratio is invalid.')
  }
  return pixelRatio
}

/** Validates bounded bleed around text geometry to prevent visible edge glyphs. */
function validateMargin(value: number | undefined): number {
  const margin = value ?? 1
  if (!Number.isFinite(margin) || margin < 0 || margin > 20) {
    throw redactionError('Redaction margin is invalid.')
  }
  return margin
}

/** Fails before resolving ranges when required browser raster APIs are absent. */
function requireBrowserRedactionEnvironment(): void {
  if (globalThis.document === undefined || typeof globalThis.createImageBitmap !== 'function') {
    throw new InkLayerError('ENVIRONMENT_UNSUPPORTED', 'Browser raster redaction is unavailable.', {
      operation: 'buildSecureRedactedPdf'
    })
  }
}

/** Groups detached resolved geometry without retaining source text in output state. */
function groupRangesByPage(
  ranges: readonly PdfResolvedTextRange[]
): ReadonlyMap<number, readonly PdfResolvedTextRange[]> {
  const grouped = new Map<number, PdfResolvedTextRange[]>()
  for (const range of ranges) {
    const pageRanges = grouped.get(range.pageIndex) ?? []
    pageRanges.push(range)
    grouped.set(range.pageIndex, pageRanges)
  }
  return grouped
}

/** Paints opaque boxes after source-page rasterization and returns a PNG Blob. */
async function redactPageRaster(
  source: Blob,
  width: number,
  height: number,
  pixelRatio: number,
  ranges: readonly PdfResolvedTextRange[],
  margin: number
): Promise<Blob> {
  const bitmap = await globalThis.createImageBitmap(source)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width * pixelRatio))
  canvas.height = Math.max(1, Math.ceil(height * pixelRatio))
  const context = canvas.getContext('2d')
  if (context === null) throw redactionError('Redaction Canvas context is unavailable.')
  try {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    context.fillStyle = '#000000'
    for (const range of ranges) {
      for (const rect of range.rects) {
        const left = Math.max(0, rect.x - margin)
        const top = Math.max(0, rect.y - margin)
        const right = Math.min(width, rect.x + rect.width + margin)
        const bottom = Math.min(height, rect.y + rect.height + margin)
        context.fillRect(
          Math.floor(left * pixelRatio),
          Math.floor(top * pixelRatio),
          Math.ceil((right - left) * pixelRatio),
          Math.ceil((bottom - top) * pixelRatio)
        )
      }
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob === null) reject(redactionError('Redacted page encoding failed.'))
      else resolve(blob)
    }, 'image/png'))
  } finally {
    bitmap.close()
  }
}

/** Throws a standard cancellation between expensive raster stages. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new DOMException('Secure redaction was cancelled.', 'AbortError')
  }
}

/** Creates the structured export failure used by validation branches. */
function redactionError(message: string): InkLayerError {
  return new InkLayerError('EXPORT_FAILED', message, {
    operation: 'buildSecureRedactedPdf'
  })
}
