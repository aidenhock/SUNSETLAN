/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Unit tests only — e2e/*.spec.ts belongs to Playwright.
    include: ['src/**/*.test.ts'],
  },
})
