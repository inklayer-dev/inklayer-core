/**
 * @file Temporary text-highlight layer browser contract tests.
 * @description Verifies semantic DOM projection, overlap order, atomic state,
 * selective clearing, visibility, and TextLayer remount restoration without
 * relying on screenshots or visual assertions.
 */

import { expect, test } from '@playwright/test'

test('projects and restores ordered temporary text-highlight layers', async ({ page }) => {
  await page.goto('/?clean=1')
  const proof = await page.evaluate(async () => {
    const modulePath = '/src/text-highlight-layer-probe.ts'
    const probe = await import(modulePath)
    return await probe.runTextHighlightLayerProbe()
  })

  expect(proof.initial).toEqual([
    {
      layer: 'bottom', range: '0', state: 'match', text: 'alpha',
      color: '#ef4444', activeColor: '#ef4444', parentLayer: undefined
    },
    {
      layer: 'top', range: '0', state: 'active', text: 'alpha',
      color: '#f59e0b', activeColor: '#d97706', parentLayer: 'bottom'
    }
  ])
  expect(proof.invalidOperation).toBe('setTextHighlightLayers')
  expect(proof.searchText).toBe('beta')
  expect(proof.afterInvalid).toEqual(proof.initial)
  expect(proof.detachedChildCount).toBe(0)
  expect(proof.restored).toEqual(proof.initial)
  expect(proof.selectivelyCleared).toEqual([proof.initial[0]])
  expect(proof.hiddenCount).toBe(0)
  expect(proof.clearedCount).toBe(0)
  expect(proof.searchAfterLayerClear).toBe('beta')
  expect(proof.afterLineBreakText).toBe('Search')
})
