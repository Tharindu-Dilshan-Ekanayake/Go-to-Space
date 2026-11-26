import { suitById } from '@shared/balance'
import { SUIT_SHOP } from '@shared/world'

import { STYLE } from '../materials'
import { GEO, useProps } from './kit'

const VIOLET = '#6a4cff'
const VIOLET_DARK = '#4a32c8'
const WHITE = '#f4f6fa'
const GLASS = '#a9dcff'
const TRIM = '#7fe2ff'

/** The suits on show out front, left to right. */
const ON_SHOW = ['rookie', 'ranger', 'nova', 'galaxy']

/**
 * A suit on a mannequin: legs, body, arms, pack, collar and a glass helmet, in the suit's
 * colours, standing at (x, z) on `y`, facing the plaza (-Z): visor forward, pack behind.
 */
function mannequin(b, x, y, z, suitId) {
  const { main, accent, visor } = suitById(suitId).colors
  for (const side of [-1, 1]) {
    b.box(x + side * 0.18, y + 0.4, z, 0.32, 0.8, 0.34, main, STYLE.SMOOTH)
    b.box(x + side * 0.18, y + 0.08, z - 0.02, 0.34, 0.16, 0.4, accent, STYLE.SMOOTH)
  }
  b.box(x, y + 1.15, z, 0.76, 0.72, 0.4, main, STYLE.SMOOTH)
  b.box(x, y + 1.18, z - 0.21, 0.5, 0.3, 0.03, accent, STYLE.SMOOTH)
  b.box(x, y + 0.84, z, 0.8, 0.1, 0.44, accent, STYLE.SMOOTH)
  for (const side of [-1, 1]) {
    b.box(x + side * 0.53, y + 1.1, z, 0.28, 0.72, 0.3, main, STYLE.SMOOTH)
    b.box(x + side * 0.53, y + 0.7, z, 0.3, 0.14, 0.32, accent, STYLE.SMOOTH)
  }
  b.box(x, y + 1.2, z + 0.33, 0.5, 0.6, 0.26, main, STYLE.SMOOTH)
  b.add(GEO.cylinder, { position: [x, y + 1.55, z], scale: [0.3, 0.08, 0.3], color: main, style: STYLE.SMOOTH })
  b.add(GEO.sphere, { position: [x, y + 1.82, z], scale: 0.36, color: GLASS, style: STYLE.GLOW })
  b.add(GEO.sphere, { position: [x, y + 1.8, z - 0.16], scale: [0.24, 0.18, 0.2], color: visor, style: STYLE.GLOW })
}

/**
 * The Suit Shop, on the south-east of the plaza (shared/world.js SUIT_SHOP): a white
 * storefront banded in violet, with tall lit shop windows either side of a glowing
 * entrance, violet pillars, a deep canopy with a lit edge, a rooftop sign board, and
 * four suits on mannequins on pedestals out front either side of the mat you stand on
 * to shop. One draw call.
 */
export function SuitShop() {
  const mesh = useProps((b) => {
    const { x, z, w, d } = SUIT_SHOP
    const front = z - d / 2
    const h = 6
    /** A box standing on `base`. */
    const on = (bx, base, bz, sx, sy, sz, color, style) => b.box(bx, base + sy / 2, bz, sx, sy, sz, color, style)
    // The building: body, violet base band and a cornice, the roof's parapet.
    on(x, 0, z, w, h, d, WHITE, STYLE.SMOOTH)
    on(x, 0, front - 0.02, w + 0.02, 0.9, 0.12, VIOLET, STYLE.SMOOTH)
    on(x, h - 0.5, z, w + 0.4, 0.5, d + 0.4, VIOLET, STYLE.SMOOTH)
    on(x, h, z, w + 0.4, 0.5, 0.3, VIOLET_DARK, STYLE.SMOOTH)
    // Shop windows either side of the door, lit from inside, with mullions.
    for (const side of [-1, 1]) {
      const cx = x + side * 3.9
      on(cx, 0.9, front - 0.04, 5.2, 3.6, 0.08, GLASS, STYLE.GLOW)
      for (const mx of [-1.3, 0, 1.3]) on(cx + mx, 0.9, front - 0.1, 0.12, 3.6, 0.1, WHITE, STYLE.SMOOTH)
      on(cx, 2.65, front - 0.1, 5.2, 0.12, 0.1, WHITE, STYLE.SMOOTH)
      // Helmets on show inside the window.
      for (const hx of [-1.6, 0, 1.6]) b.add(GEO.sphere, { position: [cx + hx, 1.9, front + 0.3], scale: 0.38, color: hx === 0 ? VIOLET : WHITE, style: STYLE.SMOOTH })
    }
    // The entrance: a glowing door in a violet frame, pillars at the corners.
    on(x, 0, front - 0.05, 2.4, 3.4, 0.08, '#d9f3ff', STYLE.GLOW)
    on(x, 3.4, front - 0.12, 2.8, 0.25, 0.2, VIOLET, STYLE.SMOOTH)
    for (const px of [x - 1.35, x + 1.35, x - w / 2 + 0.25, x + w / 2 - 0.25]) on(px, 0, front - 0.15, 0.5, 4.5, 0.3, VIOLET, STYLE.SMOOTH)
    // The canopy, deep over the front, with a lit edge and lights under it.
    b.box(x, 4.6, front - 1.6, w + 1, 0.32, 3.2, VIOLET, STYLE.SMOOTH)
    b.box(x, 4.45, front - 3.17, w + 1, 0.1, 0.1, TRIM, STYLE.GLOW)
    for (let i = 0; i < 6; i += 1) b.box(x - w / 2 + 1.2 + i * ((w - 2.4) / 5), 4.42, front - 1.6, 0.6, 0.05, 0.6, '#fff6d0', STYLE.GLOW)
    // The sign board on the roof (its words float in front: placeLabels).
    b.box(x, h + 1.7, front + 0.6, 10.4, 2.4, 0.3, VIOLET_DARK, STYLE.SMOOTH)
    b.box(x, h + 1.7, front + 0.42, 10.8, 2.8, 0.1, TRIM, STYLE.GLOW)
    for (const sx of [-4, 4]) b.box(x + sx, h + 0.4, front + 0.7, 0.2, 0.8, 0.2, '#8d939c', STYLE.SMOOTH)
    // Four suits on mannequins out front, on lit pedestals, either side of the mat.
    const positions = [x - 5.8, x - 4.1, x + 4.1, x + 5.8]
    positions.forEach((mx, i) => {
      const mz = front - 1.3
      b.add(GEO.cylinder, { position: [mx, 0.25, mz], scale: [0.75, 0.5, 0.75], color: WHITE, style: STYLE.SMOOTH })
      b.add(GEO.ring, { position: [mx, 0.52, mz], rotation: [Math.PI / 2, 0, 0], scale: [0.72, 0.72, 0.8], color: TRIM, style: STYLE.GLOW })
      mannequin(b, mx, 0.5, mz, ON_SHOW[i])
    })
  }, '')
  return mesh ? <primitive object={mesh} /> : null
}

export default SuitShop
