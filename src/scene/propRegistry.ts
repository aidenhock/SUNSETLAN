import * as THREE from 'three'
import {
  buildCrate,
  buildPalapa,
  buildPalm,
  buildRock,
  buildRowboat,
  paletteMaterial,
  type PropPart,
} from './props'

/**
 * The prop types the world can be built out of — what Island renders
 * from the placement file, and exactly what the editor's palette
 * offers. Adding a prop here makes it placeable; nothing else to wire.
 *
 * Things NOT in here are placed by the file but drawn by their own
 * component because they are more than a mesh: the campfire (animated),
 * the dock and cemetery (geometry wrapped onto the sphere), Koa, and
 * every interactable (which carries a modal). Those can still be
 * selected and moved in the editor.
 */

const shellGeo = new THREE.ConeGeometry(0.16, 0.22, 5)
const shellMat = paletteMaterial('#f3e6c8')

export const PROP_REGISTRY: Record<string, () => PropPart[]> = {
  palm: buildPalm,
  rock: buildRock,
  shell: () => [{ geometry: shellGeo, material: shellMat }],
  crate: buildCrate,
  rowboat: buildRowboat,
  palapa: buildPalapa,
}

export const isSpawnable = (type: string) => type in PROP_REGISTRY
