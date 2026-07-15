import { expect, test } from '@playwright/test'
import { collectErrors, gotoWorld, realErrors } from './helpers'

const CASES: [string, string][] = [
  ['music', 'Music'],
  ['photos', 'Photos'],
  ['projects', 'Projects'],
  ['about', "Hey, I'm Aiden"],
  ['videos', 'Videos'],
  ['contact', 'Contact'],
]

test('every modal type opens from data; gallery lightbox and lite-embed work', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  const dialog = page.getByRole('dialog')

  for (const [id, heading] of CASES) {
    await page.evaluate((mid) => window.__store.getState().openModal(mid), id)
    await expect(dialog).toBeVisible({ timeout: 2000 })
    await expect(page.getByRole('heading', { name: heading, exact: false })).toBeVisible()

    if (id === 'photos') {
      // Lightbox: open first photo, arrow-key nav, Esc back to grid only.
      await page.locator('ul button').first().click()
      const nextBtn = page.getByRole('button', { name: 'Next photo' })
      await expect(nextBtn).toBeVisible()
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(150)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      await expect(nextBtn).toBeHidden()
      await expect(dialog).toBeVisible()
    }

    if (id === 'videos') {
      // Lite-embed: thumbnail first, iframe only after Play.
      const play = page.getByRole('button', { name: /Play Big Buck Bunny/ })
      await expect(play).toBeVisible()
      await play.click()
      await expect(page.locator('iframe[title*="Big Buck Bunny"]')).toBeVisible({
        timeout: 3000,
      })
    }

    await page.evaluate(() => window.__store.getState().closeModal())
    await expect(dialog).toBeHidden()
  }

  expect(realErrors(errors)).toEqual([])
})
