import { STYLE } from '../materials'

/**
 * A square pad on the ground for a zone you stand on (shared/world.js `pad` zones: the
 * Cargo Pads, the shuttle bays and beacon, the pod, the rocket's boarding pad, the shop
 * mats): a metal-rimmed slab, a dark face, a glowing border in the pad's colour with lit
 * corner brackets, and a fine inner line. Built into a PropBuilder `b` - part of the
 * scene's one props mesh, no extra draw call.
 *
 * `zone` is `{ x, z, radius }` (radius: the half-width), `y` the ground under it.
 */
export function addSquarePad(b, zone, color, y = 0) {
  const { x, z } = zone
  const h = zone.radius
  const size = h * 2
  b.box(x, y + 0.04, z, size + 0.36, 0.08, size + 0.36, '#c3c9d3', STYLE.SMOOTH)
  b.box(x, y + 0.085, z, size, 0.02, size, '#1a2130', STYLE.SMOOTH)
  // The glowing border.
  const t = 0.2
  const e = h - 0.16
  for (const side of [-1, 1]) {
    b.box(x, y + 0.1, z + side * e, size - 0.12, 0.02, t, color, STYLE.GLOW)
    b.box(x + side * e, y + 0.1, z, t, 0.02, size - 0.12, color, STYLE.GLOW)
  }
  // A fine inner line.
  const inner = h * 0.66
  for (const side of [-1, 1]) {
    b.box(x, y + 0.1, z + side * inner, inner * 2, 0.02, 0.06, color, STYLE.GLOW)
    b.box(x + side * inner, y + 0.1, z, 0.06, 0.02, inner * 2, color, STYLE.GLOW)
  }
  // Lit corner brackets, a shade brighter.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(x + sx * (h - 0.5), y + 0.11, z + sz * e, 0.7, 0.02, 0.26, '#ffffff', STYLE.GLOW)
      b.box(x + sx * e, y + 0.11, z + sz * (h - 0.5), 0.26, 0.02, 0.7, '#ffffff', STYLE.GLOW)
    }
  }
}
