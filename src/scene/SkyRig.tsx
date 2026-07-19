import { useRef } from 'react'
import * as THREE from 'three'
import { SKY, useSkyState } from './useSkyState'

/**
 * The playbook §4 lighting recipe (Aviator pattern): hemisphere pastel pair +
 * one soft directional + gentle ambient, Lambert materials everywhere. The
 * cozy "slightly overexposed" brightness comes from intensity and light
 * saturated palette colors — never bloom/postprocessing. Mount values are the
 * sunset-side baseline; useSkyState lerps every parameter (and the fog +
 * background) with nightMix each frame.
 */
export function SkyRig({ planetRef }: { planetRef: React.RefObject<THREE.Group | null> }) {
  const hemi = useRef<THREE.HemisphereLight>(null)
  const dir = useRef<THREE.DirectionalLight>(null)
  const amb = useRef<THREE.AmbientLight>(null)
  useSkyState({ planetRef, hemi, dir, amb })
  return (
    <>
      <hemisphereLight ref={hemi} args={[SKY.hemiSkyDay, SKY.hemiGroundDay]} intensity={0.55} />
      <directionalLight ref={dir} position={[12, 16, 8]} color={SKY.dirDay} intensity={1.15} />
      <ambientLight ref={amb} intensity={0.35} />
    </>
  )
}
