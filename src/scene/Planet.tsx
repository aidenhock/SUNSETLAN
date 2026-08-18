import { lazy, Suspense, useRef } from 'react'
import * as THREE from 'three'
import { AudioBoot } from '../audio/AudioBoot'
import { useIntroSwoop } from '../controls/useIntroSwoop'
import { usePlanetController } from '../controls/usePlanetController'
import { useRoomController } from '../controls/useRoomController'
import { usePointerLockCamera } from '../controls/usePointerLockCamera'
import { useLiveInteractables } from '../content/liveInteractables'
import { useStore } from '../store/useStore'
import { useMusicMix, WorldEmitters } from './AudioEmitters'
import { Avatar } from './Avatar'
import { CelestialDome } from './CelestialDome'
import { Clouds } from './Clouds'
import { Cemetery } from './Cemetery'
import { Crabs } from './Crabs'
import { Fire } from './Fire'
import { Interactable } from './Interactable'
import { Island } from './Island'
import { PLANET_RADIUS } from './planetConfig'
import { Seagulls } from './Seagulls'
import { ShootingStars } from './ShootingStars'
import { SkyRig } from './SkyRig'
import { UkulelePlayer } from './UkulelePlayer'
import { WadeRipple } from './WadeRipple'
import { Water } from './Water'

/** The build-log room — code-split, only fetched when you step through. */
const RoomScene = lazy(() => import('./RoomScene').then((m) => ({ default: m.RoomScene })))

/** Dev-only: the editor's picking, rings and drag handles. Same
 *  DEV-guarded dynamic import as the panel, so prod emits no chunk. */
type EditorSceneProps = { planetRef: React.RefObject<THREE.Group | null> }

const EditorScene = lazy<React.ComponentType<EditorSceneProps>>(async () => {
  if (!import.meta.env.DEV) return { default: () => null }
  const m = await import('../editor/EditorScene')
  return { default: m.EditorScene }
})

/**
 * The whole rotating world. One group owns the planet quaternion; the avatar
 * stays fixed at the pole. Ground height is analytic (see groundHeightAt in
 * usePlanetController) — nothing here is raycast. The touch joystick is a DOM
 * overlay owned by App.
 */
export function PlanetScene({
  isTouch,
  intro,
  editing = false,
}: {
  isTouch: boolean
  intro: boolean
  editing?: boolean
}) {
  const planetRef = useRef<THREE.Group>(null)
  const avatarRef = useRef<THREE.Group>(null)
  const roomRef = useRef<THREE.Group>(null)

  // Inside the portal the whole planet stops rendering (visible=false
  // skips the subtree) — the room draws against black, so the scene's
  // draw calls drop to the room's own handful instead of stacking.
  const inRoom = useStore((s) => s.inRoom)

  const interactables = useLiveInteractables()

  usePlanetController({ planetRef, avatarRef })
  useRoomController({ roomRef, avatarRef })
  usePointerLockCamera({ avatarRef, isTouch })
  useIntroSwoop({ enabled: intro })
  useMusicMix()

  return (
    <>
      <AudioBoot />
      <SkyRig planetRef={planetRef} />
      <group ref={planetRef} visible={!inRoom}>
        {/* Planet-local sky: the split dome, sun, moon, and stars rotate with
            the world — that is what makes the two moods permanent. */}
        <CelestialDome />
        <Clouds />
        <Seagulls />
        <ShootingStars />
        {/* Ocean floor — the planet body under the water shell. */}
        <mesh>
          <sphereGeometry args={[PLANET_RADIUS - 0.4, 48, 24]} />
          <meshLambertMaterial color="#16565b" flatShading />
        </mesh>
        <Water />
        <Island />
        <UkulelePlayer />
        <Crabs />
        <Fire />
        <Cemetery />
        <WorldEmitters />
        {interactables.map((def) => (
          <Interactable key={def.id} def={def} />
        ))}
        {editing && (
          <Suspense fallback={null}>
            <EditorScene planetRef={planetRef} />
          </Suspense>
        )}
      </group>
      {/* The avatar walks in both places; only the ripple is island-only. */}
      <Avatar ref={avatarRef} />
      {!inRoom && <WadeRipple />}
      {inRoom && (
        <Suspense fallback={null}>
          <RoomScene ref={roomRef} />
        </Suspense>
      )}
    </>
  )
}
