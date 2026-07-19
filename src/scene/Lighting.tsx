/**
 * The playbook §4 lighting recipe (Aviator pattern): hemisphere pastel pair +
 * one soft directional + gentle ambient, Lambert materials everywhere. The
 * cozy "slightly overexposed" brightness comes from intensity and light
 * saturated palette colors — never bloom/postprocessing. Colors sit at the
 * sunset-side baseline; 3B's useSkyState lerps this same rig with nightMix.
 */
export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#fff3d6', '#e0c9a0']} intensity={0.55} />
      <directionalLight position={[12, 16, 8]} color="#ffd9a0" intensity={1.15} />
      <ambientLight intensity={0.35} />
    </>
  )
}
