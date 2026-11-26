import { OXYGEN_TANKS } from '@shared/balance'
import { groundHeightAt, OXYGEN_RING, oxygenStoreOf } from '@shared/world'

import { STYLE } from '../materials'
import { GEO, useProps } from './kit'
import { addSquarePad } from './pads'

/**
 * The Oxygen Store in `place` (shared/world.js OXYGEN_STORES): a white booth with a blue
 * canopy, a counter and a glowing O2 sign, every tank there is to buy standing on show
 * along its top, little tanks racked by the counter, and the glowing ring in front -
 * stand in it to refill and shop. One draw call.
 */
export function OxygenStore({ place }) {
  const mesh = useProps((b) => {
    const { x, z } = oxygenStoreOf(place)
    const y = groundHeightAt(place, x, z)
    const bz = z - 3.4
    // The pad you stand on to shop, and a bubble of O2 in its middle.
    addSquarePad(b, { x, z, radius: OXYGEN_RING }, '#4fd2ff', y)
    b.add(GEO.sphere, { position: [x, y + 0.12, z], scale: [0.45, 0.05, 0.45], color: '#7fe2ff', style: STYLE.GLOW })
    // The booth: base, walls, counter, canopy with a lit edge.
    b.add(GEO.cylinder, {
      position: [x, y + 0.08, bz],
      scale: [2.6, 0.16, 1.5],
      color: '#c3c9d3',
      style: STYLE.SMOOTH,
    })
    b.box(x, y + 1.5, bz - 0.7, 4.4, 3, 0.3, '#f4f6fa', STYLE.SMOOTH)
    for (const side of [-1, 1]) b.box(x + side * 2.05, y + 1.5, bz, 0.3, 3, 1.6, '#f4f6fa', STYLE.SMOOTH)
    b.box(x, y + 0.55, bz + 0.55, 4.0, 1.1, 0.5, '#2f6fe0', STYLE.SMOOTH)
    b.box(x, y + 1.12, bz + 0.6, 4.2, 0.08, 0.7, '#f4f6fa', STYLE.SMOOTH)
    b.box(x, y + 3.1, bz + 0.1, 4.8, 0.22, 2.4, '#2f6fe0', STYLE.SMOOTH)
    b.box(x, y + 3.0, bz + 1.31, 4.8, 0.08, 0.06, '#7fe2ff', STYLE.GLOW)
    // The O2 sign on the back wall: a glowing panel with the letters' blocks.
    b.box(x, y + 2.1, bz - 0.53, 2.2, 1.0, 0.04, '#0d2a4a', STYLE.SMOOTH)
    const glyph = (gx, gy, w, h) => b.box(x + gx, y + gy, bz - 0.5, w, h, 0.03, '#7fe2ff', STYLE.GLOW)
    // "O": a square ring; "2": three bars and two uprights; little.
    glyph(-0.55, 2.42, 0.6, 0.1)
    glyph(-0.55, 1.78, 0.6, 0.1)
    glyph(-0.8, 2.1, 0.1, 0.62)
    glyph(-0.3, 2.1, 0.1, 0.62)
    glyph(0.35, 2.2, 0.36, 0.07)
    glyph(0.35, 1.98, 0.36, 0.07)
    glyph(0.35, 1.76, 0.36, 0.07)
    glyph(0.5, 2.09, 0.07, 0.22)
    glyph(0.2, 1.87, 0.07, 0.22)
    // Every tank on show along the canopy, smallest to biggest.
    OXYGEN_TANKS.forEach((t, i) => {
      const tx = x - 1.9 + i * 0.76
      const h = 0.5 + i * 0.09
      b.add(GEO.cylinder, {
        position: [tx, y + 3.21 + h / 2, bz + 0.1],
        scale: [0.2, h, 0.2],
        color: t.color,
        style: STYLE.SMOOTH,
      })
      b.add(GEO.sphere, {
        position: [tx, y + 3.21 + h, bz + 0.1],
        scale: [0.2, 0.12, 0.2],
        color: t.color,
        style: STYLE.SMOOTH,
      })
      b.add(GEO.cylinderLow, {
        position: [tx, y + 3.29 + h + 0.08, bz + 0.1],
        scale: [0.06, 0.14, 0.06],
        color: '#c3c9d3',
        style: STYLE.SMOOTH,
      })
    })
    // A rack of little tanks by the counter.
    for (let i = 0; i < 4; i += 1) {
      const tx = x + 2.55 + (i % 2) * 0.32
      const tz = bz + 0.3 + Math.floor(i / 2) * 0.32
      b.add(GEO.cylinder, {
        position: [tx, y + 0.45, tz],
        scale: [0.13, 0.9, 0.13],
        color: '#3a7bd5',
        style: STYLE.SMOOTH,
      })
      b.add(GEO.sphere, {
        position: [tx, y + 0.9, tz],
        scale: [0.13, 0.08, 0.13],
        color: '#3a7bd5',
        style: STYLE.SMOOTH,
      })
    }
  }, place)
  return mesh ? <primitive object={mesh} /> : null
}

export default OxygenStore
