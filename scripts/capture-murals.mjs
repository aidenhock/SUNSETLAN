/**
 * Captures the screenshots hung on the build-log room's walls.
 *
 * Each mural gets one or more shots, written to
 * public/murals/<id>-<n>.jpg in the same order the mural declares them
 * in src/content/murals.ts (the modal pages through them with arrows).
 * Rerun whenever the world's look changes and the room updates itself:
 *
 *   npm run build && npx vite preview --port 4173
 *   node scripts/capture-murals.mjs [muralId ...]
 *
 * Pass ids to recapture only those. Same headless-Chromium approach as
 * the other scripts here — no new dependencies. The HUD is hidden for
 * every shot except the ones that are ABOUT the HUD.
 *
 * Shot options: lat/long/az (required), pitch, dist, night, hud,
 * modal (opens a modal by id), room ({x, z} — enters the rift room).
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173'
const OUT = 'public/murals'

const SHOTS = {
  'fixed-pole': [
    { lat: 90, long: 0, az: Math.PI, dist: 9, pitch: 0.3 },
    { lat: 28, long: 180, az: 0, dist: 8, pitch: 0.25, night: true },
  ],
  'analytic-ground': [
    { lat: 19, long: 0, az: 0, dist: 7, pitch: 0.35 },
    { lat: 45, long: 40, az: Math.PI, dist: 6, pitch: 0.3 },
  ],
  'two-skies': [
    { lat: 30, long: 350, az: Math.PI * 1.4, pitch: 0.05 },
    { lat: 30, long: 170, az: Math.PI * 0.4, pitch: 0.05, night: true },
    { lat: 34, long: 90, az: Math.PI / 2, pitch: 0.02 },
  ],
  'celestial-arc': [
    { lat: 55, long: 0, az: Math.PI, pitch: 0.12 },
    { lat: 16, long: 0, az: Math.PI, pitch: 0.06 },
  ],
  glitter: [
    { lat: 15.5, long: 0, az: Math.PI, pitch: 0.02 },
    { lat: 15.5, long: 180, az: 0, pitch: 0.02, night: true },
  ],
  'character-rig': [
    { lat: 60, long: 200, az: 0, dist: 3.2, pitch: 0.25 },
    { lat: 60, long: 200, az: Math.PI * 0.75, dist: 4, pitch: 0.3, walk: true },
  ],
  audio: [
    { lat: 20, long: 359, az: Math.PI, dist: 5, pitch: 0.3 },
    { lat: 24, long: 180, az: Math.PI, dist: 6, pitch: 0.3, night: true },
  ],
  'memorial-garden': [
    { lat: 39, long: 107, az: 0, dist: 8, pitch: 0.3 },
    { lat: 46, long: 107, az: 0, dist: 6, pitch: 0.25, night: true },
    { lat: 47, long: 107, az: 0, dist: 26, pitch: 1.15 },
  ],
  minimap: [
    { lat: 45, long: 20, az: 0, hud: true },
    { lat: 34.2, long: 97, az: 0, hud: true, room: { x: -6, z: 6 } },
  ],
  'content-pipeline': [
    { lat: 45, long: 20, az: 0, modal: 'photos' },
    { lat: 45, long: 20, az: 0, path: '/classic', scrollTo: '#projects-h' },
  ],
  'hedge-stone': [
    { lat: 47, long: 300, az: 0, dist: 6, pitch: 0.25 },
    { lat: 53, long: 300, az: Math.PI, dist: 6, pitch: 0.25 },
  ],
  'one-terrain': [
    { lat: 22, long: 60, az: Math.PI, pitch: 0.15 },
    { lat: 14.6, long: 60, az: Math.PI, pitch: 0.1 },
  ],
  'bulletin-board': [
    { lat: 42, long: 343, az: 0, dist: 5, pitch: 0.25 },
    { lat: 42, long: 343, az: 0, dist: 5, pitch: 0.25, modal: 'papers' },
  ],
  'matrix-room': [
    { lat: 35.2, long: 97, az: 0, pitch: 0.1, night: true },
    { lat: 34.2, long: 97, az: 0, pitch: -0.05, room: { x: 0, z: 8 } },
  ],
  'self-hosted-fonts': [{ lat: 45, long: 20, az: 0, path: '/classic' }],
  'world-index': [
    { lat: 90, long: 0, az: Math.PI, dist: 30, pitch: 0.75 },
    { lat: 40, long: 60, az: 0, hud: true, dist: 9, pitch: 0.4 },
  ],
  budgets: [
    { lat: 35, long: 180, az: Math.PI, dist: 14, pitch: 0.4, night: true },
    { lat: 14, long: 45, az: 0, dist: 18, pitch: 0.55 },
  ],
}

const only = process.argv.slice(2)
const ids = Object.keys(SHOTS).filter((id) => only.length === 0 || only.includes(id))
if (only.length && ids.length === 0) {
  console.error(`No murals matched: ${only.join(', ')}`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(`${BASE}/?e2e`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__controls !== undefined, undefined, { timeout: 30000 })
await page.waitForTimeout(2000)

let written = 0
for (const id of ids) {
  const shots = SHOTS[id]
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]
    // Always start from a clean slate: no modal, no room, day sky.
    await page.evaluate(() => {
      const s = window.__store.getState()
      s.closeModal()
      if (s.inRoom) s.exitRoom()
      delete window.__nightMixOverride
      window.__controls.camDist = null
    })
    await page.waitForTimeout(250)

    await page.evaluate((s) => {
      const c = window.__controls
      c.poseOverride = { lat: s.lat, long: s.long }
      c.azimuthOverride = s.az
      c.pitchOverride = s.pitch ?? 0.35
      c.camDist = s.dist ?? null
      if (s.night) window.__nightMixOverride = 1
      // Clean plate: the HUD is chrome, not the feature — unless the
      // shot is OF the HUD.
      const style = document.getElementById('mural-clean') ?? document.createElement('style')
      style.id = 'mural-clean'
      style.textContent = s.hud
        ? ''
        : 'div.inset-0.z-30{display:none !important}[data-minimap]{display:none !important}'
      document.head.appendChild(style)
    }, shot)
    await page.waitForTimeout(900)

    if (shot.path) {
      // A shot of another page (the classic site). Go there, frame it,
      // then come back to the world for whatever follows.
      await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' })
      if (shot.scrollTo) {
        await page.locator(shot.scrollTo).scrollIntoViewIfNeeded()
        await page.waitForTimeout(400)
      }
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/${id}-${i + 1}.jpg`, type: 'jpeg', quality: 78 })
      written++
      console.log(`${id}-${i + 1}.jpg`)
      await page.goto(`${BASE}/?e2e`, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => window.__controls !== undefined, undefined, {
        timeout: 30000,
      })
      await page.waitForTimeout(1600)
      continue
    }

    if (shot.room) {
      await page.evaluate((r) => {
        window.__store.getState().enterRoom()
        setTimeout(() => {
          window.__room.x = r.x
          window.__room.z = r.z
        }, 400)
      }, shot.room)
      await page.waitForTimeout(2200)
    }
    if (shot.modal) {
      await page.evaluate((m) => window.__store.getState().openModal(m), shot.modal)
      await page.waitForTimeout(700)
    }
    // A held key makes the run animation read in the frame.
    if (shot.walk) {
      await page.keyboard.down('KeyW')
      await page.keyboard.down('ShiftLeft')
      await page.waitForTimeout(700)
    }

    await page.screenshot({ path: `${OUT}/${id}-${i + 1}.jpg`, type: 'jpeg', quality: 78 })
    if (shot.walk) {
      await page.keyboard.up('ShiftLeft')
      await page.keyboard.up('KeyW')
    }
    written++
    console.log(`${id}-${i + 1}.jpg`)
  }
}

await browser.close()
console.log(`\n${written} shots across ${ids.length} murals → ${OUT}/`)
