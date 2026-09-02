/**
 * @file Product-owned helpers for the Stamp & Sign Vanilla workflow.
 * @description Parses human page ranges and places proportional image assets on mixed page sizes.
 */

import type { AnnotationBounds } from '@inklayer-dev/core'

export type StampSignAssetType = 'stamp' | 'signature'
export type StampSignPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'

export interface StampSignPageSize {
  /** Rotation-aware page width in unscaled PDF layout units. */
  readonly width: number
  /** Rotation-aware page height in unscaled PDF layout units. */
  readonly height: number
}

export interface StampSignAssetSize {
  /** Natural product placement width used to retain the image ratio. */
  readonly width: number
  /** Natural product placement height used to retain the image ratio. */
  readonly height: number
}

/** Parses one-based page expressions into unique zero-based indexes in document order. */
export function parseStampSignPages(
  expression: string,
  pageCount: number,
  currentPageIndex: number
): readonly number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
    throw new Error('A document with at least one page is required.')
  }
  if (!Number.isSafeInteger(currentPageIndex)
    || currentPageIndex < 0 || currentPageIndex >= pageCount) {
    throw new Error('The current PDF page is invalid.')
  }
  const value = expression.trim().toLowerCase()
  if (value.length === 0) throw new Error('Enter a page range such as all, 1-3, or 2, 5.')
  if (value === 'all') return Array.from({ length: pageCount }, (_, index) => index)
  if (value === 'current') return [currentPageIndex]
  if (value === 'odd') return indexesByParity(pageCount, 1)
  if (value === 'even') return indexesByParity(pageCount, 0)

  const pages = new Set<number>()
  for (const segment of value.split(',')) {
    const token = segment.trim()
    const range = /^(\d+)\s*-\s*(\d+)$/u.exec(token)
    if (range !== null) {
      const start = parsePageNumber(range[1], pageCount)
      const end = parsePageNumber(range[2], pageCount)
      if (start > end) throw new Error(`Page range ${token} must run from low to high.`)
      for (let page = start; page <= end; page += 1) pages.add(page - 1)
      continue
    }
    if (/^\d+$/u.test(token)) {
      pages.add(parsePageNumber(token, pageCount) - 1)
      continue
    }
    throw new Error(`Page range “${token || segment}” is invalid.`)
  }
  if (pages.size === 0) throw new Error('The page range did not select any pages.')
  return [...pages].sort((left, right) => left - right)
}

/** Fits one image proportionally and anchors it inside the page with a bounded margin. */
export function resolveStampSignBounds(
  page: StampSignPageSize,
  asset: StampSignAssetSize,
  requestedWidth: number,
  margin: number,
  position: StampSignPosition
): AnnotationBounds {
  requirePositiveSize(page, 'PDF page')
  requirePositiveSize(asset, 'Stamp or signature asset')
  if (!Number.isFinite(requestedWidth) || requestedWidth <= 0) {
    throw new Error('Stamp or signature width must be positive.')
  }
  if (!Number.isFinite(margin) || margin < 0) {
    throw new Error('Page margin cannot be negative.')
  }
  const safeMargin = Math.min(margin, page.width / 4, page.height / 4)
  const availableWidth = Math.max(1, page.width - safeMargin * 2)
  const availableHeight = Math.max(1, page.height - safeMargin * 2)
  const ratio = asset.width / asset.height
  let width = Math.min(requestedWidth, availableWidth)
  let height = width / ratio
  if (height > availableHeight) {
    height = availableHeight
    width = height * ratio
  }
  const horizontal = position.endsWith('right')
    ? page.width - safeMargin - width
    : position.endsWith('left') ? safeMargin : (page.width - width) / 2
  const vertical = position.startsWith('bottom')
    ? page.height - safeMargin - height
    : position.startsWith('top') ? safeMargin : (page.height - height) / 2
  return { x: horizontal, y: vertical, width, height }
}

/** Returns one-based odd or even page indexes as zero-based values. */
function indexesByParity(pageCount: number, parity: 0 | 1): readonly number[] {
  return Array.from({ length: pageCount }, (_, index) => index)
    .filter((index) => (index + 1) % 2 === parity)
}

/** Requires one bounded one-based page number. */
function parsePageNumber(value: string | undefined, pageCount: number): number {
  const page = Number.parseInt(value ?? '', 10)
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) {
    throw new Error(`Page ${value ?? ''} is outside 1-${pageCount}.`)
  }
  return page
}

/** Rejects impossible page or asset dimensions before division. */
function requirePositiveSize(size: StampSignPageSize, label: string): void {
  if (!Number.isFinite(size.width) || size.width <= 0
    || !Number.isFinite(size.height) || size.height <= 0) {
    throw new Error(`${label} dimensions are invalid.`)
  }
}
