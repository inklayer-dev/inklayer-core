/**
 * @file Package version metadata synchronizer.
 * @description Treats package.json as the release version source and updates
 * source and API snapshot metadata during the npm version lifecycle.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const packagePath = resolve(projectRoot, 'package.json')
const schemaPath = resolve(projectRoot, 'src/domain/schema.ts')
const apiSnapshotPath = resolve(projectRoot, 'api/public-api-v1.json')

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
const version = packageJson.version
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('package.json must contain a valid release version.')
}

const schema = await readFile(schemaPath, 'utf8')
const versionDeclaration = /export const CORE_VERSION = '[^']+' as const/
if (!versionDeclaration.test(schema)) {
  throw new Error('Could not find the CORE_VERSION declaration in src/domain/schema.ts.')
}
const synchronizedSchema = schema.replace(
  versionDeclaration,
  `export const CORE_VERSION = '${version}' as const`
)
if (synchronizedSchema !== schema) await writeFile(schemaPath, synchronizedSchema)

const apiSnapshotText = await readFile(apiSnapshotPath, 'utf8')
const apiSnapshot = JSON.parse(apiSnapshotText)
apiSnapshot.packageVersion = version
const synchronizedApiSnapshot = `${JSON.stringify(apiSnapshot, null, 2)}\n`
if (synchronizedApiSnapshot !== apiSnapshotText) {
  await writeFile(apiSnapshotPath, synchronizedApiSnapshot)
}

process.stdout.write(`Synchronized release metadata to ${version}.\n`)
