/**
 * @file Source documentation quality gate.
 * @description Uses the TypeScript AST to require file headers, JSDoc on named
 * functions and class lifecycle members, and documentation on public type fields.
 * @remarks The script checks documentation presence; human review remains
 * responsible for accuracy and usefulness.
 */

import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const projectRoot = resolve(import.meta.dirname, '..')
const sourceRoots = ['src', 'tests', 'scripts', 'examples/vanilla', 'examples/framework-consumers']
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])

/**
 * Recursively returns maintained code files below one project-relative path.
 * @param rootRelative Project-relative directory or file to inspect.
 * @returns Absolute paths for maintained code files.
 */
async function collectCodeFiles(rootRelative) {
  const absolute = resolve(projectRoot, rootRelative)
  const entries = await readdir(absolute, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(absolute, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectCodeFiles(relative(projectRoot, entryPath)))
    } else if (codeExtensions.has(extname(entry.name))) {
      files.push(entryPath)
    }
  }

  return files
}

/**
 * Returns whether an AST node has an immediately associated JSDoc block.
 * @param node TypeScript AST node to inspect.
 * @returns True when TypeScript associated at least one JSDoc block.
 */
function hasJsDoc(node) {
  return Array.isArray(node.jsDoc) && node.jsDoc.length > 0
}

/**
 * Returns a stable one-based source location for a documentation failure.
 * @param sourceFile Parsed source file owning the node.
 * @param node AST node whose start position should be reported.
 * @returns Human-readable line and column.
 */
function locationOf(sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${location.line + 1}:${location.character + 1}`
}

/**
 * Returns whether a declaration is exported from its source module.
 * @param node Declaration node whose modifiers should be inspected.
 * @returns True for declarations carrying the export modifier.
 */
function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
}

/**
 * Returns a useful declaration label for a documentation diagnostic.
 * @param node Named declaration or class member.
 * @returns Source-level name or a syntax-kind fallback.
 */
function declarationName(node) {
  if ('name' in node && node.name !== undefined && ts.isIdentifier(node.name)) {
    return node.name.text
  }
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  return ts.SyntaxKind[node.kind]
}

/**
 * Audits one parsed file for the documentation rules in the whitepaper.
 * @param filePath Absolute maintained source path.
 * @returns Documentation diagnostics for the file.
 */
async function auditFile(filePath) {
  const text = await readFile(filePath, 'utf8')
  const relativePath = relative(projectRoot, filePath)
  const diagnostics = []
  const firstContent = text.replace(/^#![^\n]*\n/, '').trimStart()
  if (!firstContent.startsWith('/**')) {
    diagnostics.push(`${relativePath}:1:1 missing /** file header`)
  }

  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind)

  /**
   * Visits declarations whose documentation is part of the maintained contract.
   * @param node Current TypeScript AST node.
   * @returns Nothing; diagnostics are collected in the enclosing audit.
   */
  function visit(node) {
    const namedFunction = ts.isFunctionDeclaration(node) && node.name !== undefined
    const classLifecycleMember = ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)
    const exportedArrow = ts.isVariableStatement(node) && isExported(node)
      && node.declarationList.declarations.some((declaration) =>
        declaration.initializer !== undefined
        && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)))

    if ((namedFunction || classLifecycleMember || exportedArrow) && !hasJsDoc(node)) {
      diagnostics.push(
        `${relativePath}:${locationOf(sourceFile, node)} missing JSDoc for ${declarationName(node)}`
      )
    }

    if (ts.isInterfaceDeclaration(node) && isExported(node)) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && !hasJsDoc(member)) {
          diagnostics.push(
            `${relativePath}:${locationOf(sourceFile, member)} missing public field JSDoc for ${declarationName(member)}`
          )
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return diagnostics
}

const files = (await Promise.all(sourceRoots.map(collectCodeFiles))).flat()
files.push(
  resolve(projectRoot, 'vite.config.ts'),
  resolve(projectRoot, 'vitest.config.ts'),
  resolve(projectRoot, 'playwright.config.ts'),
  resolve(projectRoot, 'eslint.config.mjs')
)
const diagnostics = (await Promise.all(files.map(auditFile))).flat()

if (diagnostics.length > 0) {
  process.stderr.write(`${diagnostics.join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Documentation checks passed for ${files.length} files.\n`)
}
