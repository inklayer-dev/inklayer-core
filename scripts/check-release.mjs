/**
 * @file npm release preflight.
 * @description Rejects a GitHub Release whose tag or package metadata cannot
 * safely publish the intended public package.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const releaseTag = process.argv.slice(2).find(argument => !argument.startsWith('-'))
const expectedTag = `v${packageJson.version}`

/** Fails one release invariant with an actionable message. */
function assertRelease(condition, message) {
  if (!condition) throw new Error(message)
}

assertRelease(releaseTag !== undefined, `Pass the release tag, for example: npm run check:release -- ${expectedTag}`)
assertRelease(releaseTag === expectedTag, `Release tag ${releaseTag} must match package version ${expectedTag}.`)
assertRelease(packageJson.name === '@inklayer-dev/core', 'The npm package name must be @inklayer-dev/core.')
assertRelease(packageJson.private !== true, 'The npm package must not be private.')
assertRelease(
  packageJson.repository?.url === 'git+https://github.com/inklayer-dev/inklayer-core.git',
  'repository.url must exactly identify the trusted GitHub repository.'
)
assertRelease(packageJson.publishConfig?.access === 'public', 'publishConfig.access must be public.')
assertRelease(
  packageJson.publishConfig?.registry === 'https://registry.npmjs.org/',
  'publishConfig.registry must use the public npm registry.'
)

process.stdout.write(`Release preflight passed for ${packageJson.name}@${packageJson.version} (${releaseTag}).\n`)
