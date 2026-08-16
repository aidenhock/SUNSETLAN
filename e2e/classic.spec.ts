import { expect, test } from '@playwright/test'
import { collectErrors, realErrors } from './helpers'

test('/classic renders every section without loading any three.js modules', async ({ page }) => {
  const errors = collectErrors(page)
  const jsRequests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('.js')) jsRequests.push(r.url())
  })

  await page.goto('/classic', { waitUntil: 'networkidle' })

  for (const heading of ["Hey, I'm Aiden", 'Projects', 'Papers', 'Photos', 'Music', 'Videos', 'Memorials', 'Contact']) {
    await expect(page.getByRole('heading', { name: heading, exact: false })).toBeVisible()
  }
  // Mirror rule: the About section is FINDABLE by its category label,
  // the contact form renders here too (shared component with the
  // mailbox modal), and photos link out to their full-size images.
  await expect(page.getByText('About', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Name')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
  const fullLinks = page.locator('a[aria-label^="Open full size:"]')
  expect(await fullLinks.count()).toBe(17)
  await expect(page.getByRole('link', { name: 'Visit the island' })).toBeVisible()
  expect(await page.locator('canvas').count()).toBe(0)

  // Chunk purity: the world chunk (three.js) must never be fetched here.
  const threeish = jsRequests.filter((u) => /three|fiber|drei|App-/.test(u))
  expect(threeish).toEqual([])

  expect(realErrors(errors)).toEqual([])
})
