// Photo pipeline (Phase 4): drop originals (jpg/png/webp/avif, any
// size) into staging/photos/, run `node scripts/optimize-images.mjs`,
// and collect resized WebP in src/assets/photos/ plus a paste-ready
// snippet for src/content/photos.ts.
//
// No new dependencies: images are decoded/resized/encoded by a canvas
// inside headless Chromium via Playwright (already a devDependency).
// Rules: long edge ≤ 1600 px, WebP q0.80; if a file still lands over
// ~250 KB it retries at q0.65. Originals are never modified.
import { chromium } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const STAGING = resolve('staging/photos')
const OUT = resolve('src/assets/photos')
const LONG_EDGE = 1600
const TARGET_BYTES = 250 * 1024

const exts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])
let files = []
try {
  files = readdirSync(STAGING).filter((f) => exts.has(extname(f).toLowerCase()))
} catch {
  console.log(`No staging folder yet — create ${STAGING} and drop originals in.`)
  process.exit(0)
}
if (files.length === 0) {
  console.log(`Nothing to do: ${STAGING} has no images.`)
  process.exit(0)
}
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const snippets = []
for (const file of files) {
  const src = join(STAGING, file)
  const inBytes = statSync(src).size
  const dataUrl = `data:image/${extname(file).slice(1)};base64,${readFileSync(src).toString('base64')}`
  const encode = async (quality) =>
    page.evaluate(
      async ({ dataUrl, longEdge, quality }) => {
        const img = new Image()
        await new Promise((res, rej) => {
          img.onload = res
          img.onerror = () => rej(new Error('decode failed'))
          img.src = dataUrl
        })
        const scale = Math.min(1, longEdge / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)
        return { out: canvas.toDataURL('image/webp', quality).split(',')[1], w, h }
      },
      { dataUrl, longEdge: LONG_EDGE, quality },
    )
  let result = await encode(0.8)
  let buf = Buffer.from(result.out, 'base64')
  if (buf.length > TARGET_BYTES) {
    result = await encode(0.65)
    buf = Buffer.from(result.out, 'base64')
  }
  const name = `${basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}.webp`
  writeFileSync(join(OUT, name), buf)
  console.log(
    `${file} (${(inBytes / 1024).toFixed(0)} KB) -> ${name} ${result.w}x${result.h} (${(buf.length / 1024).toFixed(0)} KB)${buf.length > TARGET_BYTES ? '  ⚠ still over 250 KB — consider cropping' : ''}`,
  )
  const varName = name.replace(/\.webp$/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())
  snippets.push({ varName, name })
}
await browser.close()

console.log('\nPaste-ready for src/content/photos.ts:\n')
for (const s of snippets) console.log(`import ${s.varName} from '../assets/photos/${s.name}'`)
console.log('')
for (const s of snippets)
  console.log(`  { src: ${s.varName}, alt: 'TODO describe ${s.name}', caption: 'TODO', location: 'TODO' },`)
