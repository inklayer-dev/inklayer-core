/**
 * @file InkLayer Core test configuration.
 * @description Discovers every Core-owned unit, integration, contract, browser,
 * and package test without excluding production modules from transformation.
 * @remarks Browser E2E receives a separate runner when the Vanilla engine exists.
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: false,
    restoreMocks: true,
    clearMocks: true
  }
})
