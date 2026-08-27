/**
 * @file Packed-package consumer build matrix quality gate.
 * @description Installs one real tarball into temporary Vite and Webpack apps,
 * then verifies browser assets, CSS, Worker resolution, and Node SSR execution.
 */

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const expectedVersion = packageJson.version
const matrixRoot = await mkdtemp(resolve(tmpdir(), 'inklayer-core-consumer-matrix-'))
const viteRoot = resolve(matrixRoot, 'vite')
const webpackRoot = resolve(matrixRoot, 'webpack')

/** Runs one command in the temporary consumer with bounded output. */
async function run(directory, command, args) {
  await execFileAsync(command, args, {
    cwd: directory,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false'
    },
    maxBuffer: 10_000_000
  })
}

/** Recursively lists files below one generated consumer directory. */
async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(path))
    else files.push(path)
  }
  return files
}

try {
  await Promise.all([mkdir(viteRoot), mkdir(webpackRoot)])
  const pack = await execFileAsync('npm', ['pack', '--json', '--pack-destination', matrixRoot], {
    cwd: projectRoot,
    env: process.env,
    maxBuffer: 10_000_000
  })
  const report = JSON.parse(pack.stdout)
  const filename = report[0]?.filename
  if (typeof filename !== 'string') throw new Error('npm pack did not return a tarball filename.')
  await writeFile(resolve(matrixRoot, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: { '@inklayer-dev/core': `file:./${filename}` },
    devDependencies: {
      'css-loader': '7.1.2',
      'mini-css-extract-plugin': '2.9.4',
      typescript: '6.0.3',
      vite: '8.2.1',
      webpack: '5.101.3',
      'webpack-cli': '6.0.1'
    }
  }, null, 2))
  await run(matrixRoot, 'npm', ['install', '--ignore-scripts'])
  await writeFile(resolve(viteRoot, 'index.html'), '<main id="app"></main><script type="module" src="/src.ts"></script>')
  await writeFile(resolve(viteRoot, 'src.ts'), `
import { CORE_VERSION, createMemoryAnnotationRepository } from '@inklayer-dev/core'
import { createPdfViewerEngine, type PdfSearchOptions } from '@inklayer-dev/core/viewer'
import { createAnnotationEngine } from '@inklayer-dev/core/annotation'
import {
  INKLAYER_CAPABILITY_SERVICE_KEYS,
  createClockCapability,
  createInkLayer,
  createLoggerCapability,
  createTextInputCapability
} from '@inklayer-dev/core/capabilities'
import {
  createAnnotationTypeRegistry,
  type AnnotationTypeDefinition
} from '@inklayer-dev/core/annotation-types'
import { importPdfJsAnnotations } from '@inklayer-dev/core/import/pdfjs'
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'
import { buildAnnotationWorkbook } from '@inklayer-dev/core/export/excel'
import '@inklayer-dev/core/style'
const app = document.querySelector('#app')
if (app === null) throw new Error('Consumer root is missing.')
const annotationTypes = createAnnotationTypeRegistry()
const proofDefinition: AnnotationTypeDefinition = {
  type: 'custom:consumer/box', apiVersion: 1, geometry: 'box',
  capabilities: {
    creation: 'drag-box', creationMode: 'one-shot',
    transform: { move: true, resize: true, rotate: false, endpoints: false, vertices: false },
    appearance: { opacity: true, stroke: true, fill: true, text: false },
    comments: true, printable: true, exportable: true
  },
  appearance: { defaults: {
    opacity: 1,
    stroke: { color: '#000000', width: 1, opacity: 1, dash: [], dashOffset: 0, lineCap: 'butt', lineJoin: 'miter' },
    fill: { color: '#ffffff', opacity: 0.25 }, text: null
  } },
  creation: {
    controller: 'drag-box',
    initialize: (input) => ({
      bounds: input.bounds,
      typeData: { schemaVersion: 1, payload: { consumer: true } }
    })
  },
  renderer: { render: (annotation) => ({ children: [{
    kind: 'rectangle', bounds: annotation.bounds,
    stroke: { color: '#000000', width: 1 },
    fill: { color: '#ffffff', opacity: 0.25 }
  }] }) },
  pdf: { exportStrategy: 'appearance-stream' }
}
annotationTypes.register(proofDefinition)
const exportCustom = (bytes: Uint8Array) => buildAnnotatedPdf(bytes, [], { annotationTypes })
const portCapabilities = [
  createLoggerCapability({ warn() {}, error() {} }),
  createTextInputCapability({ requestText: async () => ({ value: null }) }),
  createClockCapability({ now: () => new Date(0).toISOString() })
]
const printKey: 'inklayer.port.print' = INKLAYER_CAPABILITY_SERVICE_KEYS.print
const searchOptions: PdfSearchOptions = {
  matchCase: false, wholeWord: true, matchDiacritics: false, maxResults: 100
}
app.textContent = [CORE_VERSION, createMemoryAnnotationRepository,
  createPdfViewerEngine(), createAnnotationEngine, createInkLayer,
  createAnnotationTypeRegistry, importPdfJsAnnotations,
  buildAnnotatedPdf, exportCustom, buildAnnotationWorkbook,
  portCapabilities, printKey, searchOptions].map(String).join(' ')
`)
  await writeFile(resolve(viteRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
      lib: ['ES2022', 'DOM'], skipLibCheck: true, types: ['vite/client']
    },
    include: ['src.ts']
  }, null, 2))
  await run(viteRoot, resolve(matrixRoot, 'node_modules/.bin/tsc'), ['--noEmit'])
  await run(viteRoot, resolve(matrixRoot, 'node_modules/.bin/vite'), ['build'])
  const rootImport = await execFileAsync('node', [
    '--input-type=module',
    '--eval',
    `import('@inklayer-dev/core').then((core) => { if (core.CORE_VERSION !== ${JSON.stringify(expectedVersion)}) process.exit(1) })`
  ], { cwd: viteRoot })
  if (rootImport.stderr.trim() !== '') throw new Error(rootImport.stderr)
  const builtIndex = await readFile(resolve(viteRoot, 'dist/index.html'), 'utf8')
  if (!builtIndex.includes('assets/')) throw new Error('Temporary consumer production build is empty.')
  const builtAssets = await readdir(resolve(viteRoot, 'dist/assets'))
  if (!builtAssets.some((name) => name.startsWith('pdf.worker.min-') && name.endsWith('.mjs'))) {
    throw new Error('Temporary consumer build is missing the bundled PDF.js worker asset.')
  }
  await writeFile(resolve(webpackRoot, 'client.mjs'), `
import { CORE_VERSION, createMemoryAnnotationRepository } from '@inklayer-dev/core'
import { createPdfViewerEngine } from '@inklayer-dev/core/viewer'
import '@inklayer-dev/core/style'
const viewer = createPdfViewerEngine()
const app = document.querySelector('#app')
if (app === null) throw new Error('Webpack consumer root is missing.')
app.textContent = [CORE_VERSION, typeof createMemoryAnnotationRepository,
  viewer.getSnapshot().status].join(':')
void viewer.destroy()
`)
  await writeFile(resolve(webpackRoot, 'server.mjs'), `
import { CORE_VERSION, createMemoryAnnotationRepository } from '@inklayer-dev/core'
import { createPdfViewerEngine } from '@inklayer-dev/core/viewer'
const viewer = createPdfViewerEngine()
process.stdout.write(JSON.stringify({
  version: CORE_VERSION,
  repository: typeof createMemoryAnnotationRepository,
  viewer: typeof createPdfViewerEngine,
  status: viewer.getSnapshot().status
}))
await viewer.destroy()
`)
  await writeFile(resolve(webpackRoot, 'webpack.config.cjs'), `
const path = require('node:path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const common = {
  mode: 'production',
  devtool: false,
  resolve: { extensions: ['.mjs', '.js'] }
}

module.exports = [
  {
    ...common,
    name: 'browser',
    target: ['web', 'es2022'],
    entry: './client.mjs',
    output: {
      path: path.resolve(__dirname, 'dist/client'),
      filename: 'client.js',
      assetModuleFilename: 'assets/[name][ext]',
      clean: true
    },
    module: {
      rules: [{ test: /\\.css$/u, use: [MiniCssExtractPlugin.loader, 'css-loader'] }]
    },
    plugins: [new MiniCssExtractPlugin({ filename: 'inklayer-core.css' })]
  },
  {
    ...common,
    name: 'ssr',
    target: 'node20',
    entry: './server.mjs',
    output: {
      path: path.resolve(__dirname, 'dist/server'),
      filename: 'server.cjs',
      assetModuleFilename: 'assets/[name][ext]',
      library: { type: 'commonjs2' },
      clean: true
    }
  }
]
`)
  await run(webpackRoot, resolve(matrixRoot, 'node_modules/.bin/webpack'), [
    '--config', 'webpack.config.cjs'
  ])
  const webpackFiles = await listFiles(resolve(webpackRoot, 'dist/client'))
  const relativeWebpackFiles = webpackFiles.map(file => relative(webpackRoot, file))
  const webpackWorker = webpackFiles.find(file => file.endsWith('pdf.worker.min.mjs'))
  if (webpackWorker === undefined || (await stat(webpackWorker)).size < 1_000_000) {
    throw new Error(`Webpack consumer is missing the version-matched Worker asset: ${relativeWebpackFiles.join(', ')}`)
  }
  const webpackCss = await readFile(resolve(webpackRoot, 'dist/client/inklayer-core.css'), 'utf8')
  if (!webpackCss.includes('.inklayer-engine')) {
    throw new Error('Webpack consumer did not extract the public Core stylesheet.')
  }
  const ssr = await execFileAsync('node', [resolve(webpackRoot, 'dist/server/server.cjs')], {
    cwd: webpackRoot
  })
  const ssrProof = JSON.parse(ssr.stdout)
  if (ssrProof.version !== expectedVersion || ssrProof.repository !== 'function'
    || ssrProof.viewer !== 'function' || ssrProof.status !== 'idle') {
    throw new Error(`Webpack SSR bundle returned invalid Core exports: ${ssr.stdout}`)
  }
  process.stdout.write(
    'Packed consumer matrix passed: Vite browser/typecheck/Node import and '
    + 'Webpack browser CSS/Worker plus executable Node SSR.\n'
  )
} finally {
  await rm(matrixRoot, { recursive: true, force: true })
}
