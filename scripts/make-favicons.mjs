/**
 * Renders public/favicon.svg to the PNG sizes browsers and mobile
 * launchers ask for. Uses the same headless-Chromium trick as
 * optimize-images.mjs / capture-og.mjs — no new dependencies, no
 * image library. Rerunnable; only touches public/.
 *
 *   node scripts/make-favicons.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SIZES = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['favicon-192.png', 192],
  ['favicon-512.png', 512],
  ['apple-touch-icon.png', 180],
]

const svg = readFileSync(resolve('public/favicon.svg'), 'utf8')
const browser = await chromium.launch()

for (const [name, size] of SIZES) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  })
  await page.setContent(
    `<!doctype html><style>
       html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}
     </style>${svg}`,
  )
  const buf = await page.screenshot({ omitBackground: true })
  writeFileSync(resolve('public', name), buf)
  await page.close()
  console.log(`${name} — ${size}×${size}, ${buf.length} bytes`)
}

await browser.close()
