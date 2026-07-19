import type { Page } from '@playwright/test'

declare global {
  interface Window {
    /** Exposed by src/main.tsx under the ?e2e flag. */
    __store?: {
      getState: () => {
        openModal: (id: string) => void
        closeModal: () => void
      }
    }
    __controls?: {
      azimuthOverride: number | null
      poseOverride: { lat: number; long: number } | null
    }
  }
}

/** Console/page errors collected for the no-errors assertion at test end. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text())
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  return errors
}

/** Errors we tolerate: placeholder YouTube thumbnails may 404 offline. */
export function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !e.includes('i.ytimg.com'))
}

/** Loads the world with the ?e2e hook and waits for the scene. */
export async function gotoWorld(page: Page): Promise<void> {
  await page.goto('/?e2e', { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 30_000 })
  await page.waitForFunction(
    () => window.__store !== undefined && window.__controls !== undefined,
    { timeout: 15_000 },
  )
}

/** Sprints on a camera heading until `until` resolves true (or times out). */
export async function sprintUntil(
  page: Page,
  azimuth: number | null,
  until: () => Promise<boolean>,
  maxMs = 20_000,
): Promise<number> {
  if (azimuth !== null) {
    await page.evaluate((a) => {
      window.__controls!.azimuthOverride = a
    }, azimuth)
    await page.waitForTimeout(100)
  }
  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  const start = Date.now()
  let elapsed = 0
  while (!(await until()) && elapsed < maxMs) {
    await page.waitForTimeout(250)
    elapsed = Date.now() - start
  }
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
  return elapsed
}
