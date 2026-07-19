import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { facetTerrain } from './geometryUtils'

const CAP = () => new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3)
const OPTS = { colorA: '#58b268', colorB: '#49a15a', amplitude: 0.12, seed: 3 }

describe('facetTerrain (playbook §3)', () => {
  it('returns non-indexed geometry with flat per-face colors', () => {
    const geo = facetTerrain(CAP(), OPTS)
    expect(geo.index).toBeNull()
    const color = geo.attributes.color as THREE.BufferAttribute
    expect(color.count).toBe(geo.attributes.position.count)
    // Every triangle's three vertices share one color — crisp facets.
    for (let f = 0; f < color.count / 3; f++) {
      for (const ch of [0, 1, 2]) {
        expect(color.getComponent(f * 3 + 1, ch)).toBe(color.getComponent(f * 3, ch))
        expect(color.getComponent(f * 3 + 2, ch)).toBe(color.getComponent(f * 3, ch))
      }
    }
  })

  it('uses both tones', () => {
    const color = facetTerrain(CAP(), OPTS).attributes.color as THREE.BufferAttribute
    const tones = new Set<string>()
    for (let f = 0; f < color.count / 3; f++) {
      tones.add(
        [0, 1, 2].map((ch) => color.getComponent(f * 3, ch).toFixed(3)).join(','),
      )
    }
    expect(tones.size).toBeGreaterThan(1)
  })

  it('is deterministic for a fixed seed', () => {
    const a = facetTerrain(CAP(), OPTS)
    const b = facetTerrain(CAP(), OPTS)
    expect(a.attributes.position.array).toEqual(b.attributes.position.array)
    expect(a.attributes.color.array).toEqual(b.attributes.color.array)
  })

  it('keeps jitter within amplitude (analytic ground stays valid)', () => {
    const geo = facetTerrain(CAP(), OPTS)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      expect(Math.abs(v.length() - 10)).toBeLessThanOrEqual(0.12 + 1e-6)
    }
  })

  it('fades variation to the base tone at the cap pole', () => {
    const geo = facetTerrain(CAP(), { ...OPTS, poleFadeRad: 0.4 })
    const pos = geo.attributes.position as THREE.BufferAttribute
    const color = geo.attributes.color as THREE.BufferAttribute
    const base = new THREE.Color(OPTS.colorA)
    const v = new THREE.Vector3()
    for (let f = 0; f < color.count / 3; f++) {
      // Face centroid polar angle; faces hugging the pole must be pure colorA.
      v.set(0, 0, 0)
      const w = new THREE.Vector3()
      for (const k of [0, 1, 2]) v.add(w.fromBufferAttribute(pos, f * 3 + k))
      v.multiplyScalar(1 / 3)
      const polar = Math.acos(THREE.MathUtils.clamp(v.y / v.length(), -1, 1))
      if (polar < 0.4 * 0.15) {
        expect(color.getComponent(f * 3, 0)).toBeCloseTo(base.r, 5)
        expect(color.getComponent(f * 3, 1)).toBeCloseTo(base.g, 5)
        expect(color.getComponent(f * 3, 2)).toBeCloseTo(base.b, 5)
      }
    }
  })
})
