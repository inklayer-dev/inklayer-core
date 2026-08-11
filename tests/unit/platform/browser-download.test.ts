/**
 * @file Browser download boundary unit tests.
 * @description Verifies byte wrapping, one-shot anchor behavior, cleanup, and
 * environment validation without coupling exporters to browser APIs.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadBlob } from '../../../src/platform/browser/download'

const originalDocument = globalThis.document
const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

afterEach(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
  URL.createObjectURL = originalCreateObjectUrl
  URL.revokeObjectURL = originalRevokeObjectUrl
})

describe('downloadBlob', () => {
  it('clicks one hidden anchor and releases its object URL and DOM node', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const anchor = { href: '', download: '', hidden: false, click, remove }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: vi.fn(() => anchor), body: { append } }
    })
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()

    downloadBlob({
      content: new Uint8Array([1, 2, 3]),
      filename: 'annotations.pdf',
      mimeType: 'application/pdf'
    })

    expect(anchor).toMatchObject({ href: 'blob:test', download: 'annotations.pdf', hidden: true })
    expect(append).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf' }))
  })

  it('fails safely without browser download APIs', () => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined })
    expect(() => downloadBlob({ content: new ArrayBuffer(0), filename: 'a.pdf', mimeType: 'application/pdf' }))
      .toThrow('Browser download APIs are unavailable.')
  })
})
