import * as THREE from 'three'

/**
 * Procedurally generated glyph atlas for the Matrix room's rain
 * (TASK 4). A canvas grid of half-width katakana + digits in varying
 * green brightness — playbook §3's generated-canvas caveat, no image
 * assets. Each rain column quad samples ONE atlas column as a
 * vertical strip (wrapT repeat), so scrolling `map.offset.y` rains an
 * ever-different glyph sequence with zero new shaders. NearestFilter
 * keeps the chunky pixel read.
 */

export const ATLAS_COLS = 16
export const ATLAS_ROWS = 16

const GLYPHS =
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789<>[]{}=+*'

export function makeGlyphAtlas(seedRandom: () => number): THREE.CanvasTexture {
  const SIZE = 512
  const cell = SIZE / ATLAS_COLS
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.font = `${Math.floor(cell * 0.82)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let col = 0; col < ATLAS_COLS; col++) {
    for (let row = 0; row < ATLAS_ROWS; row++) {
      const glyph = GLYPHS[Math.floor(seedRandom() * GLYPHS.length)]
      // Mostly mid greens, occasional bright "head" glyphs.
      const bright = seedRandom()
      ctx.fillStyle =
        bright > 0.92
          ? 'rgba(214, 255, 230, 0.95)'
          : `rgba(58, 255, 126, ${0.25 + bright * 0.55})`
      ctx.fillText(glyph, (col + 0.5) * cell, (row + 0.5) * cell)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}
