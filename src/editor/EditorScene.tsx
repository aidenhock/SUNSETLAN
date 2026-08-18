import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { latLongToUnit, meridianYaw, surfaceQuaternion } from '../controls/planetMath'
import { controlsRuntime } from '../controls/usePlanetController'
import { groundAltitudeAt } from '../controls/terrain'
import { PLANET_RADIUS, SINK_M } from '../scene/planetConfig'
import { usePlacementRuntime } from '../scene/placementRuntime'

/**
 * The editor's 3D half: a click-catcher over the planet, a ring around
 * whatever is selected, and its blocker drawn as a translucent disc so
 * collision stops being invisible.
 *
 * It lives INSIDE the rotating planet group, so everything here is in
 * planet-local space and nothing has to care where the world has turned
 * to. Picking is analytic rather than a raycast against the terrain
 * mesh: the ray hits a sphere of the planet's radius, and that point
 * converts straight back to lat/long — the same numbers the placement
 * file stores.
 */

const _ray = new THREE.Raycaster()
const _sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), PLANET_RADIUS)
const _hit = new THREE.Vector3()
const _local = new THREE.Vector3()
const _q = new THREE.Quaternion()

/** Where a screen ray meets the planet, as lat/long (null if it misses). */
export function pickLatLong(
  camera: THREE.Camera,
  pointer: THREE.Vector2,
  planet: THREE.Object3D,
): { lat: number; long: number } | null {
  _ray.setFromCamera(pointer, camera)
  if (!_ray.ray.intersectSphere(_sphere, _hit)) return null
  // World → planet-local, so the answer survives the world's rotation.
  _local.copy(_hit).applyQuaternion(_q.copy(planet.quaternion).invert()).normalize()
  const lat = 90 - (Math.acos(THREE.MathUtils.clamp(_local.y, -1, 1)) * 180) / Math.PI
  const long = ((Math.atan2(_local.x, _local.z) * 180) / Math.PI + 360) % 360
  return { lat, long }
}

/** The transform a placement renders at — the same rule the scene uses. */
export function placementMatrix(
  lat: number,
  long: number,
  yawDeg: number,
  scale: number,
  liftM = 0,
  out = new THREE.Matrix4(),
): THREE.Matrix4 {
  const unit = latLongToUnit(lat, long)
  const alt = groundAltitudeAt(lat, long) - SINK_M + liftM
  const quat = surfaceQuaternion(unit).multiply(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, ((yawDeg * Math.PI) / 180) + meridianYaw(lat, long), 0),
    ),
  )
  return out.compose(
    unit.clone().multiplyScalar(PLANET_RADIUS + alt),
    quat,
    new THREE.Vector3(scale, scale, scale),
  )
}

export function EditorScene({ planetRef }: { planetRef: React.RefObject<THREE.Group | null> }) {
  const { camera, gl } = useThree()
  const list = usePlacementRuntime((s) => s.list)
  const selectedId = usePlacementRuntime((s) => s.selectedId)
  const select = usePlacementRuntime((s) => s.select)
  const moveTo = usePlacementRuntime((s) => s.moveTo)
  const startMove = usePlacementRuntime((s) => s.startMove)
  const endMove = usePlacementRuntime((s) => s.endMove)
  const setDrawCalls = usePlacementRuntime((s) => s.setDrawCalls)
  const dragging = useRef(false)
  const ringRef = useRef<THREE.Group>(null)

  const selected = useMemo(() => list.find((p) => p.id === selectedId), [list, selectedId])

  // Publish draw calls so the panel can warn when a placement blows the
  // budget; sampled, not per frame, to keep the store quiet.
  const lastSample = useRef(0)
  useFrame((state) => {
    if (state.clock.elapsedTime - lastSample.current > 0.5) {
      lastSample.current = state.clock.elapsedTime
      setDrawCalls(gl.info.render.calls)
    }
    const ring = ringRef.current
    if (ring && selected) {
      // The ring carries the placement's YAW, so the arrow on it points
      // where the prop faces — rotation you can see, not just a number.
      placementMatrix(selected.lat, selected.long, selected.yawDeg, 1, 0.02, ring.matrix)
      ring.matrix.decompose(ring.position, ring.quaternion, ring.scale)
    }
  })

  const pointerToLatLong = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const planet = planetRef.current
      if (!planet) return null
      const rect = gl.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      return pickLatLong(camera, pointer, planet)
    },
    [camera, gl, planetRef],
  )

  // The catcher: an invisible sphere just under the terrain that takes
  // every click the props don't. Clicking bare ground places or
  // deselects; dragging with something selected moves it.
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!selectedId) return
    dragging.current = true
    startMove()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current || !selectedId) return
    const at = pointerToLatLong(e)
    if (at) moveTo(selectedId, at.lat, at.long)
  }
  const onUp = () => {
    if (dragging.current) endMove()
    dragging.current = false
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // A drag ends with a click event too; ignore those.
    if (e.delta > 4) return
    const pending = usePlacementRuntime.getState()
    const at = pointerToLatLong(e as unknown as ThreeEvent<PointerEvent>)
    if (!at) return
    if (pending.brush) {
      pending.add(pending.brush, at.lat, at.long)
      pending.setBrush(null)
    } else {
      select(null)
    }
  }

  return (
    <group>
      {/* Click catcher, slightly inside the terrain so props win ties. */}
      <mesh
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onClick={onClick}
        renderOrder={-1}
      >
        <sphereGeometry args={[PLANET_RADIUS - 0.05, 48, 24]} />
        <meshBasicMaterial visible={false} side={THREE.FrontSide} />
      </mesh>

      {/* Every placement gets a hit target, so anything can be selected
          — including things the scene draws with its own component. */}
      {list.map((p) => {
        const m = placementMatrix(p.lat, p.long, p.yawDeg, 1, (p.liftM ?? 0) + 0.9)
        const pos = new THREE.Vector3()
        m.decompose(pos, new THREE.Quaternion(), new THREE.Vector3())
        const isSel = p.id === selectedId
        return (
          <mesh
            key={p.id}
            position={pos}
            onClick={(e) => {
              e.stopPropagation()
              select(p.id)
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = 'auto')}
          >
            {/* Big enough to hit from across the island — this is a
                handle, not scenery. */}
            <sphereGeometry args={[0.85, 10, 8]} />
            <meshBasicMaterial
              color={isSel ? '#ffd166' : '#5fd8ff'}
              transparent
              opacity={isSel ? 0.85 : 0.28}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
        )
      })}

      {/* Selection + blocker rings, lying on the ground. */}
      {selected && (
        <group ref={ringRef} matrixAutoUpdate={false}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.75, 32]} />
            <meshBasicMaterial
              color="#ffd166"
              transparent
              opacity={0.95}
              side={THREE.DoubleSide}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
          {/* Which way it faces: a wedge pointing along local +Z. */}
          <mesh position={[0, 0.01, 1.15]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.28, 0.7, 3]} />
            <meshBasicMaterial
              color="#ffd166"
              transparent
              opacity={0.95}
              depthTest={false}
              toneMapped={false}
            />
          </mesh>
          {selected.blockerRadiusM !== undefined && (
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[selected.blockerRadiusM, 40]} />
              <meshBasicMaterial
                color="#ff6b6b"
                transparent
                opacity={0.22}
                side={THREE.DoubleSide}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          )}
        </group>
      )}
    </group>
  )
}

/** Free-fly: hold the key and the camera pulls out fast, so you can
 *  reach the far side without walking there. */
export function useFreeFly(active: boolean) {
  const held = useRef(false)
  useFrame((_state, rawDt) => {
    if (!active) return
    const dt = Math.min(rawDt, 0.1)
    const target = held.current ? 60 : (controlsRuntime.camDist ?? 7)
    controlsRuntime.camDist = THREE.MathUtils.lerp(controlsRuntime.camDist ?? 7, target, dt * 3)
  })
  return held
}
