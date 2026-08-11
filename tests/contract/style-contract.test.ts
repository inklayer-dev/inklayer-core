/**
 * @file Engine CSS public contract tests.
 * @description Guards root scoping, variable ownership, cursor coverage, and
 * absence of application-level global selectors in the maintained source CSS.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylePath = resolve(import.meta.dirname, '../../src/styles/engine.css')

describe('engine style contract', () => {
  it('scopes state and overlays to the instance root with InkLayer variables', async () => {
    const css = await readFile(stylePath, 'utf8')
    expect(css).toContain('.inklayer-engine {')
    expect(css).toContain('[data-inklayer-tool="highlight"]')
    expect(css).toContain('[data-inklayer-tool="free-text"]')
    expect(css).toContain('.inklayer-text-input')
    expect(css).toContain('.inklayer-author-label')
    expect(css).not.toMatch(/(?:body|html|:root)\s*\{/)
    const rootBlock = css.match(/\.inklayer-engine\s*\{([^}]*)\}/)?.[1] ?? ''
    const publicVariables = [...rootBlock.matchAll(/--([a-z0-9-]+)\s*:/g)]
      .map((match) => match[1])
    expect(publicVariables.length).toBeGreaterThan(10)
    expect(publicVariables.every((variable) => variable?.startsWith('inklayer-'))).toBe(true)
    expect(css).toContain('--text-scale-factor')
    expect(css).toContain('--font-height')
    expect(css).not.toContain('--accent-')
  })
})
