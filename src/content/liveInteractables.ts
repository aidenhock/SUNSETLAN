import { useMemo } from 'react'
import { latLongToPosition } from '../controls/planetMath'
import { groundAltitudeAt } from '../controls/terrain'
import { PLANET_RADIUS, SINK_M } from '../scene/planetConfig'
import { usePlacementRuntime } from '../scene/placementRuntime'
import { interactables, type InteractableDef } from './interactables'

/**
 * The interactables, positioned from the LIVE placement list.
 *
 * Their definitions — which modal they open, what the prompt says, how
 * big their blocker is — stay in `interactables.ts`; only where they
 * stand comes from the placements. That's what lets the dev editor drag
 * a portal (or a headstone, when its monument moves) and see the actual
 * prop follow, instead of the data moving while the mesh stays put.
 *
 * In production the placements never change, so this returns the same
 * array the file always described.
 */
export function useLiveInteractables(): InteractableDef[] {
  const list = usePlacementRuntime((s) => s.list)
  return useMemo(
    () =>
      interactables.map((def) => {
        const p = list.find((x) => x.id === def.id)
        if (!p) return def
        const lift = p.liftM ?? 0
        return {
          ...def,
          position: latLongToPosition(
            p.lat,
            p.long,
            PLANET_RADIUS,
            groundAltitudeAt(p.lat, p.long) - SINK_M + lift,
          ),
          rotation: [def.rotation[0], (p.yawDeg * Math.PI) / 180, def.rotation[2]] as [
            number,
            number,
            number,
          ],
          blockRadius: p.blockerRadiusM ?? def.blockRadius,
        }
      }),
    [list],
  )
}
