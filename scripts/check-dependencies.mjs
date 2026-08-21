/**
 * @file Source dependency direction and cycle quality gate.
 * @description Resolves local TypeScript imports, rejects cycles and forbidden
 * layer edges, and ensures framework packages never enter Core dependencies.
 */

import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'

const projectRoot = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(projectRoot, 'src')

/** Recursively lists maintained TypeScript implementation files. */
async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listTypeScriptFiles(path))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(path)
  }
  return files
}

/** Returns local module specifiers parsed by the TypeScript compiler. */
async function localSpecifiers(file) {
  const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const specifiers = []
  source.forEachChild((node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.startsWith('.')
      && !node.moduleSpecifier.text.endsWith('.css')) {
      specifiers.push(node.moduleSpecifier.text)
    }
  })
  return specifiers
}

/** Resolves one source-relative TypeScript module using repository conventions. */
async function resolveLocalModule(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, resolve(base, 'index.ts')]) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue to the directory-index convention.
    }
  }
  throw new Error(`Unresolved local import ${specifier} from ${relative(projectRoot, fromFile)}.`)
}

/** Maps a source file to its architectural layer. */
function layerOf(file) {
  const path = relative(sourceRoot, file)
  if (!path.includes('/')) return 'root'
  return path.split('/')[0]
}

/** Returns the allowed destination layers for one source layer. */
function allowedLayers(layer) {
  const rules = {
    domain: ['domain'],
    geometry: ['domain', 'geometry'],
    repository: ['domain', 'repository'],
    compat: ['domain', 'compat'],
    renderer: ['domain', 'geometry', 'annotation-types', 'renderer'],
    viewer: ['domain', 'ports', 'platform', 'viewer'],
    annotation: ['domain', 'geometry', 'repository', 'renderer', 'viewer', 'ports', 'platform', 'annotation-types', 'annotation'],
    import: ['domain', 'geometry', 'renderer', 'import'],
    export: ['domain', 'geometry', 'renderer', 'annotation-types', 'export'],
    platform: ['ports', 'platform'],
    ports: ['domain', 'ports'],
    lifecycle: ['domain', 'lifecycle'],
    capabilities: ['root', 'domain', 'lifecycle', 'viewer', 'annotation', 'annotation-types', 'ports', 'platform', 'repository', 'renderer', 'geometry', 'capabilities'],
    'annotation-types': ['domain', 'annotation-types'],
    styles: ['styles']
  }
  return rules[layer] ?? ['root', 'domain', 'geometry', 'repository', 'renderer', 'viewer', 'annotation', 'annotation-types', 'import', 'export', 'platform', 'ports', 'compat', 'lifecycle', 'capabilities', 'styles']
}

/** Detects the first directed graph cycle, if one exists. */
function findCycle(graph) {
  const visited = new Set()
  const active = new Set()
  const path = []

  /** Visits one dependency node depth-first. */
  function visit(node) {
    if (active.has(node)) return [...path.slice(path.indexOf(node)), node]
    if (visited.has(node)) return undefined
    visited.add(node)
    active.add(node)
    path.push(node)
    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency)
      if (cycle !== undefined) return cycle
    }
    path.pop()
    active.delete(node)
    return undefined
  }

  for (const node of graph.keys()) {
    const cycle = visit(node)
    if (cycle !== undefined) return cycle
  }
  return undefined
}

const files = await listTypeScriptFiles(sourceRoot)
const graph = new Map()
const violations = []
for (const file of files) {
  const dependencies = await Promise.all((await localSpecifiers(file)).map(
    async (specifier) => resolveLocalModule(file, specifier)
  ))
  graph.set(file, dependencies)
  const sourceLayer = layerOf(file)
  for (const dependency of dependencies) {
    const targetLayer = layerOf(dependency)
    if (!allowedLayers(sourceLayer).includes(targetLayer)) {
      violations.push(`${relative(sourceRoot, file)} (${sourceLayer}) -> ${relative(sourceRoot, dependency)} (${targetLayer})`)
    }
  }
}

const cycle = findCycle(graph)
if (cycle !== undefined) {
  throw new Error(`Source dependency cycle: ${cycle.map((file) => relative(sourceRoot, file)).join(' -> ')}`)
}
if (violations.length > 0) throw new Error(`Forbidden source dependency edges:\n${violations.join('\n')}`)

const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const forbiddenPackages = ['react', 'react-dom', 'vue', 'pinia', 'zustand', '@radix-ui/react', 'reka-ui']
const installedNames = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {})
])
const forbiddenInstalled = forbiddenPackages.filter((name) => installedNames.has(name))
if (forbiddenInstalled.length > 0) throw new Error(`Forbidden framework dependencies: ${forbiddenInstalled.join(', ')}`)

process.stdout.write(`Dependency checks passed for ${files.length} source files with no cycles or forbidden edges.\n`)
