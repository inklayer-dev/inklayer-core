/**
 * @file Framework-free browser acceptance tests.
 * @description Exercises real PDF.js, Konva, every annotation tool, comments,
 * cursor CSS, FreeText, exports, two instances, zoom, and remount cleanup.
 */

import { expect, test, type ConsoleMessage, type Locator, type Page } from '@playwright/test'

const TOOLS = [
  'highlight', 'strikeout', 'underline', 'free-text', 'rectangle', 'circle',
  'freehand', 'free-highlight', 'signature', 'stamp', 'note', 'line', 'arrow',
  'polygon', 'polyline', 'cloud'
] as const

test('runs the complete Vanilla engine flow without console errors', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.goto('/')
  await expect(page).toHaveTitle('InkLayer Core Vanilla Example')
  await expect(page.locator('.instance-status')).toHaveText([
    'Ready · generated sample · page 1/3 · 0 annotations',
    'Ready · generated sample · page 1/3 · 0 annotations'
  ])
  const alice = page.locator('.instance-card').first()
  const bob = page.locator('.instance-card').nth(1)
  await expect(alice.locator('canvas.pdf-canvas')).toBeVisible()
  await expect(bob.locator('canvas.pdf-canvas')).toBeVisible()
  await expect(alice.locator('.scale-value')).toHaveText('100%')
  await alice.getByRole('button', { name: 'Zoom out' }).click()
  await expect(alice.locator('.scale-value')).toHaveText('90%')
  await alice.getByRole('button', { name: 'Zoom +' }).click()
  await expect(alice.locator('.scale-value')).toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-fit')
  await expect(alice.locator('.scale-value')).not.toHaveText('100%')
  await alice.locator('.scale-select').selectOption('page-actual')
  await expect(alice.locator('.scale-value')).toHaveText('100%')
  await expect(alice.getByRole('button', { name: 'Print', exact: true })).toBeVisible()
  await bob.getByRole('button', { name: 'Password PDF' }).click()
  const passwordDialog = bob.getByRole('dialog', { name: 'Open protected PDF' })
  await expect(passwordDialog).toBeVisible()
  await expect(passwordDialog.locator('.password-message')).toContainText('requires a password')
  await passwordDialog.locator('.password-input').fill('wrong-password')
  await passwordDialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(passwordDialog).toBeVisible()
  await expect(passwordDialog.locator('.password-message')).toContainText('Incorrect password')
  await passwordDialog.locator('.password-input').fill('asdfasdf')
  await passwordDialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(passwordDialog).toBeHidden()
  await expect(bob.locator('.instance-status')).toContainText('Ready · password sample · page 1/1')
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
  await expect(alice.locator('[data-inklayer-flow-page="0"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await alice.getByRole('button', { name: 'Text Selection' }).click()
  await expect(alice.locator('[data-inklayer-flow-page="2"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await expect(alice.locator('[data-inklayer-flow-page="1"]')).toHaveAttribute(
    'data-inklayer-flow-mounted', 'true'
  )
  await alice.locator('.tool-select').selectOption('highlight')
  await page.evaluate(() => {
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
    const range = document.createRange()
    range.setStart(first.firstChild, 0)
    range.setEnd(last.firstChild, last.firstChild.textContent?.length ?? 0)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    last.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await expect(alice.locator('.instance-status')).toHaveText(
    'Created grouped highlight from cross-page PDF text'
  )
  await expect(alice.locator('.tool-select')).toHaveValue('text-select')
  await alice.getByRole('button', { name: 'Single' }).click()
  await expect(alice.locator('.flow-scroll')).toBeHidden()
  await expect(alice.locator('.instance-status')).toContainText('page 3/3')

  await alice.getByRole('button', { name: 'Prepare print' }).click()
  await expect(alice.locator('.instance-status')).toContainText('Prepared raster print')

  await alice.getByRole('button', { name: 'Text Selection' }).click()
  await expect(alice.locator('.instance-status')).toContainText('page 3/3')
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
  if (canvas === null) throw new Error('Alice annotation canvas is not visible.')
  await page.mouse.move(canvas.x + 60, canvas.y + 90)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 170, canvas.y + 180, { steps: 5 })
  await page.mouse.up()
  await expect(alice.locator('.inklayer-author-label')).toHaveCount(1)
  await alice.locator('.tool-select').selectOption('select')
  const labelBeforeDrag = await alice.locator('.inklayer-author-label').boundingBox()
  await page.mouse.move(canvas.x + 110, canvas.y + 130)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 145, canvas.y + 155, { steps: 6 })
  await page.mouse.up()
  const labelAfterDrag = await alice.locator('.inklayer-author-label').boundingBox()
  if (labelBeforeDrag === null || labelAfterDrag === null) {
    throw new Error('Rectangle author label is not visible during drag verification.')
  }
  expect(labelAfterDrag.x - labelBeforeDrag.x).toBeGreaterThan(25)
  expect(labelAfterDrag.y - labelBeforeDrag.y).toBeGreaterThan(15)
  await page.mouse.click(canvas.x + 145, canvas.y + 155)
  await alice.getByRole('button', { name: 'Add comment' }).click()
  await expect(alice.locator('.instance-status')).toHaveText('Comment added to rectangle')
  await expect(bob.locator('.inklayer-author-label')).toHaveCount(0)

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

  await bob.locator('.tool-select').selectOption('rectangle')
  await bob.getByRole('button', { name: 'Add sample' }).click()
  await expect(bob.locator('.inklayer-author-label')).toHaveCount(1)
  await expect(alice.locator('.inklayer-author-label').first()).toHaveCSS('background-color', 'rgb(23, 92, 211)')
  await expect(bob.locator('.inklayer-author-label').first()).toHaveCSS('background-color', 'rgb(181, 71, 8)')

  await alice.getByRole('button', { name: 'Zoom +' }).click()
  await expect(alice.locator('.instance-status')).toHaveText(
    `Ready · generated sample · page 1/3 · ${TOOLS.length + 5} annotations`
  )
  await expect(alice.locator('.pdf-canvas')).toHaveAttribute('width', '463')
  await expect(bob.locator('.instance-status')).toHaveText('Created rectangle · 1 total')

  await alice.getByRole('button', { name: 'Export PDF' }).click()
  await expect(alice.locator('.instance-status')).toContainText('Exported PDF · ')
  await alice.getByRole('button', { name: 'Export Excel' }).click()
  await expect(alice.locator('.instance-status')).toContainText('Exported workbook · ')

  const firstInstance = await alice.getAttribute('data-inklayer-instance')
  await page.getByRole('button', { name: 'Destroy / remount' }).click()
  await expect(page.locator('.instance-status')).toHaveText([
    'Ready · generated sample · page 1/3 · 0 annotations',
    'Ready · generated sample · page 1/3 · 0 annotations'
  ])
  await expect(page.locator('.instance-card').first()).not.toHaveAttribute(
    'data-inklayer-instance', firstInstance ?? ''
  )
  expect(failures).toEqual([])
})

test('keeps the two-instance demo readable at the mobile breakpoint', async ({ page }) => {
  const failures = collectBrowserFailures(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.instance-status')).toHaveText([
    'Ready · generated sample · page 1/3 · 0 annotations',
    'Ready · generated sample · page 1/3 · 0 annotations'
  ])
  await expect(page.locator('.instance-grid')).toHaveCSS('grid-template-columns', '358px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  expect(failures).toEqual([])
})

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

/** Collects relevant browser console and uncaught page failures. */
function collectBrowserFailures(page: Page): string[] {
  const failures: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error' || message.type() === 'warning') failures.push(message.text())
  })
  page.on('pageerror', (error) => failures.push(error.message))
  return failures
}
