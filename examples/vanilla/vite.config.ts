/**
 * @file Source-backed Vite configuration for the Vanilla development example.
 * @description Resolves public InkLayer package specifiers directly to current
 * source files so Core changes are visible without a preceding library build.
 * @remarks This configuration belongs to the example and does not alter the
 * published package resolution or production library build.
 */

import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const projectRoot = resolve(import.meta.dirname, '../..')

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      { find: /^inklayer-core$/, replacement: resolve(projectRoot, 'src/index.ts') },
      {
        find: /^inklayer-core\/viewer$/,
        replacement: resolve(projectRoot, 'src/viewer/index.ts')
      },
      {
        find: /^inklayer-core\/annotation$/,
        replacement: resolve(projectRoot, 'src/annotation/index.ts')
      },
      {
        find: /^inklayer-core\/import\/pdfjs$/,
        replacement: resolve(projectRoot, 'src/import/pdfjs/index.ts')
      },
      {
        find: /^inklayer-core\/export\/pdf$/,
        replacement: resolve(projectRoot, 'src/export/pdf/index.ts')
      },
      {
        find: /^inklayer-core\/export\/excel$/,
        replacement: resolve(projectRoot, 'src/export/excel/index.ts')
      },
      {
        find: /^inklayer-core\/style$/,
        replacement: resolve(projectRoot, 'src/styles/engine.css')
      }
    ]
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  build: {
    copyPublicDir: false,
    sourcemap: true
  }
})
