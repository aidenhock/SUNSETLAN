import { expect, test } from '@playwright/test'
import { collectErrors, realErrors } from './helpers'

test('/classic renders every section without loading any three.js modules', async ({ page }) => {
  const errors = collectErrors(page)
  const jsRequests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('.js')) jsRequests.push(r.url())
  })

  await page.goto('/classic', { waitUntil: 'networkidle' })

  for (const heading of ["Hey, I'm Aiden", 'Projects', 'Papers', 'Photos', 'Paintings', 'Music', 'Covers', 'Videos', 'Memorials', 'Build log', 'Contact']) {
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

test('/classic build log dropdown steps through numbered chapters with murals', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/classic', { waitUntil: 'networkidle' })

  const select = page.getByLabel('Jump to a chapter')
  await expect(select).toBeVisible()

  const options = await select.locator('option').allTextContents()
  expect(options[0]).toMatch(/^01 · /)
  const steps = options.map((o) => parseInt(o, 10))
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i]).toBeGreaterThan(steps[i - 1])
  }

  const target = options.find((o) => o.startsWith('13'))
  expect(target).toBeTruthy()
  await select.selectOption({ label: target! })

  const article = page.locator('article[aria-live="polite"]')
  await expect(article.locator('h3')).toHaveText(target!)
  const muralImgs = article.locator('img[src*="/murals/"]')
  expect(await muralImgs.count()).toBeGreaterThan(0)
  await expect(muralImgs.first()).toBeVisible()

  const before = await article.locator('h3').textContent()
  await page.getByRole('button', { name: 'Next ›' }).click()
  await expect(article.locator('h3')).not.toHaveText(before!)

  expect(realErrors(errors)).toEqual([])
})

test('/classic build log: pictures page with arrows, and progress dots light up', async ({
  page,
}) => {
  await page.goto('/classic', { waitUntil: 'networkidle' })
  const rail = page.locator('[aria-label="Build log progress"]')
  await expect(rail).toBeVisible()
  const lit = rail.locator('[data-seen]')
  // Only the chapter you land on is lit to begin with.
  await expect(lit).toHaveCount(1)

  // Each Next lights one more, left to right.
  await page.getByRole('button', { name: 'Next ›' }).click()
  await expect(lit).toHaveCount(2)
  await page.getByRole('button', { name: 'Next ›' }).click()
  await expect(lit).toHaveCount(3)
  // Stepping BACK must not un-light what you have already read.
  await page.getByRole('button', { name: '‹ Previous' }).click()
  await expect(lit).toHaveCount(3)

  // A dot jumps straight to its chapter.
  await rail.getByRole('button').nth(8).click()
  await expect(page.getByRole('heading', { name: /^09 · / })).toBeVisible()

  // The chapter's pictures page with arrows and wrap.
  const caption = page.locator('article figcaption span').first()
  const first = await caption.textContent()
  await page.getByRole('button', { name: 'Next picture' }).click()
  await expect(page.getByText('2 of 2')).toBeVisible()
  expect(await caption.textContent()).not.toBe(first)
  await page.getByRole('button', { name: 'Next picture' }).click()
  await expect(page.getByText('1 of 2')).toBeVisible()
  expect(await caption.textContent()).toBe(first)
})
