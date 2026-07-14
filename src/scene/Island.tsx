const GROUND_SIZE = 80

/** Landmark boxes so movement reads while everything is still gray-box. */
const rocks: { position: [number, number, number]; size: [number, number, number] }[] = [
  { position: [-10, 1, -14], size: [3, 2, 2.5] },
  { position: [14, 0.75, -8], size: [2, 1.5, 2] },
  { position: [-16, 0.5, 8], size: [2.5, 1, 1.5] },
  { position: [10, 1.25, 14], size: [2, 2.5, 2] },
]

export function Island() {
  return (
    <>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[GROUND_SIZE, 1, GROUND_SIZE]} />
        <meshStandardMaterial color="#e8d5a3" flatShading />
      </mesh>
      {rocks.map((rock, i) => (
        <mesh key={i} position={rock.position}>
          <boxGeometry args={rock.size} />
          <meshStandardMaterial color="#b9b3a5" flatShading />
        </mesh>
      ))}
    </>
  )
}
