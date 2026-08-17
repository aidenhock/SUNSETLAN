import { describe, expect, it } from 'vitest'
import { buildLogChapters } from './buildLog'
import { muralCover, murals } from './murals'

// Vite's glob, not node:fs — the same "the folder IS the manifest"
// pattern the audio pools use, and it works without node types.
const onDisk = new Set(
  Object.keys(import.meta.glob('../../public/murals/*.jpg')).map((p) => p.split('/').pop()!),
)

/**
 * The room hangs real files on its walls, so a mural declaring a shot
 * that was never captured must fail here — otherwise it ships as an
 * empty black frame that nobody notices until a visitor walks up to it.
 */

describe('murals', () => {
  it('has unique ids and at least one shot each', () => {
    const ids = murals.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of murals) expect(m.shots.length, `${m.id} shots`).toBeGreaterThan(0)
  })

  it('every declared shot exists in public/murals', () => {
    for (const m of murals) {
      for (const shot of m.shots) {
        expect(onDisk.has(shot.file), `${m.id}: missing ${shot.file}`).toBe(true)
      }
    }
  })

  it('leaves no captured shot unused on disk', () => {
    const declared = new Set(murals.flatMap((m) => m.shots.map((s) => s.file)))
    for (const file of onDisk) {
      expect(declared.has(file), `${file} is captured but no mural shows it`).toBe(true)
    }
  })

  it('names shots the way the capture script writes them', () => {
    for (const m of murals) {
      m.shots.forEach((shot, i) => {
        expect(shot.file, `${m.id} shot ${i + 1}`).toBe(`${m.id}-${i + 1}.jpg`)
        expect(shot.caption.length, `${m.id} shot ${i + 1} caption`).toBeGreaterThan(0)
      })
    }
  })

  it('points every mural at a real build-log chapter', () => {
    const ids = new Set(buildLogChapters.map((c) => c.id))
    for (const m of murals) expect(ids.has(m.chapterId), `${m.id} → ${m.chapterId}`).toBe(true)
  })

  it('hangs the first shot on the wall', () => {
    expect(muralCover(murals[0])).toBe(`/murals/${murals[0].shots[0].file}`)
  })
})
