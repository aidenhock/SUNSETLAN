/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import writePlacementsPlugin from './scripts/write-placements-plugin.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), writePlacementsPlugin()],
  test: {
    // Unit tests only — e2e/*.spec.ts belongs to Playwright.
    include: ['src/**/*.test.ts'],
  },
})
