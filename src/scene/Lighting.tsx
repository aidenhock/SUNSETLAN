export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[12, 16, 8]} intensity={1.6} />
    </>
  )
}
