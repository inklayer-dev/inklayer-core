/**
 * @file Default browser Blob download implementation.
 * @description Owns its temporary anchor and object URL for one synchronous
 * browser action; content generation and filename policy remain with callers.
 */

import type { DownloadContent, DownloadProvider, DownloadRequest } from '../../ports/download'

/** Creates the default browser download provider. */
export function createBrowserDownloadProvider(): DownloadProvider {
  return { download: downloadBlob }
}

/** Downloads generated content and releases its temporary DOM and URL resources. */
export function downloadBlob(request: DownloadRequest): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Browser download APIs are unavailable.')
  }
  if (request.filename.trim().length === 0 || request.mimeType.trim().length === 0) {
    throw new RangeError('Download filename and MIME type are required.')
  }
  const blob = toBlob(request.content, request.mimeType)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = request.filename
  anchor.hidden = true
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  }
}

/** Wraps bytes in a Blob while preserving an existing Blob instance. */
function toBlob(content: DownloadContent, mimeType: string): Blob {
  if (content instanceof Blob) return content
  if (content instanceof Uint8Array) {
    const copy = new Uint8Array(content.byteLength)
    copy.set(content)
    return new Blob([copy.buffer], { type: mimeType })
  }
  return new Blob([content], { type: mimeType })
}
