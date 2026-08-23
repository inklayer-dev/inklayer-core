/**
 * @file Extensible Core V1 public API freeze gate.
 * @description Hashes exported declaration signatures for every typed package
 * entry and rejects unreviewed name, signature, entry, or ownership escapes.
 */

import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'

const projectRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const manifestPath = resolve(projectRoot, 'api/public-api-v1.json')

/** Creates one stable hash for a serializable API signature value. */
function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Returns the declaration file configured for one package export entry. */
function declarationTarget(entry, value) {
  if (typeof value?.types !== 'string') {
    throw new Error(`Package entry ${entry} has no declaration target.`)
  }
  return resolve(projectRoot, value.types.replace(/^\.\//u, ''))
}

/** Collects every emitted declaration so nested re-exports cannot hide a leak. */
async function collectDeclarations(directory) {
  const declarations = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) declarations.push(...await collectDeclarations(path))
    else if (entry.name.endsWith('.d.ts')) declarations.push(await readFile(path, 'utf8'))
  }
  return declarations
}

const typedEntries = Object.entries(packageJson.exports)
  .filter(([entry]) => entry !== './style')
  .map(([entry, value]) => [entry, declarationTarget(entry, value)])
const program = ts.createProgram(typedEntries.map(([, path]) => path), {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true
})
const checker = program.getTypeChecker()
const entries = {}
const entrySignatures = {}

for (const [entry, path] of typedEntries) {
  const source = program.getSourceFile(path)
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)
  if (source === undefined || moduleSymbol === undefined) {
    throw new Error(`Declaration module for ${entry} could not be resolved.`)
  }
  const signatures = checker.getExportsOfModule(moduleSymbol)
    .map((symbol) => {
      const target = (symbol.flags & ts.SymbolFlags.Alias) === 0
        ? symbol
        : checker.getAliasedSymbol(symbol)
      const declarations = (target.declarations ?? symbol.declarations ?? [])
        .map(declaration => declaration.getText())
        .sort()
      return { name: symbol.name, declarations }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
  entries[entry] = {
    exportCount: signatures.length,
    signatureHash: hash(signatures)
  }
  entrySignatures[entry] = signatures
}

const current = {
  schemaVersion: 1,
  packageVersion: packageJson.version,
  packageEntries: Object.keys(packageJson.exports),
  entries
}

if (process.argv.includes('--print')) {
  process.stdout.write(`${JSON.stringify(current, null, 2)}\n`)
  process.exit(0)
}

const signatureEntryArgument = process.argv.find(argument => argument.startsWith('--print-signatures='))
if (signatureEntryArgument !== undefined) {
  const entry = signatureEntryArgument.slice('--print-signatures='.length)
  if (entrySignatures[entry] === undefined) throw new Error(`Unknown package entry: ${entry}`)
  process.stdout.write(`${JSON.stringify(entrySignatures[entry], null, 2)}\n`)
  process.exit(0)
}

const frozen = JSON.parse(await readFile(manifestPath, 'utf8'))
if (JSON.stringify(current) !== JSON.stringify(frozen)) {
  const differences = []
  if (current.schemaVersion !== frozen.schemaVersion) {
    differences.push(`schemaVersion: expected ${frozen.schemaVersion}, received ${current.schemaVersion}`)
  }
  if (current.packageVersion !== frozen.packageVersion) {
    differences.push(`packageVersion: expected ${frozen.packageVersion}, received ${current.packageVersion}`)
  }
  if (JSON.stringify(current.packageEntries) !== JSON.stringify(frozen.packageEntries)) {
    differences.push('packageEntries changed')
  }
  for (const entry of new Set([...Object.keys(frozen.entries ?? {}), ...Object.keys(current.entries)])) {
    const expected = frozen.entries?.[entry]
    const received = current.entries[entry]
    if (expected?.exportCount !== received?.exportCount) {
      differences.push(
        `${entry} exportCount: expected ${expected?.exportCount ?? 'missing'}, `
        + `received ${received?.exportCount ?? 'missing'}`
      )
    }
    if (expected?.signatureHash !== received?.signatureHash) {
      differences.push(
        `${entry} signatureHash: expected ${expected?.signatureHash ?? 'missing'}, `
        + `received ${received?.signatureHash ?? 'missing'}`
      )
    }
  }
  throw new Error(
    'Public API differs from api/public-api-v1.json. Review the change and update the V1 manifest explicitly.\n'
    + differences.map(difference => `- ${difference}`).join('\n')
  )
}

const publicDeclarations = await collectDeclarations(resolve(projectRoot, 'dist'))
const publicText = publicDeclarations.join('\n')
for (const forbidden of ['getViewer(', 'getEventBus(', "from 'konva'", "from 'react'", "from 'vue'"]) {
  if (publicText.includes(forbidden)) throw new Error(`Forbidden public API escape detected: ${forbidden}`)
}

process.stdout.write(
  `Public API freeze passed for ${typedEntries.length} typed entries and `
  + `${Object.values(entries).reduce((sum, entry) => sum + entry.exportCount, 0)} entry exports.\n`
)
