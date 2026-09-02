/**
 * @file Build proof for direct React and Vue Highlighter consumption.
 * @description Bundles both framework fixtures against the same source-backed
 * Controller while keeping framework runtimes external to InkLayer Core.
 */

import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const projectRoot = resolve(import.meta.dirname, '../..')

export default defineConfig({
  resolve: {
    alias: [{
      find: /^@inklayer-dev\/core\/highlighter$/,
      replacement: resolve(projectRoot, 'src/highlighter/index.ts')
    }]
  },
  build: {
    copyPublicDir: false,
    emptyOutDir: true,
    outDir: resolve(projectRoot, 'dist-framework-examples'),
    lib: {
      entry: {
        react: resolve(import.meta.dirname, 'react-keyword-highlighter.tsx'),
        vue: resolve(import.meta.dirname, 'vue-keyword-highlighter.ts')
      },
      formats: ['es'],
      fileName: (_format, entryName): string => `${entryName}.js`
    },
    rollupOptions: {
      external: /^(?:react|react\/jsx-runtime|vue)$/u
    }
  }
})
