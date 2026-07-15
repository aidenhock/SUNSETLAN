import { defineConfig, devices } from '@playwright/test'

/**
 * E2E suites run against the production build via `vite preview` (started
 * automatically below). `channel: 'chrome'` uses the installed Chrome — no
 * browser download, and WebGL works headless.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /(world|modals|classic)\.spec\.ts/,
      use: { channel: 'chrome', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'], channel: 'chrome' },
    },
  ],
})
