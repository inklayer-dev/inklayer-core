/**
 * @file InkLayer Core library build configuration.
 * @description Bundles the currently implemented public root entry as ESM and
 * CommonJS without introducing framework or browser-only import side effects.
 * @remarks Declarations are emitted separately by TypeScript so build failures
 * cannot be hidden by a declaration bundler.
 */

import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    copyPublicDir: false,
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        viewer: resolve(import.meta.dirname, 'src/viewer/index.ts'),
        annotation: resolve(import.meta.dirname, 'src/annotation/index.ts'),
        capabilities: resolve(import.meta.dirname, 'src/capabilities/index.ts'),
        'annotation-types': resolve(import.meta.dirname, 'src/annotation-types/index.ts'),
        highlighter: resolve(import.meta.dirname, 'src/highlighter/index.ts'),
        'import/pdfjs': resolve(import.meta.dirname, 'src/import/pdfjs/index.ts'),
        'export/pdf': resolve(import.meta.dirname, 'src/export/pdf/index.ts'),
        'export/excel': resolve(import.meta.dirname, 'src/export/excel/index.ts'),
        style: resolve(import.meta.dirname, 'src/style.ts')
      },
      name: 'InkLayerCore',
      formats: ['es', 'cjs'],
      cssFileName: 'inklayer-core',
      fileName: (format, entryName): string =>
        `${entryName}.${format === 'es' ? 'js' : 'cjs'}`
    },
    rollupOptions: {
      external: (id): boolean => {
        if (id.startsWith('pdfjs-dist/build/pdf.worker.min.mjs?')) return false
        return /^(?:pdfjs-dist|konva|pdf-lib|@pdf-lib\/fontkit|exceljs)(?:\/|$)/.test(id)
      },
      output: {
        exports: 'named'
      }
    },
    sourcemap: true
  }
})
