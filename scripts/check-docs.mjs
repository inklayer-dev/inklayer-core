/**
 * @file Maintained-document consistency gate.
 * @description Compares release claims with package metadata, collected tests,
 * browser revisions, exports, the VitePress site, and required Worker examples.
 */

import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

const execFileAsync = promisify(execFile)
const projectRoot = resolve(import.meta.dirname, '..')
const diagnostics = []

/** Records one failed documentation invariant without stopping later checks. */
function check(condition, message) {
  if (!condition) diagnostics.push(message)
}

/** Returns translation-stable Markdown structure counts. */
function markdownShape(contents) {
  return {
    headings: contents.match(/^#{1,3} /gmu)?.length ?? 0,
    codeBlocks: (contents.match(/```/gu)?.length ?? 0) / 2,
    tableRows: contents.match(/^\|/gmu)?.length ?? 0
  }
}

/** Recursively counts maintained TypeScript implementation files. */
async function countSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  let count = 0
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) count += await countSourceFiles(path)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) count += 1
  }
  return count
}

/** Reads JSON emitted by one local executable without invoking a shell. */
async function commandJson(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    cwd: projectRoot,
    maxBuffer: 20_000_000
  })
  return JSON.parse(stdout)
}

/** Recursively returns all maintained Markdown document paths. */
async function collectMarkdown(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory() && entry.name !== '.vitepress') {
      paths.push(...await collectMarkdown(path))
    } else if (entry.name.endsWith('.md')) paths.push(path)
  }
  return paths
}

const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const readme = await readFile(resolve(projectRoot, 'README.md'), 'utf8')
const api = await readFile(resolve(projectRoot, 'docs/api.md'), 'utf8')
const gettingStarted = await readFile(resolve(projectRoot, 'docs/guide/getting-started.md'), 'utf8')
const chineseReadme = await readFile(resolve(projectRoot, 'README.zh-CN.md'), 'utf8')
const vitePressConfig = await readFile(resolve(projectRoot, 'docs/.vitepress/config.mts'), 'utf8')
const exampleViteConfig = await readFile(resolve(projectRoot, 'examples/vanilla/vite.config.ts'), 'utf8')
const reactHighlighterExample = await readFile(resolve(
  projectRoot, 'examples/framework-consumers/react-keyword-highlighter.tsx'
), 'utf8')
const vueHighlighterExample = await readFile(resolve(
  projectRoot, 'examples/framework-consumers/vue-keyword-highlighter.ts'
), 'utf8')
const vanillaHighlighterExample = await readFile(resolve(
  projectRoot, 'examples/vanilla/src/ui/highlighter-panel.ts'
), 'utf8')
const docsWorkflow = await readFile(resolve(projectRoot, '.github/workflows/docs.yml'), 'utf8')
const schema = await readFile(resolve(projectRoot, 'src/domain/schema.ts'), 'utf8')
const vitest = await commandJson(resolve(projectRoot, 'node_modules/.bin/vitest'), ['list', '--json'])
const playwright = await commandJson(resolve(projectRoot, 'node_modules/.bin/playwright'), [
  'test', '--list', '--project=chromium', '--reporter=json'
])
const sourceFiles = await countSourceFiles(resolve(projectRoot, 'src'))
const vitestFiles = new Set(vitest.map(test => test.file)).size
const browserScenarios = playwright.stats?.skipped
const exportEntries = Object.keys(packageJson.exports ?? {}).length

check(schema.includes(`CORE_VERSION = '${packageJson.version}'`),
  'CORE_VERSION does not match package.json version.')
for (const [path, contents] of [['README.md', readme], ['docs/api.md', api]]) {
  check(contents.includes('const viewer = createPdfViewerEngine()'),
    `${path} must show zero-configuration Worker construction.`)
  check(contents.includes("workerSrc: '/assets/pdf.worker.min.mjs'"),
    `${path} must show the optional self-hosted/CSP Worker override.`)
  check(/do\s+not\s+need\s+to\s+download(?:, copy,)? or configure/iu.test(contents),
    `${path} must state that Worker configuration is not mandatory.`)
}
check(gettingStarted.includes('const core = await createInkLayer({'),
  'Getting started must show zero-configuration composed construction.')
check(gettingStarted.includes("workerSrc: '/assets/pdf.worker.min.mjs'"),
  'Getting started must show the optional self-hosted/CSP Worker override.')
check(/do\s+not\s+need\s+to\s+download(?:, copy,)? or configure/iu.test(gettingStarted),
  'Getting started must state that Worker configuration is not mandatory.')
for (const entry of Object.keys(packageJson.exports)) {
  const packageEntry = entry === '.' ? '@inklayer-dev/core' : `@inklayer-dev/core${entry.slice(1)}`
  check(api.includes(`\`${packageEntry}\``), `docs/api.md is missing package entry ${entry}.`)
}
check(packageJson.scripts?.['docs:build'] === 'vitepress build docs',
  'package.json must expose the VitePress production build.')
check(packageJson.scripts?.['build:framework-examples']
  === 'vite build --config examples/framework-consumers/vite.config.ts',
'package.json must build the direct React and Vue Highlighter fixtures.')
check(reactHighlighterExample.includes('useSyncExternalStore')
  && reactHighlighterExample.includes('controller.destroy()'),
'React Highlighter fixture must use the external-store contract and release its Controller.')
check(vueHighlighterExample.includes('shallowRef')
  && vueHighlighterExample.includes('controller.subscribe')
  && vueHighlighterExample.includes('onScopeDispose'),
'Vue Highlighter fixture must project snapshots and release its effect scope.')
check(vitePressConfig.includes("link: '/guide/framework-integration'"),
  'VitePress navigation must expose the framework integration guide.')
const taskGuides = [
  'getting-started',
  'first-annotation',
  'first-keyword-highlight',
  'loading-pdfs',
  'viewer-and-pages',
  'search-and-selection',
  'highlighter',
  'stamp-and-sign',
  'annotations',
  'persistence',
  'output-and-security',
  'framework-integration',
  'framework-vue',
  'framework-react',
  'plugins',
  'capability-plugin',
  'custom-annotation-type',
  'plugin-lifecycle'
]
const frameworkGuides = new Set([
  'framework-integration',
  'framework-vue',
  'framework-react'
])
const frameworkExamples = [
  'pageFlow:',
  'getPageFlow()',
  'renderThumbnail(',
  'URL.revokeObjectURL(',
  'repository.subscribe(',
  '.destroy()'
]
const highlighterGuideExamples = [
  "createKeywordHighlighter({",
  'highlighter.setRules(rules)',
  'highlighter.subscribe(render)',
  'highlighter.scan({ maxTotalResults:',
  'highlighter.cancelScan()',
  'highlighter.activateMatch(match.id)',
  'highlighter.applyMatches({',
  'clearPreview()',
  'highlighter.destroy()',
  'snapshot.truncated',
  'patterns: [',
  'match.matchedText',
  "worker-src 'self' blob:",
  'useSyncExternalStore(',
  'onScopeDispose('
]
const firstKeywordHighlightExamples = [
  'structuredReviewRules',
  'patterns: [',
  "kind: 'regex'",
  'match.matchedText'
]
const referenceDocuments = [
  'api',
  'data-model',
  'css-contract',
  'error-recovery',
  'accessibility',
  'browser-support'
]
check(JSON.stringify(markdownShape(readme)) === JSON.stringify(markdownShape(chineseReadme)),
  'README.md and README.zh-CN.md must keep the same heading, code-block, and table structure.')
for (const guide of taskGuides) {
  const english = await readFile(resolve(projectRoot, `docs/guide/${guide}.md`), 'utf8')
  const chinese = await readFile(resolve(projectRoot, `docs/zh/guide/${guide}.md`), 'utf8')
  check(JSON.stringify(markdownShape(english)) === JSON.stringify(markdownShape(chinese)),
    `English and Chinese ${guide} guides must keep the same Markdown structure.`)
  check(vitePressConfig.includes(`link: '/guide/${guide}'`)
    && vitePressConfig.includes(`link: '/zh/guide/${guide}'`),
  `VitePress navigation must expose both locales for ${guide}.`)
  if (frameworkGuides.has(guide)) {
    for (const [locale, contents] of [['English', english], ['Chinese', chinese]]) {
      for (const example of frameworkExamples) {
        check(contents.includes(example),
          `${locale} ${guide} guide must demonstrate ${example}.`)
      }
    }
  }
  if (guide === 'highlighter') {
    for (const [locale, contents] of [['English', english], ['Chinese', chinese]]) {
      for (const example of highlighterGuideExamples) {
        check(contents.includes(example),
          `${locale} Highlighter guide must demonstrate ${example}.`)
      }
    }
  }
  if (guide === 'first-keyword-highlight') {
    for (const [locale, contents] of [['English', english], ['Chinese', chinese]]) {
      for (const example of firstKeywordHighlightExamples) {
        check(contents.includes(example),
          `${locale} first keyword highlight guide must demonstrate ${example}.`)
      }
    }
  }
}
for (const document of referenceDocuments) {
  const english = await readFile(resolve(projectRoot, `docs/${document}.md`), 'utf8')
  const chinese = await readFile(resolve(projectRoot, `docs/zh/${document}.md`), 'utf8')
  check(JSON.stringify(markdownShape(english)) === JSON.stringify(markdownShape(chinese)),
    `English and Chinese ${document} references must keep the same Markdown structure.`)
  check(vitePressConfig.includes(`link: '/${document}'`)
    && vitePressConfig.includes(`link: '/zh/${document}'`),
  `VitePress navigation must expose both locales for ${document}.`)
}
check(docsWorkflow.includes('actions/deploy-pages@v4') && docsWorkflow.includes('npm run docs:build'),
  'GitHub Pages workflow must build and deploy the VitePress site.')
check(exampleViteConfig.includes("base: './'"),
  'Vanilla production assets must use a relative base for nested GitHub Pages deployment.')
check(exampleViteConfig.includes("fileName: 'range-sample.pdf'"),
  'Vanilla production output must include its base-aware Range sample PDF.')
check(vanillaHighlighterExample.includes("kind: 'regex'")
  && vanillaHighlighterExample.includes('.highlighter-rule-patterns')
  && vanillaHighlighterExample.includes('match.matchedText'),
'Vanilla Highlighter must demonstrate editable regex rules and exact matched text.')

const retiredDocuments = [
  'implementation-progress', 'roadmap', 'final-report', 'release-candidate',
  'react-core-final-audit-whitepaper', 'source-behavior-baseline',
  'source-debt-inventory', 'source-difference-matrix', 'consumer-build-matrix'
]
const maintainedText = [readme, ...await Promise.all(
  (await collectMarkdown(resolve(projectRoot, 'docs'))).map(path => readFile(path, 'utf8'))
)].join('\n')
for (const retired of retiredDocuments) {
  check(!maintainedText.includes(retired), `Public documentation references retired document ${retired}.`)
}

if (diagnostics.length > 0) {
  process.stderr.write(`${diagnostics.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(
    `Documentation consistency passed: ${packageJson.version}, ${sourceFiles} source files, `
    + `${vitestFiles}/${vitest.length} Vitest, ${browserScenarios} browser scenarios, `
    + `${exportEntries} package entries.\n`
  )
}
