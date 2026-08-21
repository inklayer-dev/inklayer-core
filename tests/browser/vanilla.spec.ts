/**
 * @file Framework-free browser acceptance tests.
 * @description Exercises real PDF.js, Konva, every annotation tool, comments,
 * cursor CSS, FreeText, exports, zoom, and remount cleanup.
 */

import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { buildAnnotatedPdf } from '../../src/export/pdf'
import { buildToolRendererState } from '../../src/renderer/konva/snapshot-builder'
import { resolveAnnotationAppearance } from '../../src/domain/appearance'
import { createTestAnnotation } from '../helpers/annotation'
import type * as CustomTypeProbeModule from '../../examples/vanilla/src/custom-type-probe'

const TOOLS = [
  'highlight', 'strikeout', 'underline', 'free-text', 'rectangle', 'circle',
  'freehand', 'free-highlight', 'signature', 'stamp', 'note', 'line', 'arrow',
  'polygon', 'polyline', 'cloud'
] as const

test('keeps long-document virtual pages and thumbnail resources bounded through churn', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const active = new Set<string>()
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    let created = 0
    let revoked = 0
    URL.createObjectURL = (value: Blob | MediaSource): string => {
      const url = create(value)
      active.add(url)
      created += 1
      return url
    }
    URL.revokeObjectURL = (url: string): void => {
      if (active.delete(url)) revoked += 1
      revoke(url)
    }
    Object.defineProperty(window, '__inklayerObjectUrlMetrics', {
      value: {
        active,
        get created() { return created },
        get revoked() { return revoked }
      }
    })
  })
  await page.goto('/')
  await expect(page.locator('.instance-status')).toHaveText(
    'Ready · generated sample · page 1/3 · 0 annotations'
  )
  const viewer = page.locator('.instance-card').first()
  expect(await readObjectUrlMetrics(page)).toEqual({ active: 3, created: 3, revoked: 0 })

  await viewer.getByRole('button', { name: 'Long PDF' }).click()
  await expect(viewer.locator('.instance-status')).toContainText(
    'Ready · long-document fixture · page 1/96', { timeout: 30_000 }
  )
  await expect(viewer.locator('.thumbnail-button')).toHaveCount(96, { timeout: 30_000 })
  expect(await readObjectUrlMetrics(page)).toEqual({ active: 96, created: 99, revoked: 3 })

  await viewer.locator('.search-input').fill('lifecycle stress search token')
  await viewer.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(viewer.locator('.search-results button')).toHaveCount(30)
  await expect(viewer.locator('.instance-status')).toHaveText('30 search results (limited)')

  await viewer.getByRole('button', { name: 'Continuous' }).click()
  await expect(viewer.locator('.inklayer-page-flow-page')).toHaveCount(96, { timeout: 30_000 })
  const mountedCounts: number[] = []
  for (const pageIndex of [0, 23, 47, 71, 95]) {
    await viewer.locator('.thumbnail-button').nth(pageIndex).click()
    await expect(viewer.locator('.instance-status')).toContainText(`page ${pageIndex + 1}/96`)
    const mountedPages = viewer.locator(
      '.inklayer-page-flow-page[data-inklayer-flow-mounted="true"]'
    )
    await expect.poll(async () => {
      const count = await mountedPages.count()
      return count >= 1 && count <= 6
    }).toBe(true)
    mountedCounts.push(await mountedPages.count())
  }
  expect(mountedCounts.every((count) => count >= 1 && count <= 6)).toBe(true)

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await viewer.getByRole('button', { name: 'Zoom +' }).click()
    await viewer.getByRole('button', { name: 'Zoom out' }).click()
  }
  await expect(viewer.locator('.inklayer-page-flow-page')).toHaveCount(96)
  expect((await readObjectUrlMetrics(page)).active).toBe(96)

  await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.instance-card')
    card?.querySelector<HTMLButtonElement>('.long-sample')?.click()
    card?.querySelector<HTMLButtonElement>('.mixed-sample')?.click()
  })
  await expect(viewer.locator('.instance-status')).toContainText(
    'Ready · mixed-page fixture · page 1/3', { timeout: 30_000 }
  )
  await expect(viewer.locator('.inklayer-page-flow-page')).toHaveCount(0)
  await expect(viewer.locator('.thumbnail-button')).toHaveCount(3)
  const finalUrls = await readObjectUrlMetrics(page)
  expect(finalUrls.active).toBe(3)
  expect(finalUrls.created - finalUrls.revoked).toBe(3)
  expect(failures).toEqual([])
})

test('keeps mixed CropBox pages aligned through viewer, text, annotations, thumbnails, print, and export', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  await expect(page.locator('.instance-status')).toHaveText(
    'Ready · generated sample · page 1/3 · 0 annotations'
  )
  const viewer = page.locator('.instance-card').first()
  await viewer.getByRole('button', { name: 'Mixed PDF' }).click()
  await expect(viewer.locator('.instance-status')).toContainText('mixed-page fixture · page 1/3 · 1 annotations')

  await expectPageSize(viewer, 564, 720)
  await expect(viewer.locator('.inklayer-text-layer')).toContainText('Selection begins')
  await expect(viewer.locator('.thumbnail-button')).toHaveCount(3)
  expect(await viewer.locator('.thumbnail-button img').evaluateAll((images) => images.map((image) => ({
    width: Number(image.getAttribute('width')),
    height: Number(image.getAttribute('height'))
  })))).toEqual([
    { width: 86, height: 110 },
    { width: 86, height: 129 },
    { width: 86, height: 60 }
  ])

  await viewer.locator('.thumbnail-button').nth(1).click()
  await expect(viewer.locator('.instance-status')).toContainText('page 2/3 · 2 annotations')
  await expectPageSize(viewer, 400, 600)
  await expect(viewer.locator('.inklayer-text-layer')).toContainText('rotated page')

  await viewer.locator('.thumbnail-button').nth(2).click()
  await expect(viewer.locator('.instance-status')).toContainText('page 3/3 · 3 annotations')
  await expectPageSize(viewer, 780, 540)
  await expect(viewer.locator('.inklayer-text-layer')).toContainText('wide visible page')

  await viewer.getByRole('button', { name: 'Continuous' }).click()
  await expect(viewer.locator('.inklayer-page-flow-page')).toHaveCount(3)
  expect(await viewer.locator('.inklayer-page-flow-page').evaluateAll((pages) => pages.map((item) => ({
    width: (item as HTMLElement).style.width,
    height: (item as HTMLElement).style.height
  })))).toEqual([
    { width: '564px', height: '720px' },
    { width: '400px', height: '600px' },
    { width: '780px', height: '540px' }
  ])
  await viewer.locator('.thumbnail-button').first().click()
  await expect(viewer.locator('[data-inklayer-flow-page="0"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await expect(viewer.locator('[data-inklayer-flow-page="1"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await viewer.locator('.tool-select').selectOption('highlight')
  const selection = await page.evaluate(() => {
    const start = document.querySelector<HTMLElement>(
      '.instance-card:first-of-type [data-inklayer-flow-page="0"] .inklayer-text-layer span'
    )
    const candidates = document.querySelectorAll<HTMLElement>(
      '.instance-card:first-of-type [data-inklayer-flow-page="1"] .inklayer-text-layer span'
    )
    const end = candidates.item(candidates.length - 1)
    if (start?.firstChild === null || start?.firstChild === undefined
      || end?.firstChild === null || end?.firstChild === undefined) return null
    const native = document.getSelection()
    native?.removeAllRanges()
    native?.setBaseAndExtent(start.firstChild, 0, end.firstChild, end.textContent?.length ?? 0)
    end.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    return native?.toString() ?? ''
  })
  expect(selection).toContain('Selection begins')
  expect(selection).toContain('Selection continues')
  await expect(viewer.locator('.inklayer-annotation-a11y-list button')).toHaveCount(4)

  await viewer.getByRole('button', { name: 'Prepare print' }).click()
  await expect(viewer.locator('.instance-status')).toContainText('Prepared raster print')

  const downloadPromise = page.waitForEvent('download')
  await viewer.getByRole('button', { name: 'Export PDF' }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  if (downloadPath === null) throw new Error('Mixed-page export did not produce a local file.')
  const exported = await PDFDocument.load(await readFile(downloadPath))
  expect(exported.getPages().map((pdfPage) => pdfPage.getCropBox())).toEqual([
    { x: 24, y: 36, width: 564, height: 720 },
    { x: 20, y: 30, width: 600, height: 400 },
    { x: 15, y: 20, width: 540, height: 780 }
  ])
  expect(exported.getPages().map((pdfPage) => pdfPage.getRotation().angle)).toEqual([0, 90, 270])
  expect(failures).toEqual([])
})

test('renders unknown custom annotations safely and restores a controlled Definition', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/custom-type-probe.ts'
    const probe = await import(path) as typeof CustomTypeProbeModule
    return probe.runCustomTypeBrowserProbe()
  })

  expect(result.before).not.toEqual(result.after)
  expect(result.after[0]).toBeGreaterThan(result.after[1] ?? 0)
  expect(result.accessible).toMatch(/custom:test\/browser/i)
  expect(failures).toEqual([])
})

test('runs a custom type through pointer creation, transform, print scene, unload, and restore', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/src/custom-type-probe.ts'
    const probe = await import(path) as typeof CustomTypeProbeModule
    await probe.mountCustomTypeEndToEndProbe()
  })
  try {
    const surface = page.locator('#custom-type-e2e-probe .konvajs-content')
    await expect(surface).toBeVisible()
    await surface.scrollIntoViewIfNeeded()
    const before = await page.evaluate(async () => {
      const path = '/src/custom-type-probe.ts'
      const probe = await import(path) as typeof CustomTypeProbeModule
      return probe.readCustomTypeEndToEndState()
    })
    expect(before.cursor).toBe('crosshair')

    const box = await surface.boundingBox()
    if (box === null) throw new Error('Custom type proof surface has no bounds.')
    await page.mouse.move(box.x + 30, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + 130, box.y + 90, { steps: 5 })
    await page.mouse.up()

    const created = await page.evaluate(async () => {
      const path = '/src/custom-type-probe.ts'
      const probe = await import(path) as typeof CustomTypeProbeModule
      return probe.readCustomTypeEndToEndState()
    })
    expect(created.errors).toEqual([])
    expect(created.count).toBe(1)
    expect(created.selectedIds).toHaveLength(1)
    expect(created.tool).toBe('select')
    expect(created.typeData).toMatchObject({
      schemaVersion: 1,
      payload: { width: 100, height: 60, unit: 'pt' }
    })
    expect(created.rendererReceivedKonva).toBe(false)
    expect(created.rasterAlpha).toBeGreaterThan(0)

    const bounds = created.bounds
    if (bounds === null) throw new Error('Custom annotation bounds are missing.')
    let transformed = created
    for (let attempt = 0; attempt < 3 && transformed.bounds?.x === bounds.x; attempt += 1) {
      await surface.scrollIntoViewIfNeeded()
      const currentSurface = await surface.boundingBox()
      const currentBounds = transformed.bounds
      if (currentSurface === null || currentBounds === null) break
      const startX = currentSurface.x + currentBounds.x + currentBounds.width * 0.3
      const startY = currentSurface.y + currentBounds.y + currentBounds.height * 0.55
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + 20, startY + 15, { steps: 6 })
      await page.mouse.up()
      transformed = await page.evaluate(async () => {
        const path = '/src/custom-type-probe.ts'
        const probe = await import(path) as typeof CustomTypeProbeModule
        return probe.readCustomTypeEndToEndState()
      })
    }
    expect(transformed.bounds?.x).toBeGreaterThan(bounds.x)
    expect(transformed.bounds?.y).toBeGreaterThan(bounds.y)
    expect(transformed.typeData).toMatchObject({
      schemaVersion: 1,
      payload: { width: transformed.bounds?.width, height: transformed.bounds?.height, unit: 'pt' }
    })

    const appearancePixel = await page.evaluate(async () => {
      const path = '/src/custom-type-probe.ts'
      const probe = await import(path) as typeof CustomTypeProbeModule
      return await probe.updateCustomTypeEndToEndAppearance()
    })
    expect(appearancePixel[1]).toBeGreaterThan(appearancePixel[0] ?? 0)

    const cycled = await page.evaluate(async () => {
      const path = '/src/custom-type-probe.ts'
      const probe = await import(path) as typeof CustomTypeProbeModule
      return await probe.cycleCustomTypeEndToEndDefinition()
    })
    expect(cycled.retained).toContain('custom:proof/measurement')
    expect(cycled.retained).toContain('"unit":"pt"')
    expect(cycled.placeholder).not.toEqual(cycled.restored)
    expect(failures).toEqual([])
  } finally {
    await page.evaluate(async () => {
      const path = '/src/custom-type-probe.ts'
      const probe = await import(path) as typeof CustomTypeProbeModule
      probe.cleanupCustomTypeEndToEndProbe()
    })
    await expect(page.locator('#custom-type-e2e-probe')).toHaveCount(0)
  }
})

test('opens and focuses FreeText after a real canvas click', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  const alice = page.locator('.instance-card').first()
  await expect(alice.locator('.instance-status')).toContainText('Ready')
  await alice.locator('.tool-select').selectOption('free-text')
  await alice.locator('.konvajs-content').click({ position: { x: 120, y: 140 } })
  const input = alice.locator('.inklayer-text-input')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()
  await input.fill('Canvas FreeText')
  await input.press('Control+Enter')
  await expect(input).toBeHidden()
  await expect(alice).toBeFocused()
  await expect(alice.locator('.inklayer-author-label')).toHaveCount(1)
  await expect(alice.locator('.inklayer-author-label')).toBeVisible()
  await expect(alice.locator('.tool-select')).toHaveValue('select')
  expect(failures).toEqual([])
})

test('owns direct-document keyboard focus, movement, selection, and deletion', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  const alice = page.locator('.instance-card').first()
  await expect(alice).toHaveAttribute('role', 'region')
  await expect(alice).toHaveAttribute('tabindex', '0')
  await expect(alice).toHaveAttribute('aria-label', 'Demo PDF annotation workspace')
  const canvas = alice.locator('.konvajs-content')
  await alice.locator('.tool-select').selectOption('rectangle')
  await alice.getByRole('button', { name: 'Add sample' }).click()
  const item = alice.locator('.inklayer-annotation-a11y-list button')
  await expect(item).toHaveCount(1)

  await canvas.click({ position: { x: 100, y: 120 } })
  await expect(alice).toBeFocused()
  const label = alice.locator('.inklayer-author-label')
  const before = await label.evaluate((element) => ({
    x: Number((element as HTMLElement).dataset['anchorX']),
    y: Number((element as HTMLElement).dataset['anchorY'])
  }))
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(async () => label.evaluate((element) => ({
    x: Number((element as HTMLElement).dataset['anchorX']),
    y: Number((element as HTMLElement).dataset['anchorY'])
  }))).toEqual({ x: before.x + 1, y: before.y + 10 })

  await item.focus()
  await expect(item).toBeFocused()
  await expect(item).toHaveCSS('clip-path', 'none')
  await item.press('Enter')
  await expect(item).toHaveAttribute('aria-pressed', 'true')
  await item.press('Escape')
  await expect(item).toHaveAttribute('aria-pressed', 'false')
  await item.press('Enter')
  await item.press('Backspace')
  await expect(item).toHaveCount(0)
  expect(failures).toEqual([])
})

test('hands keyboard TextLayer selection focus to and from the product menu', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  const alice = page.locator('.instance-card').first()
  await expect(alice.locator('.instance-status')).toContainText('Ready')
  await page.evaluate(() => {
    const span = document.querySelector<HTMLElement>(
      '.instance-card:first-of-type .inklayer-text-layer span'
    )
    const node = span?.firstChild
    if (span === null || span === undefined || node === null || node === undefined) {
      throw new Error('Keyboard TextLayer endpoint is unavailable.')
    }
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.setBaseAndExtent(node, 0, node, Math.min(4, node.textContent?.length ?? 0))
    span.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
  })
  const menu = alice.getByRole('toolbar', { name: 'Text annotation actions' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Highlight' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(menu.getByRole('button', { name: 'Underline' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(alice).toBeFocused()
  expect(failures).toEqual([])
})

test('coerces smooth page navigation when reduced motion is requested', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const alice = page.locator('.instance-card').first()
  await expect(alice.locator('.instance-status')).toContainText('Ready')
  await alice.getByRole('button', { name: 'Continuous' }).click()
  await expect(alice.locator('.inklayer-page-flow-page')).toHaveCount(3)
  await page.evaluate(() => {
    const view = window as typeof window & { inklayerLastScrollBehavior?: ScrollBehavior }
    for (const shell of document.querySelectorAll<HTMLElement>('[data-inklayer-flow-page]')) {
      Object.defineProperty(shell, 'scrollIntoView', {
        configurable: true,
        value: (options?: boolean | ScrollIntoViewOptions) => {
          if (typeof options === 'object' && options.behavior !== undefined) {
            view.inklayerLastScrollBehavior = options.behavior
          }
        }
      })
    }
  })
  await alice.getByRole('button', { name: 'Text Selection', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { inklayerLastScrollBehavior?: ScrollBehavior }
  ).inklayerLastScrollBehavior)).toBe('auto')
  expect(failures).toEqual([])
})

test('places visible image-backed Signature and Stamp annotations from canvas clicks', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  const alice = page.locator('.instance-card').first()
  await expect(alice.locator('.instance-status')).toContainText('Ready')
  const canvas = alice.locator('.konvajs-content')
  await alice.locator('.tool-select').selectOption('signature')
  await expect.poll(async () => canvas.evaluate((element) => getComputedStyle(element).cursor))
    .toContain('url(')
  await canvas.click({ position: { x: 180, y: 180 } })
  await expect(alice.locator('.inklayer-annotation-a11y-list button')).toHaveCount(1)
  await expect(alice.locator('.inklayer-annotation-a11y-list button')).toHaveAttribute(
    'aria-label', /signature/i
  )
  await expect(alice.locator('.tool-select')).toHaveValue('select')
  await expect(alice.locator('.inklayer-author-label')).toBeVisible()
  await alice.locator('.tool-select').selectOption('stamp')
  await expect.poll(async () => canvas.evaluate((element) => getComputedStyle(element).cursor))
    .toContain('url(')
  await canvas.click({ position: { x: 320, y: 250 } })
  await expect(alice.locator('.inklayer-annotation-a11y-list button')).toHaveCount(2)
  await expect(alice.locator('.inklayer-annotation-a11y-list button').nth(1)).toHaveAttribute(
    'aria-label', /stamp/i
  )
  await expect(alice.locator('.tool-select')).toHaveValue('select')
  expect(failures).toEqual([])
})

test('selects annotations imported from an annotated PDF opened by the demo', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  const alice = page.locator('.instance-card').first()
  await expect(alice.locator('.instance-status')).toContainText('Ready')
  const bytes = await createNativeAnnotationPdf()
  await alice.locator('.pdf-file').setInputFiles({
    name: 'react-style-annotations.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes)
  })
  await expect(alice.locator('.instance-status')).toContainText('react-style-annotations.pdf')
  await expect(alice.locator('.tool-select')).toHaveValue('select')
  await expect(alice.locator('.inklayer-author-label')).toHaveCount(1)
  await expect(alice.locator('.inklayer-author-label')).toBeHidden()
  const annotationCanvas = alice.locator('.konvajs-content')
  await annotationCanvas.scrollIntoViewIfNeeded()
  const canvas = await annotationCanvas.boundingBox()
  if (canvas === null) throw new Error('Imported annotation canvas is unavailable.')
  await page.mouse.click(canvas.x + 30, canvas.y + 35)
  await expect(alice.locator('.inklayer-author-label')).toBeVisible()
  expect(failures).toEqual([])
})

test('loads the local URL fixture through Range and keeps cancel and reload recoverable', async ({
  page
}) => {
  const failures = collectBrowserFailures(page)
  const requests: { method: string; range: string | null; demo: string | null }[] = []
  const statuses: number[] = []
  const networkFailures: string[] = []
  page.on('request', async (request) => {
    if (!request.url().includes('/range-sample.pdf')) return
    requests.push({
      method: request.method(),
      range: await request.headerValue('range'),
      demo: await request.headerValue('x-inklayer-demo')
    })
  })
  page.on('response', (response) => {
    if (response.url().includes('/range-sample.pdf')) statuses.push(response.status())
  })
  page.on('requestfailed', (request) => {
    if (request.url().includes('/range-sample.pdf')) {
      networkFailures.push(`${request.method()}: ${request.failure()?.errorText ?? 'unknown'}`)
    }
  })

  await page.goto('/')
  const alice = page.locator('.instance-card').first()
  const progress = alice.locator('.load-progress')
  await expect(alice.locator('.instance-status')).toContainText('Ready · generated sample')

  await alice.getByRole('button', { name: 'URL Range PDF' }).click()
  await expect(progress).toHaveAttribute('data-phase', 'probing')
  await expect(progress).toHaveAttribute('data-range', 'true')
  await alice.getByRole('button', { name: 'Cancel load' }).click()
  await expect(alice.locator('.instance-status')).toHaveText(
    'URL load cancelled · press Reload to retry'
  )

  await alice.getByRole('button', { name: 'Reload' }).click()
  await expect(progress).toHaveAttribute('data-phase', 'downloading')
  await expect(alice.locator('.instance-status')).toContainText(
    'Ready · URL Range sample · page 1/3'
  )
  await expect(progress).toHaveAttribute('data-range', 'true')
  await expect.poll(async () => Number(await progress.getAttribute('data-total')))
    .toBeGreaterThanOrEqual(420_000)
  await expect.poll(async () => Number(await progress.getAttribute('data-loaded')))
    .toBeGreaterThan(0)

  const headCount = requests.filter(request => request.method === 'HEAD').length
  await alice.getByRole('button', { name: 'Reload' }).click()
  await expect(alice.locator('.instance-status')).toContainText(
    'Ready · URL Range sample · page 1/3'
  )
  await expect.poll(() => requests.filter(request => request.method === 'HEAD').length)
    .toBeGreaterThan(headCount)
  expect(requests.some(request => request.method === 'GET' && request.range !== null)).toBe(true)
  expect(requests.filter(request => request.method === 'GET').every(
    request => request.demo === 'url-range'
  )).toBe(true)
  expect(statuses).toContain(206)
  const intentionalHeadAbort = /^HEAD: (?:net::ERR_ABORTED|NS_BINDING_ABORTED|cancelled)$/
  expect(networkFailures.some(failure => intentionalHeadAbort.test(failure))).toBe(true)
  expect(networkFailures.filter(failure => !intentionalHeadAbort.test(failure))).toEqual([])
  expect(failures).toEqual([])
})

test('recovers URL, Range, password, render, and cancelled work from structured outcomes', async ({
  page
}) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  const alice = page.locator('.instance-card').first()
  const status = alice.locator('.instance-status')
  const progress = alice.locator('.load-progress')
  const outcome = alice.locator('.recovery-outcome')
  const retry = alice.getByRole('button', { name: 'Retry last failure' })
  await expect(status).toContainText('Ready · generated sample')

  await alice.getByRole('button', { name: 'Fail URL once' }).click()
  await expect(outcome.locator('.recovery-code')).toHaveText('PDF_LOAD_FAILED', {
    timeout: 30_000
  })
  await expect(outcome.locator('.recovery-operation')).toHaveText('load')
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect(outcome.locator('.recovery-code')).toHaveText('RECOVERED')
  await expect(status).toContainText('URL retry loaded the PDF')

  await alice.getByRole('button', { name: 'Fail Range once' }).click()
  await expect(outcome.locator('.recovery-code')).toHaveText('PDF_RANGE_FAILED')
  await expect(outcome.locator('.recovery-operation')).toHaveText('fetchPdfRange')
  await retry.click()
  await expect(status).toContainText('Range retry loaded the PDF')

  await alice.getByRole('button', { name: 'Fail render once' }).click()
  await expect(outcome.locator('.recovery-code')).toHaveText('PDF_FEATURE_FAILED')
  await expect(outcome.locator('.recovery-operation')).toHaveText('renderPageRaster')
  await expect(outcome.locator('.recovery-context')).toHaveText('page=1')
  await retry.click()
  await expect(status).toContainText('Page 1 raster retry completed')

  await alice.getByRole('button', { name: 'URL Range PDF' }).click()
  await expect(progress).toHaveAttribute('data-phase', 'probing')
  await alice.getByRole('button', { name: 'Cancel load' }).click()
  await expect(status).toHaveText('URL load cancelled · press Reload to retry')
  await expect(outcome.locator('.recovery-code')).toHaveText('PDF_LOAD_CANCELLED')
  await expect(outcome.locator('.recovery-operation')).toHaveText('load')
  await retry.click()
  await expect(status).toContainText('Cancelled load completed after retry')

  await alice.getByRole('button', { name: 'Password PDF' }).click()
  const dialog = alice.getByRole('dialog', { name: 'Open protected PDF' })
  await expect(dialog).toBeVisible()
  await dialog.locator('.password-input').fill('wrong-password')
  await dialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(outcome.locator('.recovery-code')).toHaveText('passwordRequired')
  await expect(outcome.locator('.recovery-operation')).toHaveText('submitPassword')
  await expect(outcome.locator('.recovery-context')).toHaveText('reason=incorrect · attempt=2')
  await dialog.locator('.password-input').fill('asdfasdf')
  await dialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(dialog).toBeHidden()
  await expect(status).toContainText('Ready · password sample · page 1/1')
  await expect(outcome.locator('.recovery-code')).toHaveText('RECOVERED')
  const expectedInjectedNetworkFailure = /(?:503 \(Service Unavailable\)|Loading failed|Warning: Indexing all PDF objects)/u
  expect(failures.filter(failure => !expectedInjectedNetworkFailure.test(failure))).toEqual([])
})

test('runs the complete Vanilla engine flow without console errors', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  await expect(page).toHaveTitle('InkLayer Core Vanilla Example')
  await expect(page.locator('.instance-status')).toHaveText(
    'Ready · generated sample · page 1/3 · 0 annotations'
  )
  const alice = page.locator('.instance-card').first()
  await expect(alice.locator('canvas.pdf-canvas')).toBeVisible()
  await expect(alice.locator('.scale-value')).toHaveText('100%')
  await alice.getByRole('button', { name: 'Zoom out' }).click()
  await expect(alice.locator('.scale-value')).toHaveText('90%')
  await alice.getByRole('button', { name: 'Zoom +' }).click()
  await expect(alice.locator('.scale-value')).toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-fit')
  await expect(alice.locator('.scale-value')).not.toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-actual')
  await expect(alice.locator('.scale-value')).toHaveText('100%')
  await alice.locator('.page-scroll').dispatchEvent('wheel', {
    ctrlKey: true, deltaY: -10, clientX: 250, clientY: 300
  })
  await expect(alice.locator('.scale-value')).not.toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-actual')
  await dispatchPinchZoom(alice.locator('.page-scroll'))
  await expect(alice.locator('.scale-value')).not.toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-actual')
  await expect(alice.getByRole('button', { name: 'Print', exact: true })).toBeVisible()
  await expect(alice.locator('.thumbnail-button')).toHaveCount(3)
  await expect(alice.locator('.outline-items button')).toHaveText([
    'Overview', 'Viewer Features', 'Text Selection'
  ])
  await alice.getByRole('button', { name: 'Find' }).click()
  await expect(alice.locator('.search-results button')).toHaveCount(2)
  await expect(alice.locator('mark[data-inklayer-search-match="active"]')).toHaveCount(1)
  await expect(alice.locator('.inklayer-search-highlight-active')).toHaveCSS(
    'background-color',
    'rgba(249, 115, 22, 0.6)'
  )

  await alice.getByRole('button', { name: 'Continuous' }).click()
  await expect(alice.locator('.inklayer-page-flow-page')).toHaveCount(3)
  await alice.locator('.scale-select').selectOption('page-width')
  await expect(alice.locator('.scale-value')).toHaveText(/%$/)
  await alice.locator('.scale-select').selectOption('page-actual')
  await expect(alice.locator('.scale-value')).toHaveText('100%')
  await alice.locator('.flow-scroll').dispatchEvent('wheel', {
    ctrlKey: true, deltaY: -10, clientX: 250, clientY: 300
  })
  await expect(alice.locator('.scale-value')).not.toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-actual')
  await dispatchPinchZoom(alice.locator('.flow-scroll'))
  await expect(alice.locator('.scale-value')).not.toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-actual')
  await expect(alice.locator('[data-inklayer-flow-page="0"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await alice.getByRole('button', { name: 'Text Selection', exact: true }).click()
  await expect(alice.locator('[data-inklayer-flow-page="2"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await expect(alice.locator('[data-inklayer-flow-page="1"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await alice.locator('.tool-select').selectOption('highlight')
  const crossPageSelection = await page.evaluate(() => {
    const first = document.querySelector<HTMLElement>(
      '.instance-card:first-of-type [data-inklayer-flow-page="1"] .inklayer-text-layer span'
    )
    const lastCandidates = document.querySelectorAll<HTMLElement>(
      '.instance-card:first-of-type [data-inklayer-flow-page="2"] .inklayer-text-layer span'
    )
    const last = lastCandidates.item(lastCandidates.length - 1)
    if (first?.firstChild === null || first?.firstChild === undefined
      || last?.firstChild === null || last?.firstChild === undefined) {
      throw new Error('Cross-page TextLayer endpoints are unavailable.')
    }
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.setBaseAndExtent(
      first.firstChild,
      0,
      last.firstChild,
      last.firstChild.textContent?.length ?? 0
    )
    last.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    const range = selection?.getRangeAt(0)
    return {
      collapsed: selection?.isCollapsed,
      rangeCount: selection?.rangeCount,
      anchorPage: selection?.anchorNode?.parentElement?.closest('[data-inklayer-flow-page]')
        ?.getAttribute('data-inklayer-flow-page'),
      focusPage: selection?.focusNode?.parentElement?.closest('[data-inklayer-flow-page]')
        ?.getAttribute('data-inklayer-flow-page'),
      fragments: range === undefined
        ? []
        : [...document.querySelectorAll<HTMLElement>('.instance-card:first-of-type .inklayer-text-layer')]
            .filter(layer => range.intersectsNode(layer))
            .map(layer => {
              const pageRange = range.cloneRange()
              if (!layer.contains(range.startContainer)) pageRange.setStart(layer, 0)
              if (!layer.contains(range.endContainer)) {
                pageRange.setEnd(layer, layer.childNodes.length)
              }
              return {
                page: layer.dataset['inklayerTextPage'],
                textLength: pageRange.toString().trim().length,
                rectCount: pageRange.getClientRects().length
              }
            })
    }
  })
  expect(crossPageSelection).toMatchObject({
    collapsed: false,
    rangeCount: 1,
    anchorPage: '1',
    focusPage: '2'
  })
  expect(crossPageSelection.fragments).toEqual([
    { page: '1', textLength: expect.any(Number), rectCount: expect.any(Number) },
    { page: '2', textLength: expect.any(Number), rectCount: expect.any(Number) }
  ])
  expect(crossPageSelection.fragments.every(fragment =>
    fragment.textLength > 0 && fragment.rectCount > 0
  )).toBe(true)
  const groupedHighlights = alice.locator('.inklayer-annotation-a11y-list button')
  await expect(groupedHighlights).toHaveCount(2)
  await expect(groupedHighlights.first()).toHaveAttribute('aria-label', /highlight/i)
  await expect(groupedHighlights.last()).toHaveAttribute('aria-label', /highlight/i)
  await expect(alice.locator('.tool-select')).toHaveValue('highlight')
  await alice.getByRole('button', { name: 'Single' }).click()
  await expect(alice.locator('.flow-scroll')).toBeHidden()
  await expect(alice.locator('.instance-status')).toContainText('2 annotations')

  await alice.getByRole('button', { name: 'Prepare print' }).click()
  await expect(alice.locator('.instance-status')).toContainText('Prepared raster print')

  await alice.getByRole('button', { name: 'Text Selection', exact: true }).click()
  await expect(alice.locator('.instance-status')).toContainText('page 3/3')
  await alice.locator('.tool-select').selectOption('text-select')
  const selectionLine = alice.locator('.inklayer-text-layer span').last()
  await selectionLine.scrollIntoViewIfNeeded()
  const selectionBox = await selectionLine.boundingBox()
  if (selectionBox === null) throw new Error('PDF TextLayer selection line is not visible.')
  const selectionHit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return element?.closest('.inklayer-text-layer')?.className ?? element?.className ?? null
  }, { x: selectionBox.x + 3, y: selectionBox.y + selectionBox.height / 2 })
  expect(String(selectionHit)).toContain('inklayer-text-layer')
  await page.mouse.move(selectionBox.x + 3, selectionBox.y + selectionBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    selectionBox.x + selectionBox.width - 3,
    selectionBox.y + selectionBox.height / 2,
    { steps: 8 }
  )
  await page.mouse.up()
  const textMenu = alice.getByRole('toolbar', { name: 'Text annotation actions' })
  await expect(textMenu).toBeVisible()
  await textMenu.getByRole('button', { name: 'Highlight' }).click()
  await expect(alice.locator('.instance-status')).toHaveText('Created highlight from selected PDF text')
  await expect(alice.locator('.tool-select')).toHaveValue('text-select')
  await alice.locator('.outline-items').getByRole('button', { name: 'Overview', exact: true }).click()
  await expect(alice.locator('.instance-status')).toContainText('page 1/3')

  await alice.locator('.tool-select').selectOption('rectangle')
  await expect(alice.locator('.konvajs-content')).toHaveCSS('cursor', 'crosshair')
  await alice.locator('.page-surface').scrollIntoViewIfNeeded()
  const canvas = await alice.locator('.konvajs-content').boundingBox()
  if (canvas === null) throw new Error('Demo annotation canvas is not visible.')
  await page.mouse.move(canvas.x + 60, canvas.y + 90)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 170, canvas.y + 180, { steps: 5 })
  await page.mouse.up()
  await expect(alice.locator('.inklayer-author-label')).toHaveCount(1)
  await expect(alice.locator('.inklayer-author-label')).toBeVisible()
  await expect(alice.locator('.tool-select')).toHaveValue('select')
  await page.mouse.click(canvas.x + 350, canvas.y + 400)
  await expect(alice.locator('.inklayer-author-label')).toBeHidden()
  await page.mouse.move(canvas.x + 60, canvas.y + 130)
  await expect(alice.locator('.inklayer-author-label')).toBeVisible()
  await alice.locator('.tag-visibility').selectOption('hidden')
  await expect(alice.locator('.inklayer-author-label')).toBeHidden()
  await alice.locator('.tag-visibility').selectOption('always')
  await expect(alice.locator('.inklayer-author-label')).toBeVisible()
  await alice.locator('.tag-visibility').selectOption('auto')
  await alice.locator('.tool-select').selectOption('select')
  await page.mouse.click(canvas.x + 60, canvas.y + 130)
  await expect(alice.locator('.inklayer-author-label')).toBeVisible()
  const labelBeforeDrag = await alice.locator('.inklayer-author-label').boundingBox()
  await page.mouse.move(canvas.x + 60, canvas.y + 130)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 95, canvas.y + 155, { steps: 6 })
  await page.mouse.up()
  const labelAfterDrag = await alice.locator('.inklayer-author-label').boundingBox()
  if (labelBeforeDrag === null || labelAfterDrag === null) {
    throw new Error('Rectangle author label is not visible during drag verification.')
  }
  expect(labelAfterDrag.x - labelBeforeDrag.x).toBeGreaterThan(25)
  expect(labelAfterDrag.y - labelBeforeDrag.y).toBeGreaterThan(15)
  await page.mouse.click(canvas.x + 95, canvas.y + 155)
  await alice.getByRole('button', { name: 'Add comment' }).click()
  await expect(alice.locator('.instance-status')).toHaveText('Comment added to rectangle')

  await alice.locator('.tool-select').selectOption('freehand')
  await alice.locator('.page-surface').scrollIntoViewIfNeeded()
  const freehandCanvas = await alice.locator('.konvajs-content').boundingBox()
  if (freehandCanvas === null) throw new Error('Freehand annotation canvas is not visible.')
  await drawStroke(page, freehandCanvas, [[70, 100], [150, 180]])
  await page.waitForTimeout(300)
  await drawStroke(page, freehandCanvas, [[150, 100], [70, 180]])
  await expect(alice.locator('.inklayer-author-label')).toHaveCount(1)
  await expect(alice.locator('.inklayer-author-label')).toHaveCount(2, { timeout: 1600 })

  for (const tool of TOOLS) await addToolFixture(alice, tool)
  await expect(alice.locator('.inklayer-author-label')).toHaveCount(TOOLS.length + 2)

  await expect(alice.locator('.inklayer-author-label').first()).toHaveCSS('background-color', 'rgb(23, 92, 211)')

  await alice.getByRole('button', { name: 'Zoom +' }).click()
  await expect(alice.locator('.instance-status')).toHaveText(
    `Ready · generated sample · page 1/3 · ${TOOLS.length + 5} annotations`
  )
  await expect(alice.locator('.pdf-canvas')).toHaveAttribute('width', '463')

  await alice.getByRole('button', { name: 'Export PDF' }).click()
  await expect(alice.locator('.instance-status')).toContainText('Exported PDF · ')
  await alice.getByRole('button', { name: 'Export Excel' }).click()
  await expect(alice.locator('.instance-status')).toContainText('Exported workbook · ')

  const firstInstance = await alice.getAttribute('data-inklayer-instance')
  await page.getByRole('button', { name: 'Destroy / remount' }).click()
  await expect(page.locator('.instance-status')).toHaveText(
    'Ready · generated sample · page 1/3 · 0 annotations'
  )
  await expect(page.locator('.instance-card').first()).not.toHaveAttribute(
    'data-inklayer-instance', firstInstance ?? ''
  )
  expect(failures).toEqual([])
})

test('keeps the single-workspace demo readable at the mobile breakpoint', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.instance-status')).toHaveText(
    'Ready · generated sample · page 1/3 · 0 annotations'
  )
  await expect(page.locator('.instance-grid')).toHaveCSS('grid-template-columns', '358px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(failures).toEqual([])
})

/** Verifies the CSS layout size shared by Canvas, TextLayer, and Annotation overlay. */
async function expectPageSize(card: Locator, width: number, height: number): Promise<void> {
  const sizes = await card.locator('.pdf-canvas, .inklayer-text-layer, .annotation-host')
    .evaluateAll((elements) => elements.map((element) => ({
      width: (element as HTMLElement).getBoundingClientRect().width,
      height: (element as HTMLElement).getBoundingClientRect().height
    })))
  expect(sizes).toHaveLength(3)
  for (const size of sizes) {
    expect(size.width).toBeCloseTo(width, 1)
    expect(size.height).toBeCloseTo(height, 1)
  }
}

/** Reads the browser-owned thumbnail URL lifecycle counters installed by the stress test. */
async function readObjectUrlMetrics(page: Page): Promise<{
  active: number
  created: number
  revoked: number
}> {
  return await page.evaluate(() => {
    const metrics = (window as typeof window & {
      __inklayerObjectUrlMetrics?: {
        active: Set<string>
        created: number
        revoked: number
      }
    }).__inklayerObjectUrlMetrics
    if (metrics === undefined) throw new Error('Object URL metrics are unavailable.')
    return { active: metrics.active.size, created: metrics.created, revoked: metrics.revoked }
  })
}

/** Adds one real tool fixture and completes the FreeText browser input path. */
async function addToolFixture(
  card: Locator,
  tool: typeof TOOLS[number]
): Promise<void> {
  await card.locator('.tool-select').selectOption(tool)
  await card.getByRole('button', { name: 'Add sample' }).click()
  if (tool === 'free-text') {
    const input = card.locator('.inklayer-text-input')
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('aria-label', 'Annotation text')
    await input.fill('Browser FreeText')
    await input.press('Control+Enter')
  }
  await expect(card.locator('.instance-status')).toContainText(`Created ${tool}`)
}

/** Draws one pointer stroke relative to the annotation canvas. */
async function drawStroke(
  page: Page,
  canvas: { x: number; y: number },
  points: readonly (readonly [number, number])[]
): Promise<void> {
  const first = points[0]
  if (first === undefined) return
  await page.mouse.move(canvas.x + first[0], canvas.y + first[1])
  await page.mouse.down()
  for (const point of points.slice(1)) {
    await page.mouse.move(canvas.x + point[0], canvas.y + point[1], { steps: 6 })
  }
  await page.mouse.up()
}

/** Dispatches a browser-level opposing two-touch gesture on one zoom surface. */
async function dispatchPinchZoom(container: Locator): Promise<void> {
  await container.evaluate((element) => {
    const touchList = (points: readonly { identifier: number; x: number; y: number }[]): TouchList => {
      const list = points.map(point => ({
        identifier: point.identifier,
        clientX: point.x,
        clientY: point.y,
        pageX: point.x,
        pageY: point.y
      }))
      Object.defineProperty(list, 'item', {
        value: (index: number) => list[index] ?? null
      })
      return list as unknown as TouchList
    }
    const dispatch = (
      type: 'touchstart' | 'touchmove' | 'touchend',
      points: readonly { identifier: number; x: number; y: number }[]
    ): void => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'touches', { value: touchList(points) })
      element.dispatchEvent(event)
    }
    dispatch('touchstart', [
      { identifier: 1, x: 120, y: 180 },
      { identifier: 2, x: 220, y: 180 }
    ])
    dispatch('touchmove', [
      { identifier: 1, x: 100, y: 180 },
      { identifier: 2, x: 240, y: 180 }
    ])
    dispatch('touchend', [])
  })
}

/** Collects relevant browser console and uncaught page failures. */
function collectBrowserFailures(page: Page): string[] {
  const failures: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error' || message.type() === 'warning') failures.push(message.text())
  })
  page.on('pageerror', (error) => failures.push(error.message))
  return failures
}

/** Builds a Square through the same native export contract consumed by React. */
async function createNativeAnnotationPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.addPage([200, 300])
  const bounds = { x: 10, y: 20, width: 40, height: 30 }
  const appearance = resolveAnnotationAppearance('rectangle', {
    stroke: { color: '#ff0000', width: 2 }
  })
  const annotation = createTestAnnotation({
    id: 'react-native-square',
    type: 'rectangle',
    bounds,
    appearance,
    content: { text: 'Imported rectangle' },
    rendererState: buildToolRendererState({
      id: 'react-native-square', type: 'rectangle', bounds, appearance,
      content: { text: 'Imported rectangle' }
    })
  })
  return buildAnnotatedPdf(await document.save(), [annotation])
}
