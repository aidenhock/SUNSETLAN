import { describe, expect, it } from 'vitest'
import { interactables } from '../content/interactables'
import { placement } from '../content/placements'
import { latLongToUnit } from '../controls/planetMath'
import { blockers, MAP } from './planetConfig'

/**
 * PARITY GUARD for the placement migration.
 *
 * Placements used to live in three places — a monuments file, a scatter
 * table, and a hand-written blocker list. They are one file now
 * (`content/placements.json`), and these digests are the proof the
 * world did not shift by a millimetre on the way, plus the tripwire if
 * a future edit moves something by accident.
 *
 * The pre-migration world was 86 blockers, digest 8bf80257. The current world is 86 with the signpost added since. Exactly one
 * entry was dropped: a second blocker on the mailbox (r 0.5) that sat
 * at the same point as the mailbox's own interactable blocker (r 0.6)
 * and was therefore strictly inside it — nothing the player could ever
 * touch. The third test below reconstructs the old list from the new
 * one to show that is the ONLY difference.
 *
 * If you MEANT to move something, change the JSON (by hand or with the
 * editor) and update these digests in the same commit, so a moved world
 * shows up in review instead of slipping through.
 */

/** FNV-1a over a canonical dump: order-independent, precision-pinned. */
function digest(lines: string[]): string {
  let h = 0x811c9dc5
  for (const line of [...lines].sort()) {
    for (let i = 0; i < line.length; i++) {
      h ^= line.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h.toString(16).padStart(8, '0')
}

const dumpBlockers = (list: typeof blockers) =>
  list.map(
    (b) =>
      `${b.unit.x.toFixed(6)},${b.unit.y.toFixed(6)},${b.unit.z.toFixed(6)},${b.radius.toFixed(4)}`,
  )

/**
 * Props added AFTER the migration. The proof below reconstructs the old
 * world, so anything that did not exist then has to come back out of it.
 * Add an id here in the same commit that adds the prop.
 */
const ADDED_SINCE_MIGRATION = ['signpost', 'paintings', 'covers']

const isRecent = (b: (typeof blockers)[number]) =>
  ADDED_SINCE_MIGRATION.some((id) => {
    const p = placement(id)
    const u = latLongToUnit(p.lat, p.long)
    return Math.abs(u.x - b.unit.x) < 1e-9 && Math.abs(u.z - b.unit.z) < 1e-9
  })

describe('world parity', () => {
  it('keeps every blocker where it was', () => {
    expect(blockers.length).toBe(86)
    expect(digest(dumpBlockers(blockers))).toBe('d652b65a')
  })

  it('keeps every interactable exactly where it was', () => {
    const dump = interactables.map(
      (d) =>
        `${d.id}|${d.position.map((n) => n.toFixed(6)).join(',')}|${d.rotation
          .map((n) => n.toFixed(6))
          .join(',')}|${d.blockRadius ?? ''}|${d.modal}`,
    )
    expect(interactables.length).toBe(14)
    // Was byte-identical to the pre-migration build; the telescope has
    // been added since, which is why this no longer reads 6d7f4d8c. The
    // paintings/covers easel + mic stand interactables (TASK: paintings
    // & covers) are why this no longer reads f0b0bafc.
    expect(digest(dump)).toBe('686e9faa')
  })

  it('differs from the pre-migration world by exactly the redundant mailbox blocker', () => {
    const mailbox = placement('contact')
    const restored = [
      ...blockers.filter((b) => !isRecent(b)),
      { unit: latLongToUnit(mailbox.lat, mailbox.long), radius: 0.5 },
    ]
    expect(restored.length).toBe(86)
    expect(digest(dumpBlockers(restored))).toBe('8bf80257')
  })

  it('still derives the world map table CLAUDE.md documents', () => {
    // Island's static props read MAP, so these are the numbers that put
    // the palapa, the crate, the boat and the fire where they belong.
    // Written out rather than digested: a human should be able to check
    // this against the table in CLAUDE.md without running anything.
    expect(MAP.tripod).toEqual({ lat: 14, long: 0 })
    expect(MAP.mailbox).toEqual({ lat: 24, long: 6 })
    expect(MAP.bulletinBoard).toEqual({ lat: 45, long: 343 })
    expect(MAP.hedgeStone).toEqual({ lat: 50, long: 300 })
    expect(MAP.palapa).toEqual({ lat: 40, long: 40 })
    expect(MAP.musicUkulele).toEqual({ lat: 22, long: 173 })
    expect(MAP.tv).toEqual({ lat: 21, long: 150 })
    expect(MAP.campfire).toEqual({ lat: 22, long: 180 })
    expect(MAP.rowboat).toEqual({ lat: 18, long: 210 })
    expect(MAP.cemetery).toEqual({ lat: 47, long: 107 })
    expect(MAP.matrixPortal).toEqual({ lat: 32, long: 97 })
    expect(MAP.ukulelePlayer).toEqual({ lat: 18, long: 359.05 })
    expect(MAP.logs).toEqual([
      { lat: 25.3, long: 180, yaw: 0 },
      { lat: 23.4, long: 176.7, yaw: (54.4 * Math.PI) / 180 },
      { lat: 23.4, long: 183.3, yaw: (-54.4 * Math.PI) / 180 },
    ])
  })
})
