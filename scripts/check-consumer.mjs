/**
 * @file Packed-package Vanilla consumer quality gate.
 * @description Installs the real tarball into a temporary TypeScript/Vite app,
 * imports every public entry and CSS, then typechecks, builds, and imports Node.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(import.meta.dirname, '..')
const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'inklayer-core-consumer-'))
const npmCache = process.env.npm_config_cache ?? resolve(temporaryRoot, 'npm-cache')

/** Runs one command in the temporary consumer with bounded output. */
async function run(command, args) {
  await execFileAsync(command, args, {
    cwd: temporaryRoot,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_cache: npmCache
    },
    maxBuffer: 10_000_000
  })
}

try {
  const pack = await execFileAsync('npm', ['pack', '--json', '--pack-destination', temporaryRoot], {
    cwd: projectRoot,
    env: { ...process.env, npm_config_cache: npmCache },
    maxBuffer: 10_000_000
  })
  const report = JSON.parse(pack.stdout)
  const filename = report[0]?.filename
  if (typeof filename !== 'string') throw new Error('npm pack did not return a tarball filename.')
  await writeFile(resolve(temporaryRoot, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    scripts: { typecheck: 'tsc --noEmit', build: 'vite build' },
    dependencies: { 'inklayer-core': `file:./${filename}` },
    devDependencies: { typescript: '^6.0.3', vite: '^8.2.1' }
  }, null, 2))
  await writeFile(resolve(temporaryRoot, 'index.html'), '<main id="app"></main><script type="module" src="/src.ts"></script>')
  await writeFile(resolve(temporaryRoot, 'src.ts'), `
import { CORE_VERSION, createMemoryAnnotationRepository } from 'inklayer-core'
import { createPdfViewerEngine } from 'inklayer-core/viewer'
import { createAnnotationEngine } from 'inklayer-core/annotation'
import { importPdfJsAnnotations } from 'inklayer-core/import/pdfjs'
import { buildAnnotatedPdf } from 'inklayer-core/export/pdf'
import { buildAnnotationWorkbook } from 'inklayer-core/export/excel'
import 'inklayer-core/style'
const app = document.querySelector('#app')
if (app === null) throw new Error('Consumer root is missing.')
app.textContent = [CORE_VERSION, createMemoryAnnotationRepository,
  createPdfViewerEngine(), createAnnotationEngine, importPdfJsAnnotations,
  buildAnnotatedPdf, buildAnnotationWorkbook].map(String).join(' ')
`)
  await writeFile(resolve(temporaryRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
      lib: ['ES2022', 'DOM'], skipLibCheck: true, types: ['vite/client']
    },
    include: ['src.ts']
  }, null, 2))
  await run('npm', ['install', '--ignore-scripts'])
  await run('npm', ['run', 'typecheck'])
  await run('npm', ['run', 'build'])
  const rootImport = await execFileAsync('node', [
    '--input-type=module',
    '--eval',
    "import('inklayer-core').then((core) => { if (core.CORE_VERSION !== '0.1.0') process.exit(1) })"
  ], { cwd: temporaryRoot })
  if (rootImport.stderr.trim() !== '') throw new Error(rootImport.stderr)
  const builtIndex = await readFile(resolve(temporaryRoot, 'dist/index.html'), 'utf8')
  if (!builtIndex.includes('assets/')) throw new Error('Temporary consumer production build is empty.')
  const builtAssets = await readdir(resolve(temporaryRoot, 'dist/assets'))
  if (!builtAssets.some((name) => name.startsWith('pdf.worker.min-') && name.endsWith('.mjs'))) {
    throw new Error('Temporary consumer build is missing the bundled PDF.js worker asset.')
  }
  process.stdout.write('Packed consumer typecheck, zero-config worker build, CSS import, and Node root import passed.\n')
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
