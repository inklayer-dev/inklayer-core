/**
 * @file Browser download port contract.
 * @description Separates byte generation from the user-agent action that names
 * and downloads generated content.
 */

/** Content accepted by the browser download boundary. */
export type DownloadContent = Blob | ArrayBuffer | Uint8Array

/** One browser download request. */
export interface DownloadRequest {
  /** Generated content without an embedded filename. */
  content: DownloadContent
  /** Suggested local filename including its extension. */
  filename: string
  /** MIME type used when byte content must be wrapped in a Blob. */
  mimeType: string
}

/** Injectable content download boundary. */
export interface DownloadProvider {
  /** Starts one user-agent download action. */
  download(request: DownloadRequest): void
}
