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

/**
 * The room's wallpaper: columns of 0s and 1s in varying greens on
 * black, drawn once into a canvas and tiled across the walls (playbook
 * §3's generated-tile caveat — no image asset, no new shader). Scroll
 * the material's `map.offset.y` to make it rain.
 */
export function makeBinaryWallpaper(seedRandom: () => number): THREE.CanvasTexture {
  const W = 256
  const H = 512
  const COLS = 16
  const cell = W / COLS
  const rows = Math.round(H / cell)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#020604'
  ctx.fillRect(0, 0, W, H)
  ctx.font = `${Math.floor(cell * 0.86)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let col = 0; col < COLS; col++) {
    // Each column runs at its own brightness, so the wall reads as
    // streams rather than a uniform field of noise.
    const columnLevel = 0.25 + seedRandom() * 0.75
    for (let row = 0; row < rows; row++) {
      if (seedRandom() < 0.12) continue // gaps keep it from looking woven
      const bright = seedRandom() * columnLevel
      ctx.fillStyle =
        bright > 0.66
          ? `rgba(200, 255, 220, ${0.55 + bright * 0.45})`
          : `rgba(58, 255, 126, ${0.12 + bright * 0.5})`
      ctx.fillText(seedRandom() < 0.5 ? '0' : '1', (col + 0.5) * cell, (row + 0.5) * cell)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/**
 * Step-number plates for the room's murals: the numbers 1..`count`
 * drawn once into a grid canvas so every plate can sample one cell of
 * ONE texture. That keeps all of them in a single merged mesh — one
 * draw call for the whole numbered sequence — and it is a generated
 * tile, not an image asset (playbook §3).
 */
export const PLATE_COLS = 6

export function makeNumberPlates(count: number): {
  texture: THREE.CanvasTexture
  rows: number
} {
  const rows = Math.max(1, Math.ceil(count / PLATE_COLS))
  const CELL = 128
  const canvas = document.createElement('canvas')
  canvas.width = PLATE_COLS * CELL
  canvas.height = rows * CELL
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < count; i++) {
    const col = i % PLATE_COLS
    const row = Math.floor(i / PLATE_COLS)
    const cx = (col + 0.5) * CELL
    const cy = (row + 0.5) * CELL
    // A dark pill behind the digits: the wall is a field of moving
    // glyphs, and text alone disappears into it at any distance.
    const w = CELL * 0.78
    const h = CELL * 0.46
    const r = h / 2
    ctx.beginPath()
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r)
    ctx.fillStyle = 'rgba(3, 12, 7, 0.88)'
    ctx.fill()
    ctx.lineWidth = CELL * 0.035
    ctx.strokeStyle = 'rgba(158, 247, 192, 0.75)'
    ctx.stroke()
    ctx.font = `700 ${Math.floor(CELL * 0.32)}px ui-monospace, monospace`
    ctx.fillStyle = '#c8ffdd'
    ctx.fillText(String(i + 1).padStart(2, '0'), cx, cy + CELL * 0.01)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return { texture: tex, rows }
}
