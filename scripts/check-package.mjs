/**
 * @file Built package quality gate.
 * @description Verifies current exports, declarations, metadata, packed files,
 * import safety, and absence of test or local workspace paths in distribution.
 * @remarks The checker validates only entries that are genuinely implemented;
 * later phases expand package exports and therefore this same check surface.
 */

import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)

/**
 * Asserts a package quality condition with a stable failure message.
 * @param condition Condition that must be truthy.
 * @param message Failure message shown to maintainers.
 * @throws Error when the condition is false.
 */
function assertPackage(condition, message) {
  if (!condition) throw new Error(message)
}

/**
 * Returns every string export target from a conditional exports object.
 * @param value Package exports value to traverse.
 * @returns Relative target paths found below the value.
 */
function collectExportTargets(value) {
  if (typeof value === 'string') return [value]
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap(collectExportTargets)
}

/**
 * Verifies one project-relative path exists.
 * @param relativePath Project-relative file path.
 * @returns Promise resolved when the target is accessible.
 */
async function assertExists(relativePath) {
  await access(resolve(projectRoot, relativePath))
}

/**
 * Recursively returns files below one directory.
 * @param directory Absolute directory to traverse.
 * @returns Absolute file paths below the directory.
 */
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(entryPath))
    else files.push(entryPath)
  }
  return files
}

const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
assertPackage(packageJson.name === '@inklayer-dev/core', 'Package name must be @inklayer-dev/core.')
assertPackage(
  typeof packageJson.version === 'string'
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(packageJson.version),
  'Package version must be a valid release version.'
)
assertPackage(
  packageJson.repository?.url === 'git+https://github.com/inklayer-dev/inklayer-core.git',
  'Package repository metadata is incorrect.'
)
assertPackage(packageJson.publishConfig?.access === 'public', 'Package must publish publicly.')
assertPackage(
  packageJson.publishConfig?.registry === 'https://registry.npmjs.org/',
  'Package registry must be the public npm registry.'
)
await Promise.all(['README.md', 'LICENSE'].map(assertExists))

const exportTargets = collectExportTargets(packageJson.exports)
assertPackage(exportTargets.length > 0, 'The package must expose at least one real entry.')
await Promise.all(exportTargets.map((target) => assertExists(target.replace(/^\.\//, ''))))
assertPackage(exportTargets.some((target) => target.endsWith('.d.ts')), 'Root declaration export is missing.')
assertPackage(
  packageJson.exports?.['./style']?.types === './dist/style.d.ts'
    && packageJson.exports?.['./style']?.default === './dist/inklayer-core.css',
  'Public style export must expose declarations and generated engine CSS.'
)

const distFiles = await listFiles(resolve(projectRoot, 'dist'))
assertPackage(distFiles.some((file) => file.endsWith('index.js')), 'ESM root build is missing.')
assertPackage(distFiles.some((file) => file.endsWith('index.cjs')), 'CommonJS root build is missing.')
assertPackage(
  distFiles.some((file) => file.endsWith('pdf.worker.min.mjs')),
  'Version-matched PDF.js worker asset is missing.'
)

for (const file of distFiles) {
  const content = await readFile(file, 'utf8')
  assertPackage(!content.includes('/Users/uncosy/study/inklayer_code'), `Local workspace path leaked into ${file}.`)
  assertPackage(!content.includes('/tests/'), `Test path leaked into ${file}.`)
}

const imported = await import(resolve(projectRoot, 'dist/index.js'))
assertPackage(
  imported.CORE_VERSION === packageJson.version,
  'Built ESM root import returned the wrong version.'
)
assertPackage(typeof imported.parseAnnotation === 'function', 'Built root is missing annotation validation.')
assertPackage(
  typeof imported.createMemoryAnnotationRepository === 'function',
  'Built root is missing the memory repository.'
)
assertPackage(
  typeof imported.parseLegacyAnnotation === 'function',
  'Built root is missing verified legacy compatibility.'
)
assertPackage(
  typeof imported.createPdfViewerEngine === 'function',
  'Built root is missing the SSR-safe Viewer factory.'
)
const viewerImported = await import(resolve(projectRoot, 'dist/viewer.js'))
assertPackage(
  typeof viewerImported.createPdfViewerEngine === 'function',
  'Built Viewer entry is missing its factory.'
)
const annotationImported = await import(resolve(projectRoot, 'dist/annotation.js'))
assertPackage(
  typeof annotationImported.createAnnotationEngine === 'function'
    && typeof annotationImported.parseAndValidateKonvaSnapshot === 'function',
  'Built Annotation entry is missing its facade or snapshot validator.'
)
const capabilitiesImported = await import(resolve(projectRoot, 'dist/capabilities.js'))
assertPackage(
  typeof capabilitiesImported.createInkLayer === 'function'
    && typeof capabilitiesImported.createLoggerCapability === 'function'
    && typeof capabilitiesImported.createFetchCapability === 'function',
  'Built Capabilities entry is missing Composition Root or Port factories.'
)
const annotationTypesImported = await import(resolve(projectRoot, 'dist/annotation-types.js'))
assertPackage(
  typeof annotationTypesImported.createAnnotationTypeRegistry === 'function',
  'Built Annotation Types entry is missing its registry factory.'
)
const highlighterImported = await import(resolve(projectRoot, 'dist/highlighter.js'))
assertPackage(
  typeof highlighterImported.createKeywordHighlighter === 'function',
  'Built Highlighter entry is missing its Controller factory.'
)
assertPackage(
  imported.createKeywordHighlighter === undefined,
  'The optional Highlighter factory must not leak through the root entry.'
)
const highlighterBuild = await readFile(resolve(projectRoot, 'dist/highlighter.js'), 'utf8')
for (const forbidden of ['pdfjs-dist', 'konva', 'react', 'vue']) {
  assertPackage(
    !highlighterBuild.includes(forbidden),
    `Optional Highlighter build contains forbidden runtime dependency ${forbidden}.`
  )
}
const pdfJsImport = await import(resolve(projectRoot, 'dist/import/pdfjs.js'))
const pdfExport = await import(resolve(projectRoot, 'dist/export/pdf.js'))
const excelExport = await import(resolve(projectRoot, 'dist/export/excel.js'))
assertPackage(
  typeof pdfJsImport.importPdfJsAnnotations === 'function'
    && typeof pdfJsImport.hideImportedPdfJsAnnotations === 'function'
    && typeof pdfJsImport.inspectInkLayerPdfMetadata === 'function'
    && typeof pdfJsImport.importPdfJsAnnotationsWithMetadata === 'function',
  'Built PDF.js import entry is incomplete.'
)
assertPackage(typeof pdfExport.buildAnnotatedPdf === 'function', 'Built PDF export entry is incomplete.')
assertPackage(
  typeof excelExport.buildAnnotationWorkbook === 'function',
  'Built Excel export entry is incomplete.'
)
const required = require(resolve(projectRoot, 'dist/index.cjs'))
const viewerRequired = require(resolve(projectRoot, 'dist/viewer.cjs'))
const annotationRequired = require(resolve(projectRoot, 'dist/annotation.cjs'))
const capabilitiesRequired = require(resolve(projectRoot, 'dist/capabilities.cjs'))
const annotationTypesRequired = require(resolve(projectRoot, 'dist/annotation-types.cjs'))
const highlighterRequired = require(resolve(projectRoot, 'dist/highlighter.cjs'))
const pdfJsRequired = require(resolve(projectRoot, 'dist/import/pdfjs.cjs'))
const pdfRequired = require(resolve(projectRoot, 'dist/export/pdf.cjs'))
const excelRequired = require(resolve(projectRoot, 'dist/export/excel.cjs'))
assertPackage(
  typeof required.createPdfViewerEngine === 'function'
    && typeof required.downloadBlob === 'function'
    && typeof viewerRequired.createPdfViewerEngine === 'function'
    && typeof annotationRequired.createAnnotationEngine === 'function'
    && typeof capabilitiesRequired.createInkLayer === 'function'
    && typeof annotationTypesRequired.createAnnotationTypeRegistry === 'function'
    && typeof highlighterRequired.createKeywordHighlighter === 'function'
    && typeof pdfJsRequired.importPdfJsAnnotations === 'function'
    && typeof pdfRequired.buildAnnotatedPdf === 'function'
    && typeof excelRequired.buildAnnotationWorkbook === 'function',
  'Built CommonJS entries are not synchronously import-safe.'
)

const npmCache = await mkdtemp(resolve(tmpdir(), 'inklayer-core-npm-cache-'))
let stdout
try {
  const result = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
    cwd: projectRoot,
    env: { ...process.env, npm_config_cache: npmCache }
  })
  stdout = result.stdout
} finally {
  await rm(npmCache, { recursive: true, force: true })
}
const packReport = JSON.parse(stdout)
const packedPaths = new Set(packReport[0]?.files?.map((file) => file.path) ?? [])
for (const expected of [
  'README.md',
  'LICENSE',
  'package.json',
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/viewer.js',
  'dist/viewer.cjs',
  'dist/viewer/index.d.ts',
  'dist/annotation.js',
  'dist/annotation.cjs',
  'dist/annotation/index.d.ts',
  'dist/capabilities.js',
  'dist/capabilities.cjs',
  'dist/capabilities/index.d.ts',
  'dist/annotation-types.js',
  'dist/annotation-types.cjs',
  'dist/annotation-types/index.d.ts',
  'dist/highlighter.js',
  'dist/highlighter.cjs',
  'dist/highlighter/index.d.ts',
  'dist/import/pdfjs.js',
  'dist/import/pdfjs.cjs',
  'dist/import/pdfjs/index.d.ts',
  'dist/export/pdf.js',
  'dist/export/pdf.cjs',
  'dist/export/pdf/index.d.ts',
  'dist/export/excel.js',
  'dist/export/excel.cjs',
  'dist/export/excel/index.d.ts',
  'dist/style.d.ts',
  'dist/inklayer-core.css',
  'dist/pdf.worker.min.mjs'
]) {
  assertPackage(packedPaths.has(expected), `npm pack is missing ${expected}.`)
}
assertPackage(
  [...packedPaths].every((path) => !path.startsWith('tests/') && !path.startsWith('src/')),
  'npm pack contains source or test files.'
)

process.stdout.write(`Package checks passed for ${exportTargets.length} export targets and ${packedPaths.size} packed files.\n`)
