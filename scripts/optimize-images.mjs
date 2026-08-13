// Photo pipeline (Phase 4): drop originals (jpg/png/webp/avif, any
// size) into staging/photos/, run `node scripts/optimize-images.mjs`,
// and collect per photo in src/assets/photos/:
//   <slug>.webp        — web size, longest edge <= 1800 px, q0.80
//                        (retry q0.65 if over ~300 KB)
//   <slug>.thumb.webp  — grid thumbnail, longest edge 480 px, q0.75
// plus a paste-ready snippet for src/content/photos.ts including the
// web image's intrinsic dimensions (layout never guesses ratios).
// Originals never ship; staging/ is gitignored.
//
// No new dependencies: decode/resize/encode happens in a canvas inside
// headless Chromium via Playwright (already a devDependency). WebP-only
// output is deliberate: every supported browser decodes WebP, so a JPEG
// fallback would double the asset set for zero users.
import { chromium } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const STAGING = resolve('staging/photos')
const OUT = resolve('src/assets/photos')
const WEB_EDGE = 1800
const THUMB_EDGE = 480
const WEB_TARGET_BYTES = 300 * 1024

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
const entries = []
for (const file of files) {
  const src = join(STAGING, file)
  const inBytes = statSync(src).size
  const dataUrl = `data:image/${extname(file).slice(1)};base64,${readFileSync(src).toString('base64')}`
  const encode = async (longEdge, quality) =>
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
      { dataUrl, longEdge, quality },
    )
  let web = await encode(WEB_EDGE, 0.8)
  let webBuf = Buffer.from(web.out, 'base64')
  if (webBuf.length > WEB_TARGET_BYTES) {
    web = await encode(WEB_EDGE, 0.65)
    webBuf = Buffer.from(web.out, 'base64')
  }
  const thumb = await encode(THUMB_EDGE, 0.75)
  const thumbBuf = Buffer.from(thumb.out, 'base64')

  const slug = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  writeFileSync(join(OUT, `${slug}.webp`), webBuf)
  writeFileSync(join(OUT, `${slug}.thumb.webp`), thumbBuf)
  console.log(
    `${file} (${(inBytes / 1024).toFixed(0)} KB) -> ${slug}.webp ${web.w}x${web.h} (${(webBuf.length / 1024).toFixed(0)} KB) + thumb ${thumb.w}x${thumb.h} (${(thumbBuf.length / 1024).toFixed(0)} KB)${webBuf.length > WEB_TARGET_BYTES ? '  ⚠ web still over 300 KB — consider cropping' : ''}`,
  )
  entries.push({ slug, w: web.w, h: web.h })
}
await browser.close()

const varName = (slug) => slug.replace(/-(\w)/g, (_, c) => c.toUpperCase())
console.log('\nPaste-ready for src/content/photos.ts:\n')
for (const e of entries) {
  console.log(`import ${varName(e.slug)}Full from '../assets/photos/${e.slug}.webp'`)
  console.log(`import ${varName(e.slug)}Thumb from '../assets/photos/${e.slug}.thumb.webp'`)
}
console.log('')
for (const e of entries)
  console.log(
    `  { id: '${e.slug}', full: ${varName(e.slug)}Full, thumb: ${varName(e.slug)}Thumb, width: ${e.w}, height: ${e.h}, alt: 'TODO', title: 'TODO' },`,
  )
