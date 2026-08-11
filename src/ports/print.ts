/**
 * @file Browser print side-effect port.
 * @description Separates printable PDF bytes from iframe/dialog ownership.
 */

/** One printable PDF browser request. */
export interface PrintRequest {
  /** Complete printable PDF content. */
  content: Blob | Uint8Array
  /** Optional cancellation signal observed before the system dialog opens. */
  signal?: AbortSignal
}

/** Consumer-replaceable system print boundary. */
export interface PrintProvider {
  /** Opens the system print dialog and resolves once invocation succeeds. */
  print(request: PrintRequest): Promise<void>
}
