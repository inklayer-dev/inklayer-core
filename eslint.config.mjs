/**
 * @file InkLayer Core lint configuration.
 * @description Enforces supported ESLint and TypeScript rules across production,
 * unit, browser, script, configuration, and Vanilla example sources.
 * @remarks JSDoc completeness is checked by the dedicated TypeScript-AST script.
 */

import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-example/**', 'node_modules/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: globals.node
    }
  }
)
