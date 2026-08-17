import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { muralCover, murals } from '../content/murals'
import { ROOM } from '../controls/useRoomController'
import { useStore } from '../store/useStore'
import { mulberry32 } from './geometryUtils'
import { makeBinaryWallpaper, makeNumberPlates, PLATE_COLS } from './matrixAtlas'
import { normalizeForMerge } from './props'
import { buildRift } from './riftGeometry'

/**
 * The build-log room: a rectangle you can actually run around in.
 *
 * Four walls of falling 0s and 1s that run far above and below the
 * room, a glass floor and ceiling so those walls read as endless, a
 * framed screenshot of every feature hung on the walls, and the rift
 * hanging at the centre — walk back into it to leave.
 *
 * The room group is TRANSLATED by the room controller (the avatar never
 * moves, exactly like the island), so nothing here reads player state.
 *
 * Draw calls: merged walls (1), floor (1), ceiling (1), merged frames
 * (1), one per mural image (12), rift (4) ≈ 20.
 */

const WALL_H = 130 // walls run ±65 m: past anything the camera can frame
const CEIL_Y = 8
const MURAL_W = 3.4
const MURAL_H = MURAL_W * (9 / 16)
const MURAL_Y = 2.3
const PLATE_SIZE = 1.05
/** Step number sits just above the frame's top edge. */
const PLATE_Y = MURAL_Y + MURAL_H / 2 + 0.62

/**
 * One wall plane, positioned and turned to face into the room. NOTE:
 * `normalizeForMerge` deletes UVs (island props are untextured), so the
 * walls go non-indexed by hand — they need their UVs for the wallpaper.
 */
function wall(width: number, x: number, z: number, yaw: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, WALL_H).toNonIndexed()
  // Bake the tiling into the UVs: every wall gets the same glyph size
  // regardless of its length, so the corners match.
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (width / 4), uv.getY(i) * (WALL_H / 8))
  }
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1),
    ),
  )
  return g
}

/**
 * One step-number plate above a frame, UV-mapped to its cell of the
 * shared number atlas so all the plates merge into a single mesh.
 */
function plate(
  index: number,
  rows: number,
  x: number,
  z: number,
  yaw: number,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(PLATE_SIZE, PLATE_SIZE).toNonIndexed()
  const col = index % PLATE_COLS
  const row = Math.floor(index / PLATE_COLS)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (col + uv.getX(i)) / PLATE_COLS,
      // Canvas rows run top-down; UV v runs bottom-up.
      (rows - 1 - row + uv.getY(i)) / rows,
    )
  }
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, PLATE_Y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1),
    ),
  )
  return g
}

export const RoomScene = forwardRef<THREE.Group>(function RoomScene(_props, ref) {
  const openModal = useStore((s) => s.openModal)
  const nearbyMural = useStore((s) => s.nearbyMural)
  const wallMat = useRef<THREE.MeshBasicMaterial>(null)
  const rift = useRef<THREE.Group>(null)

  const { walls, wallpaper, frames, plates, numberTex, riftParts, textures } = useMemo(() => {
    const rng = mulberry32(0x0b1a01)
    const paper = makeBinaryWallpaper(rng)
    const w = mergeGeometries([
      wall(ROOM.halfX * 2, 0, -ROOM.halfZ, 0),
      wall(ROOM.halfX * 2, 0, ROOM.halfZ, Math.PI),
      wall(ROOM.halfZ * 2, ROOM.halfX, 0, -Math.PI / 2),
      wall(ROOM.halfZ * 2, -ROOM.halfX, 0, Math.PI / 2),
    ])!

    // Mural frames: one merged slab-with-border per mural.
    const frameGeos: THREE.BufferGeometry[] = []
    for (const m of murals) {
      const g = normalizeForMerge(new THREE.BoxGeometry(MURAL_W + 0.24, MURAL_H + 0.24, 0.12))
      g.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(m.at[0], MURAL_Y, m.at[1]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, m.faceYaw, 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      )
      frameGeos.push(g)
    }
    const merged = mergeGeometries(frameGeos)!
    frameGeos.forEach((g) => g.dispose())

    // Step numbers: the murals hang in build-log order, and each frame
    // says which step it was. One atlas, one merged mesh, one draw.
    const numbers = makeNumberPlates(Math.max(...murals.map((m) => m.step)))
    const plateGeos = murals.map((m) =>
      plate(m.step - 1, numbers.rows, m.at[0], m.at[1], m.faceYaw),
    )
    const plates = mergeGeometries(plateGeos)!
    plateGeos.forEach((g) => g.dispose())

    // Screenshots load without suspending: a missing file leaves the
    // frame dark rather than blowing up the whole room.
    const loader = new THREE.TextureLoader()
    const texMap = new Map<string, THREE.Texture>()
    for (const m of murals) {
      // The wall hangs the mural's FIRST shot; the rest live in the
      // modal's carousel, so the room still costs one texture per frame.
      const tex = loader.load(muralCover(m))
      tex.colorSpace = THREE.SRGBColorSpace
      texMap.set(m.id, tex)
    }
    return {
      walls: w,
      wallpaper: paper,
      frames: merged,
      plates,
      numberTex: numbers.texture,
      riftParts: buildRift(),
      textures: texMap,
    }
  }, [])

  useEffect(
    () => () => {
      walls.dispose()
      frames.dispose()
      plates.dispose()
      wallpaper.dispose()
      numberTex.dispose()
      textures.forEach((t) => t.dispose())
      riftParts.forEach((p) => {
        p.geometry.dispose()
        p.material.dispose()
      })
    },
    [walls, frames, plates, wallpaper, numberTex, textures, riftParts],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const map = wallMat.current?.map
    if (map) {
      map.offset.y -= dt * 0.06
      if (map.offset.y < -1) map.offset.y += 1
    }
    if (rift.current) {
      rift.current.rotation.z += dt * 0.13
      rift.current.position.y = 2.5 + Math.sin(state.clock.elapsedTime * 0.7) * 0.12
    }
  })

  return (
    <group ref={ref}>
      {/* Endless walls of falling ones and zeroes. */}
      <mesh geometry={walls}>
        <meshBasicMaterial
          ref={wallMat}
          map={wallpaper}
          // Each plane is already turned to face the room; DoubleSide so
          // the walls stay solid if the camera ever slips behind one.
          side={THREE.DoubleSide}
          fog={false}
          toneMapped={false}
        />
      </mesh>

      {/* Glass floor and ceiling — the walls read as infinite through them. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.halfX * 2, ROOM.halfZ * 2]} />
        <meshBasicMaterial
          color="#0d3b2a"
          transparent
          opacity={0.34}
          side={THREE.DoubleSide}
          fog={false}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEIL_Y, 0]}>
        <planeGeometry args={[ROOM.halfX * 2, ROOM.halfZ * 2]} />
        <meshBasicMaterial
          color="#0d3b2a"
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          fog={false}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Frames, then the screenshots themselves a hair proud of them. */}
      <mesh geometry={frames}>
        <meshBasicMaterial color="#0a1f14" fog={false} toneMapped={false} />
      </mesh>
      {/* The step number over every frame — walk them in order. */}
      <mesh geometry={plates} renderOrder={1}>
        <meshBasicMaterial
          map={numberTex}
          transparent
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </mesh>
      {murals.map((m) => {
        const inward = new THREE.Vector3(Math.sin(m.faceYaw), 0, Math.cos(m.faceYaw))
        const lit = nearbyMural === m.id
        return (
          <mesh
            key={m.id}
            position={[m.at[0] + inward.x * 0.09, MURAL_Y, m.at[1] + inward.z * 0.09]}
            rotation={[0, m.faceYaw, 0]}
            onClick={(e) => {
              e.stopPropagation()
              openModal(`mural:${m.id}`)
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = 'auto')}
          >
            <planeGeometry args={[MURAL_W, MURAL_H]} />
            <meshBasicMaterial
              map={textures.get(m.id)}
              color={lit ? '#ffffff' : '#b9c9c0'}
              fog={false}
              toneMapped={false}
            />
          </mesh>
        )
      })}

      {/* The way back out. */}
      <group ref={rift} position={[0, 2.5, 0]}>
        {riftParts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={p.material} />
        ))}
      </group>
    </group>
  )
})
