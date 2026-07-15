import { expect, test } from '@playwright/test'
import { collectErrors, realErrors } from './helpers'

test('/classic renders every section without loading any three.js modules', async ({ page }) => {
  const errors = collectErrors(page)
  const jsRequests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('.js')) jsRequests.push(r.url())
  })

  await page.goto('/classic', { waitUntil: 'networkidle' })

  for (const heading of ["Hey, I'm Aiden", 'Projects', 'Photos', 'Music', 'Videos', 'Contact']) {
    await expect(page.getByRole('heading', { name: heading, exact: false })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'Visit the island' })).toBeVisible()
  expect(await page.locator('canvas').count()).toBe(0)

  // Chunk purity: the world chunk (three.js) must never be fetched here.
  const threeish = jsRequests.filter((u) => /three|fiber|drei|App-/.test(u))
  expect(threeish).toEqual([])

  expect(realErrors(errors)).toEqual([])
})
