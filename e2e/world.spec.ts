import { expect, test } from '@playwright/test'
import { collectErrors, gotoWorld, realErrors, sprintUntil } from './helpers'

test('desktop: spawn view, pointer lock, sprint to the dock, modal round-trip', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)

  // Loading finishes and the intro hint shows.
  const hint = page.getByText('WASD / drag to move', { exact: false })
  await expect(hint).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1000)

  // Pointer lock round-trip at spawn, away from any clickable mesh.
  await page.mouse.click(640, 560)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => document.pointerLockElement !== null)).toBe(true)
  await expect(page.getByText('Click to look around', { exact: false })).toBeHidden()
  await page.mouse.move(900, 300)
  await page.waitForTimeout(200)
  // Esc release is browser UI that synthetic keys can't trigger headless;
  // exitPointerLock() exercises the same unlock path.
  await page.evaluate(() => document.exitPointerLock())
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true)
  await expect(page.getByText('Click to resume', { exact: false })).toBeVisible()

  // Sprint down the meridian-0 dock until the Photos prompt fires.
  // R=55: walk (6.5 m/s) would need ~11.5 s; sprint (10 m/s) ~7.5 s — the
  // time bound discriminates and doubles as the sprint regression check.
  const prompt = page.locator('kbd', { hasText: 'E' })
  const ms = await sprintUntil(page, Math.PI, () => prompt.isVisible())
  await expect(prompt).toBeVisible()
  expect(ms, 'sprint should reach the dock end in well under walk time').toBeLessThan(10_000)
  await expect(hint).toBeHidden()

  // E opens the gallery modal; Escape closes it.
  await page.keyboard.press('KeyE')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 3000 })
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Jump is cosmetic but should not error.
  await page.keyboard.press('Space')
  await page.waitForTimeout(400)

  expect(realErrors(errors)).toEqual([])
})

test('desktop: sit system — E sits and stands, movement suppressed while seated', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(1000)

  // The 0.4 s sit/stand world tween stretches under slow headless first
  // frames (dt clamps at 0.05), so never assert on fixed delays: wait for
  // the world to stop moving instead.
  const settlePolar = async () => {
    await page.evaluate(() => {
      delete (window as unknown as { __polarPrev?: number }).__polarPrev
    })
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __polarPrev?: number } & Window
        const p = w.__controls!.surfPolarDeg
        const prev = w.__polarPrev
        w.__polarPrev = p
        return prev !== undefined && Math.abs(p - prev) < 0.001
      },
      undefined,
      { polling: 250, timeout: 10_000 },
    )
  }

  // Teleport just seaward of the center log (lat 25.3), facing it.
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 23.6, long: 180 }
    window.__controls!.azimuthOverride = Math.PI
  })
  await page.waitForTimeout(700)
  expect(await page.evaluate(() => window.__store!.getState().nearbyLog)).toBe(0)
  await expect(page.getByText('Sit')).toBeVisible()

  // E sits: free-position — aiming straight at the log center projects
  // to its middle; the world tween parks the seat under the pole and
  // suppresses movement.
  await page.keyboard.press('KeyE')
  await settlePolar()
  const seat = await page.evaluate(() => window.__store!.getState().seatedSeat)
  expect(seat?.log).toBe(0)
  expect(Math.abs(seat?.offsetM ?? 99)).toBeLessThan(0.2)
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(true)
  const seatedPolar = await page.evaluate(() => window.__controls!.surfPolarDeg)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyW')
  expect(
    Math.abs((await page.evaluate(() => window.__controls!.surfPolarDeg)) - seatedPolar),
    'holding W while seated must not rotate the world',
  ).toBeLessThan(0.01)

  // E again stands up just in front of the seat (fire side) and movement
  // comes back.
  await page.keyboard.press('KeyE')
  await settlePolar()
  expect(await page.evaluate(() => window.__store!.getState().seatedSeat)).toBeNull()
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(false)
  const stood = await page.evaluate(() => [
    window.__controls!.surfPolarDeg,
    window.__controls!.surfLongDeg,
  ])
  // Walk EAST along the sand — the stand spot is inside the log blocker's
  // radius (that's the point of it), so walking north into the log is
  // correctly a wall; east is open ground (and shows up in longitude).
  await page.evaluate(() => {
    window.__controls!.azimuthOverride = Math.PI / 2
  })
  await page.waitForTimeout(150)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyW')
  const moved = await page.evaluate(() => [
    window.__controls!.surfPolarDeg,
    window.__controls!.surfLongDeg,
  ])
  expect(
    Math.abs(moved[0] - stood[0]) + Math.abs(moved[1] - stood[1]),
    'movement must resume after standing',
  ).toBeGreaterThan(0.2)

  // Jump also stands up — and an AIMED sit lands off-center on the wood
  // (continuous projection, not a slot).
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 23.6, long: 180 }
    window.__controls!.azimuthOverride = Math.PI + 0.2
  })
  await page.waitForTimeout(500)
  await page.keyboard.press('KeyE')
  await settlePolar()
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(true)
  const aimed = await page.evaluate(() => window.__store!.getState().seatedSeat)
  expect(Math.abs(aimed?.offsetM ?? 0)).toBeGreaterThan(0.3)
  expect(Math.abs(aimed?.offsetM ?? 99)).toBeLessThanOrEqual(0.7)
  // Hold Space long enough to span a frame — the controller POLLS the key
  // map, so a synthetic instant press can fall between slow headless
  // frames (a real tap always spans several).
  await page.keyboard.down('Space')
  await page.waitForTimeout(250)
  await page.keyboard.up('Space')
  await settlePolar()
  expect(await page.evaluate(() => window.__controls!.seated)).toBe(false)

  expect(realErrors(errors)).toEqual([])
})

test('desktop: minimap — visible by default, M toggles, menu toggles, marker canvas draws', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(800)
  const map = page.locator('[data-minimap]')
  await expect(map).toBeVisible()
  // The canvas actually paints (not a blank surface).
  const painted = await page.evaluate(() => {
    const c = document.querySelector('[data-minimap]') as HTMLCanvasElement
    const ctx = c.getContext('2d')!
    const px = ctx.getImageData(0, 0, c.width, c.height).data
    let nonZero = 0
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) nonZero++
    return nonZero
  })
  expect(painted).toBeGreaterThan(1000)
  // M hides, M shows.
  await page.keyboard.press('KeyM')
  await expect(map).toBeHidden()
  await page.keyboard.press('KeyM')
  await expect(map).toBeVisible()
  // Menu toggle works too.
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: /Minimap: on/ }).click()
  await expect(map).toBeHidden()
  await page.getByRole('button', { name: /Minimap: off/ }).click()
  await expect(map).toBeVisible()
  expect(realErrors(errors)).toEqual([])
})

test('desktop: rift room — walk in, read a mural, walk back out', async ({ page }) => {
  const errors = collectErrors(page)
  await gotoWorld(page)
  await page.waitForTimeout(800)

  // Walk up to the rift (lat 32 / long 97): the prompt fires.
  await page.evaluate(() => {
    window.__controls!.poseOverride = { lat: 34.4, long: 97 }
    window.__controls!.azimuthOverride = Math.PI
  })
  await page.waitForTimeout(700)
  await expect(page.getByText('Step through')).toBeVisible()

  // E steps through into the room — a place, not a dialog.
  await page.keyboard.press('KeyE')
  await page.waitForFunction(() => window.__store!.getState().inRoom, undefined, {
    timeout: 5000,
  })
  await page.waitForTimeout(1200)
  await expect(page.getByRole('dialog')).toBeHidden()

  // The room is WALKABLE: holding W moves the player through room space.
  const before = await page.evaluate(() => ({ x: window.__room!.x, z: window.__room!.z }))
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(700)
  await page.keyboard.up('KeyW')
  const after = await page.evaluate(() => ({ x: window.__room!.x, z: window.__room!.z }))
  expect(
    Math.hypot(after.x - before.x, after.z - before.z),
    'walking must move the player inside the room',
  ).toBeGreaterThan(1.5)

  // Walls stop you: run at one long enough to cross the room twice.
  await page.evaluate(() => {
    window.__controls!.azimuthOverride = 0
  })
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(2500)
  await page.keyboard.up('KeyW')
  const walled = await page.evaluate(() => ({ x: window.__room!.x, z: window.__room!.z }))
  expect(Math.abs(walled.x), 'the east/west walls hold').toBeLessThanOrEqual(15)
  expect(Math.abs(walled.z), 'the north/south walls hold').toBeLessThanOrEqual(10)

  // Stand in front of a mural: the prompt names it, E opens the chapter.
  await page.evaluate(() => {
    window.__room!.x = -13
    window.__room!.z = -8.5
  })
  await page.waitForTimeout(500)
  await expect(page.getByText('The world turns, you do not')).toBeVisible()
  await page.keyboard.press('KeyE')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 3000 })
  await expect(
    page.getByRole('heading', { name: 'The world that turns beneath you' }),
  ).toBeVisible()
  // It renders the REAL build-time code excerpt, not prose about code.
  await page.getByText('How it works').click()
  await expect(page.locator('pre', { hasText: 'export function rotationStep' }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // The minimap follows you into the room (rectangle, not island).
  await expect(page.locator('[data-minimap]')).toHaveAttribute(
    'aria-label',
    'Map of the build-log room',
  )

  // Walk back into the rift at the centre and step out.
  await page.evaluate(() => {
    window.__room!.x = 0
    window.__room!.z = 0
  })
  await page.waitForTimeout(500)
  await expect(page.getByText('Step back through')).toBeVisible()
  await page.keyboard.press('KeyE')
  await page.waitForFunction(() => !window.__store!.getState().inRoom, undefined, {
    timeout: 5000,
  })

  // The island takes over again: walking rotates the world.
  await page.waitForTimeout(600)
  const polar = await page.evaluate(() => window.__controls!.surfPolarDeg)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyW')
  expect(
    Math.abs((await page.evaluate(() => window.__controls!.surfPolarDeg)) - polar),
    'movement must resume on the island',
  ).toBeGreaterThan(0.1)

  expect(realErrors(errors)).toEqual([])
})
