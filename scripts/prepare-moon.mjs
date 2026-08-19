/**
 * Prepares Aiden's moon photograph for the telescope.
 *
 *   node scripts/prepare-moon.mjs "fullmoon12 (1).png"
 *
 * The telescope draws the disc clipped to a circle and lays the
 * terminator over it, which only works if the moon FILLS the frame
 * exactly — a photo with sky around it would show a black ring inside
 * the eyepiece. So this finds the lit disc by luminance, crops a square
 * around it, scales it down and writes public/moon/moon.jpg.
 *
 * Same headless-Chromium canvas trick as optimize-images.mjs: no image
 * library, no new dependencies.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/prepare-moon.mjs <path to photo>')
  process.exit(1)
}
const OUT_DIR = 'public/moon'
const OUT = `${OUT_DIR}/moon.jpg`
const SIZE = 720
/** Anything above this luminance counts as moon rather than sky. */
const THRESHOLD = 28
/** A little air so the limb isn't shaved by the crop. */
const MARGIN = 0.015

const dataUrl = `data:image/png;base64,${readFileSync(resolve(source)).toString('base64')}`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 64, height: 64 } })

const result = await page.evaluate(
  async ({ dataUrl, SIZE, THRESHOLD, MARGIN }) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()

    // Find the disc: the bounding box of everything bright enough to be
    // the moon rather than the sky around it.
    const probe = document.createElement('canvas')
    probe.width = img.naturalWidth
    probe.height = img.naturalHeight
    const pctx = probe.getContext('2d')
    pctx.drawImage(img, 0, 0)
    const { data } = pctx.getImageData(0, 0, probe.width, probe.height)
    let minX = probe.width
    let minY = probe.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        const i = (y * probe.width + x) * 4
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        if (lum < THRESHOLD || data[i + 3] < 8) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0) return { error: 'no bright pixels found — is this a photo of the moon?' }

    // Square the box on the disc's centre so the crop stays circular.
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const half = (Math.max(maxX - minX, maxY - minY) / 2) * (1 + MARGIN)

    const out = document.createElement('canvas')
    out.width = SIZE
    out.height = SIZE
    const octx = out.getContext('2d')
    octx.fillStyle = '#05070c'
    octx.fillRect(0, 0, SIZE, SIZE)
    octx.drawImage(img, cx - half, cy - half, half * 2, half * 2, 0, 0, SIZE, SIZE)
    return {
      source: `${img.naturalWidth}×${img.naturalHeight}`,
      disc: `${Math.round(half * 2)}px across, centred at ${Math.round(cx)},${Math.round(cy)}`,
      jpeg: out.toDataURL('image/jpeg', 0.88),
    }
  },
  { dataUrl, SIZE, THRESHOLD, MARGIN },
)

await browser.close()
if (result.error) {
  console.error(result.error)
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT), Buffer.from(result.jpeg.split(',')[1], 'base64'))
console.log(`source ${result.source}`)
console.log(`disc   ${result.disc}`)
console.log(`wrote  ${OUT} — ${SIZE}×${SIZE}, ${(statSync(resolve(OUT)).size / 1024).toFixed(0)} KB`)
