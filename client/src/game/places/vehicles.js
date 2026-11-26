import { ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from 'three'

import { LINER_GEAR, SPACEPLANE_GEAR } from '@shared/world'

import { GEO } from './kit'

export { LINER_GEAR, SPACEPLANE_GEAR }

/**
 * The craft, as recipes over a Craft (craft.js): painted parts go in `c.body`, glass in
 * `c.glass`, lights and engine cores in `c.glow`. Each is built about its own origin: the
 * rocket and pod stand on it (+Y up), the spaceplane flies along +Z with its fuselage
 * centred on it (its gear reaches down to y = -SPACEPLANE_GEAR), the rover sits on it.
 *
 * Template geometries (made once here, never drawn themselves) are merged in, so the
 * shapes cost nothing per craft.
 */

export const ROCKET_COLORS = { body: '#f4f6fa', band: '#2f6fe0', nose: '#e8452e', fin: '#e8452e', engine: '#3a3d46', seam: '#c3c9d3', dark: '#22252c' }

/** Height of the rocket at scale 1 (base to the escape tower's tip). */
export const ROCKET_HEIGHT = 30
/** Where the boosters sit either side of the core. */
export const BOOSTER_X = 2.7

// --- Shapes ---------------------------------------------------------------------------

/** The spaceplane's fuselage: a smooth lathe from the tail (y -3.4) to the nose (y 4.85). */
const FUSELAGE = new LatheGeometry(
  [
    [0, -3.4],
    [0.55, -3.4],
    [0.9, -3.0],
    [1.05, -2.2],
    [1.1, -0.5],
    [1.05, 1.2],
    [0.9, 2.4],
    [0.65, 3.4],
    [0.35, 4.2],
    [0.1, 4.7],
    [0, 4.85],
  ].map(([r, y]) => new Vector2(r, y)),
  20,
)

/** A flat plate from an outline of [across, forward] points, `depth` thick. */
const plate = (points, depth) => new ExtrudeGeometry(new Shape(points.map(([x, y]) => new Vector2(x, y))), { depth, bevelEnabled: false })
/** The same outline, mirrored to the other side (built rather than scaled, so it faces the right way). */
const mirror = (points) => points.map(([x, y]) => [-x, y]).reverse()

const WING = [
  [0.9, 1.6],
  [4.3, -1.5],
  [4.3, -2.2],
  [0.9, -2.9],
]
const EDGE = [
  [0.95, 1.55],
  [4.3, -1.5],
  [4.3, -1.85],
  [0.95, 1.05],
]
const CANARD = [
  [0.7, 3.0],
  [1.7, 2.3],
  [1.7, 2.0],
  [0.7, 2.2],
]
/** A chevron across the top of each wing, between the leading edge and the trailing edge. */
const STRIPE = [
  [1.0, -0.2],
  [4.25, -1.95],
  [4.25, -2.15],
  [1.0, -0.62],
]
const WING_R = plate(WING, 0.14)
const BELLY_R = plate(WING, 0.02)
const BELLY_L = plate(mirror(WING), 0.02)
const STRIPE_R = plate(STRIPE, 0.03)
const STRIPE_L = plate(mirror(STRIPE), 0.03)
const WING_L = plate(mirror(WING), 0.14)
const EDGE_R = plate(EDGE, 0.16)
const EDGE_L = plate(mirror(EDGE), 0.16)
const CANARD_R = plate(CANARD, 0.08)
const CANARD_L = plate(mirror(CANARD), 0.08)
/** A swept fin, in [forward, up]: the tail fin and the wingtip fins. */
const FIN = plate(
  [
    [-1.4, 0],
    [-2.7, 1.9],
    [-3.3, 1.9],
    [-3.3, 0],
  ],
  0.12,
)

// Plates are drawn in their own [x, y] plane; these turns lay them where they go.
/** Flat, with the outline's y running forward (+Z). Its thickness hangs below y 0. */
const FLAT = [Math.PI / 2, 0, 0]
/** Upright, with the outline's x running forward (+Z) and its y up. */
const UPRIGHT = [0, -Math.PI / 2, 0]
const ALONG_Z = [Math.PI / 2, 0, 0]


/**
 * The Orbit Express spaceplane: a smooth white fuselage with a dark heat-tiled belly,
 * panel seams and a coloured stripe down each side; swept delta wings with coloured
 * leading edges, canards, a tail fin and wingtip fins; a glass canopy in its frame and a
 * row of lit cabin windows; intakes, two engine nacelles with glowing nozzles; red, green
 * and white nav lights - and its landing gear when parked (`gear`). Nose along +Z, about
 * 8.3 m long and 8.6 m across.
 */
export function addSpaceplane(c, { scale = 1, color = '#f3f5f8', accent = '#2f6fe0', gear = false, open = false, lite = false } = {}) {
  // `lite` (LOW, rows of parked planes): half the facets on every round part.
  const CYL = lite ? GEO.cylinderLow : GEO.cylinder
  const CONE = lite ? GEO.coneLow : GEO.cone
  const s = (v) => v * scale
  const at = (x, y, z) => [s(x), s(y), s(z)]
  const { body, glass, glow } = c
  // Fuselage, a little flattened; its seams; the accent band; the dark belly.
  body.add(FUSELAGE, { position: at(0, 0, 0), rotation: ALONG_Z, scale: [s(1), s(1), s(0.82)], color })
  for (const z of [-1.9, 1.7]) body.add(CYL, { position: at(0, 0, z), rotation: ALONG_Z, scale: [s(1.103), s(0.04), s(0.908)], color: '#aab2bd' })
  body.add(CYL, { position: at(0, 0, 0.4), rotation: ALONG_Z, scale: [s(1.115), s(0.32), s(0.92)], color: accent })
  body.box(0, s(-0.82), s(-0.2), s(1.3), s(0.12), s(5.6), '#2b2e36')
  for (const side of [-1, 1]) {
    body.box(s(side * 1.075), s(0.06), s(-0.4), s(0.05), s(0.12), s(3.6), accent)
    // Intakes either side, under the wing root.
    body.box(s(side * 0.92), s(-0.42), s(0.7), s(0.32), s(0.36), s(1.2), '#2b2e36')
  }
  if (open) {
    // An open cockpit for two (shared/world.js JET_SEATS): a dark well let into the top
    // of the fuselage, a padded rim round it, two seats with headrests standing up out of
    // it, a low raked windscreen and a glowing instrument panel - whoever sits in it shows
    // from the waist up.
    body.box(0, s(1.0), s(1.3), s(1.0), s(0.06), s(2.9), '#1d2027')
    for (const side of [-1, 1]) body.box(s(side * 0.56), s(1.08), s(1.3), s(0.14), s(0.2), s(3.0), '#3a3f4a')
    body.box(0, s(1.08), s(2.82), s(1.26), s(0.2), s(0.14), '#3a3f4a')
    body.box(0, s(1.08), s(-0.22), s(1.26), s(0.2), s(0.14), '#3a3f4a')
    for (const z of [2.05, 0.7]) {
      body.box(0, s(1.38), s(z - 0.46), s(0.7), s(0.78), s(0.14), '#2b2e36', undefined, [-0.16, 0, 0])
      body.box(0, s(1.86), s(z - 0.54), s(0.42), s(0.24), s(0.14), accent, undefined, [-0.16, 0, 0])
    }
    body.box(0, s(1.3), s(3.0), s(1.0), s(0.36), s(0.04), '#bfe6f7', undefined, [-0.55, 0, 0])
    glow.box(0, s(1.12), s(2.7), s(0.62), s(0.14), s(0.04), '#7fe2ff', undefined, [-0.5, 0, 0])
  } else {
    // Canopy glass in its frame, and the lit cabin windows.
    glass.add(GEO.sphere, { position: at(0, 0.58, 2.35), scale: [s(0.56), s(0.42), s(1.25)] })
    body.box(0, s(0.98), s(2.25), s(0.07), s(0.06), s(1.6), '#3a3f4a')
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) glow.box(s(side * 1.04), s(0.3), s(1.2 - i * 0.62), s(0.04), s(0.2), s(0.36), '#bdeeff', undefined, [0, side * 0.12, 0])
  }
  // Wings, their leading edges, canards.
  body.add(WING_R, { position: at(0, -0.15, 0), rotation: FLAT, scale: s(1), color })
  body.add(WING_L, { position: at(0, -0.15, 0), rotation: FLAT, scale: s(1), color })
  body.add(EDGE_R, { position: at(0, -0.14, 0), rotation: FLAT, scale: s(1), color: accent })
  body.add(EDGE_L, { position: at(0, -0.14, 0), rotation: FLAT, scale: s(1), color: accent })
  // Dark heat tiles under the wings; an accent chevron and a fine white pinstripe on top.
  body.add(BELLY_R, { position: at(0, -0.285, 0), rotation: FLAT, scale: s(1), color: '#2b2e36' })
  body.add(BELLY_L, { position: at(0, -0.285, 0), rotation: FLAT, scale: s(1), color: '#2b2e36' })
  body.add(STRIPE_R, { position: at(0, -0.125, 0), rotation: FLAT, scale: s(1), color: accent })
  body.add(STRIPE_L, { position: at(0, -0.125, 0), rotation: FLAT, scale: s(1), color: accent })
  // Matt anti-glare panel ahead of the canopy, and a dark spine behind it.
  body.box(0, s(0.72), s(3.55), s(0.5), s(0.04), s(0.9), '#2b2e36', undefined, [-0.38, 0, 0])
  if (!open) body.box(0, s(1.0), s(0.2), s(0.22), s(0.06), s(2.6), '#c3c9d3')
  body.add(CANARD_R, { position: at(0, 0.05, 0), rotation: FLAT, scale: s(1), color })
  body.add(CANARD_L, { position: at(0, 0.05, 0), rotation: FLAT, scale: s(1), color })
  // Tail fin (accent), a little antenna, and the wingtip fins.
  body.add(FIN, { position: at(0.06, 0.55, 0.6), rotation: UPRIGHT, scale: s(1), color: accent })
  body.box(0, s(1.0), s(0.3), s(0.05), s(0.3), s(0.25), '#aab2bd')
  body.box(s(0.06), s(2.38), s(-2.75), s(0.14), s(0.16), s(0.62), '#f4f6fa')
  for (const side of [-1, 1]) body.add(FIN, { position: at(side * 4.3 + 0.06, -0.15, 1.1), rotation: UPRIGHT, scale: [s(0.55), s(0.6), s(1)], color })
  // Engine nacelles: intake ring, body, dark nozzle, glowing core.
  for (const side of [-1, 1]) {
    const x = side * 0.78
    body.add(CYL, { position: at(x, -0.2, -2.3), rotation: ALONG_Z, scale: [s(0.44), s(2.6), s(0.44)], color: '#d7dce3' })
    body.add(CYL, { position: at(x, -0.2, -0.95), rotation: ALONG_Z, scale: [s(0.47), s(0.14), s(0.47)], color: accent })
    body.add(CONE, { position: at(x, -0.2, -3.85), rotation: [-Math.PI / 2, 0, 0], scale: [s(0.4), s(0.5), s(0.4)], color: '#2b2e36' })
    // Bare-metal nozzle ring round the exhaust, and a dark band where it meets the nacelle.
    body.add(CYL, { position: at(x, -0.2, -3.62), rotation: ALONG_Z, scale: [s(0.46), s(0.16), s(0.46)], color: '#8d939c' })
    body.add(CYL, { position: at(x, -0.2, -3.38), rotation: ALONG_Z, scale: [s(0.455), s(0.1), s(0.455)], color: '#3a3f4a' })
    glow.add(CYL, { position: at(x, -0.2, -4.08), rotation: ALONG_Z, scale: [s(0.27), s(0.04), s(0.27)], color: '#ffb347' })
  }
  // Nav lights: red on the left wingtip, green on the right, white on the tail.
  glow.add(GEO.sphere, { position: at(-4.32, -0.08, -1.7), scale: s(0.13), color: '#ff3b3b' })
  glow.add(GEO.sphere, { position: at(4.32, -0.08, -1.7), scale: s(0.13), color: '#3bff6a' })
  glow.add(GEO.sphere, { position: at(0, 2.48, -2.7), scale: s(0.11), color: '#ffffff' })
  if (gear) {
    // Nose gear and two mains, each a strut and a wheel.
    for (const [x, z] of [
      [0, 2.7],
      [-1.5, -1.3],
      [1.5, -1.3],
    ]) {
      body.box(s(x), s(-0.95), s(z), s(0.14), s(1.1), s(0.14), '#5d6573')
      body.add(CYL, { position: at(x, -SPACEPLANE_GEAR + 0.28, z), rotation: [0, 0, Math.PI / 2], scale: [s(0.28), s(0.22), s(0.28)], color: '#1d2027' })
    }
  }
}

/** The core stage: seams, interstage, grid fins, portholes, nose and escape tower, three bells, the fins. */
export function addRocketCore(c, scale = 1) {
  const k = ROCKET_COLORS
  const s = (v) => v * scale
  const { body, glass } = c
  body.add(GEO.cylinder, { position: [0, s(10.5), 0], scale: [s(1.8), s(19), s(1.8)], color: k.body })
  for (let y = 2.5; y < 20; y += 3) body.add(GEO.cylinder, { position: [0, s(y), 0], scale: [s(1.815), s(0.07), s(1.815)], color: k.seam })
  body.add(GEO.cylinder, { position: [0, s(13), 0], scale: [s(1.83), s(0.9), s(1.83)], color: k.dark })
  body.add(GEO.cylinder, { position: [0, s(16.4), 0], scale: [s(1.84), s(1.2), s(1.84)], color: k.band })
  body.add(GEO.cylinder, { position: [0, s(5), 0], scale: [s(1.84), s(0.8), s(1.84)], color: k.band })
  for (let i = -1; i <= 1; i += 1) {
    const a = i * 0.45
    glass.add(GEO.sphere, { position: [Math.sin(a) * s(1.72), s(18.6), Math.cos(a) * s(1.72)], scale: [s(0.32), s(0.32), s(0.18)], rotation: [0, a, 0] })
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2
    body.box(Math.sin(a) * s(2.05), s(19.2), Math.cos(a) * s(2.05), s(1), s(0.9), s(0.12), '#8d939c', undefined, [0, a, 0])
  }
  body.add(GEO.cone, { position: [0, s(22.5), 0], scale: [s(1.8), s(5), s(1.8)], color: k.nose })
  body.add(GEO.cylinderLow, { position: [0, s(26.5), 0], scale: [s(0.12), s(3.2), s(0.12)], color: k.seam })
  body.add(GEO.cone, { position: [0, s(28.6), 0], scale: [s(0.32), s(1.1), s(0.32)], color: k.nose })
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2
    body.add(GEO.cone, { position: [Math.sin(a) * s(0.75), s(0.55), Math.cos(a) * s(0.75)], scale: [s(0.62), s(1.3), s(0.62)], color: k.engine })
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    body.box(Math.sin(a) * s(2.1), s(2.6), Math.cos(a) * s(2.1), s(0.18), s(3.6), s(1.8), k.fin, undefined, [0, a, 0])
  }
}

/** One striped booster on `side` (-1 or 1), with its nose, bell and the strut to the core. */
export function addRocketBooster(c, side, scale = 1) {
  const k = ROCKET_COLORS
  const s = (v) => v * scale
  const x = side * s(BOOSTER_X)
  c.body.add(GEO.cylinder, { position: [x, s(7), 0], scale: [s(0.9), s(12), s(0.9)], color: k.body })
  for (const y of [3, 9]) c.body.add(GEO.cylinder, { position: [x, s(y), 0], scale: [s(0.92), s(0.9), s(0.92)], color: k.nose })
  c.body.add(GEO.cone, { position: [x, s(14.5), 0], scale: [s(0.9), s(3), s(0.9)], color: k.body })
  c.body.add(GEO.cone, { position: [x, s(0.6), 0], scale: [s(0.7), s(1), s(0.7)], color: k.engine })
  c.body.box(side * s(2.05), s(12.2), 0, s(0.9), s(0.25), s(0.25), k.seam)
}

/** The whole heavy lifter: the core and both boosters. */
export function addRocket(c, scale = 1) {
  addRocketCore(c, scale)
  addRocketBooster(c, -1, scale)
  addRocketBooster(c, 1, scale)
}

/** The pod's shell: a capsule's curved cone from the shield's rim up to the docking tunnel. */
const POD_SHELL = new LatheGeometry(
  [
    [1.72, 0.0],
    [1.7, 0.18],
    [1.55, 0.7],
    [1.32, 1.3],
    [1.06, 1.9],
    [0.78, 2.45],
    [0.6, 2.72],
    [0.56, 2.8],
  ].map(([r, y]) => new Vector2(r, y)),
  32,
)
/** The heat shield: a shallow dome under the capsule, its rim at y 0. */
const POD_SHIELD = new LatheGeometry(
  [
    [0, -0.32],
    [0.6, -0.29],
    [1.1, -0.21],
    [1.5, -0.1],
    [1.78, 0.02],
    [1.72, 0.06],
  ].map(([r, y]) => new Vector2(r, y)),
  32,
)

/**
 * The re-entry pod: a capsule with a curved white shell, panel seams and a blue band, a
 * scorched heat shield under it on a metal rim, four framed portholes, a hatch with its
 * handle, four thruster quads, and on top the docking tunnel, its ring and a flashing
 * beacon. Stands on its shield, +Y up, about 3.4 m tall at scale 1.
 */
export function addPod(c, scale = 1) {
  const s = (v) => v * scale
  const at = (x, y, z) => [s(x), s(y), s(z)]
  const { body, glass, glow } = c
  const shellAt = (y) => 1.72 - (y / 2.8) * 1.16
  body.add(POD_SHELL, { position: at(0, 0.0, 0), scale: s(1), color: '#eef1f5' })
  body.add(POD_SHIELD, { position: at(0, 0.0, 0), scale: s(1), color: '#4a3226' })
  body.add(GEO.cylinder, { position: at(0, 0.04, 0), scale: [s(1.79), s(0.1), s(1.79)], color: '#8d939c' })
  // Seams round the shell, and the blue band.
  for (const y of [0.55, 1.6, 2.2]) {
    const r = shellAt(y) + 0.012
    body.add(GEO.cylinder, { position: at(0, y, 0), scale: [s(r), s(0.035), s(r)], color: '#b7bec8' })
  }
  {
    const r = shellAt(0.95) + 0.015
    body.add(GEO.cylinder, { position: at(0, 0.95, 0), scale: [s(r), s(0.2), s(r)], color: '#2f6fe0' })
  }
  // Four portholes in dark frames, tilted with the shell.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const r = shellAt(1.55)
    const tilt = 0.42
    body.add(GEO.cylinder, { position: at(Math.sin(a) * r, 1.55, Math.cos(a) * r), rotation: [Math.PI / 2 - tilt, a, 0], scale: [s(0.27), s(0.06), s(0.27)], color: '#3a3f4a' })
    glass.add(GEO.sphere, { position: at(Math.sin(a) * (r + 0.02), 1.55, Math.cos(a) * (r + 0.02)), rotation: [-tilt, a, 0], scale: [s(0.2), s(0.2), s(0.07)] })
  }
  // The hatch on the front: a panel in a frame, and its handle.
  {
    const r = shellAt(1.3) + 0.02
    body.box(0, s(1.3), s(r), s(0.8), s(0.95), s(0.05), '#dfe4ea', undefined, [-0.42, 0, 0])
    body.box(0, s(1.3), s(r + 0.02), s(0.88), s(1.03), s(0.02), '#8d939c', undefined, [-0.42, 0, 0])
    body.box(s(0.25), s(1.25), s(r + 0.05), s(0.06), s(0.24), s(0.05), '#3a3f4a', undefined, [-0.42, 0, 0])
  }
  // Thruster quads: a block on the shell with four little nozzles.
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2
    const r = shellAt(2.0)
    body.box(Math.sin(a) * s(r + 0.05), s(2.0), Math.cos(a) * s(r + 0.05), s(0.26), s(0.26), s(0.14), '#8d939c', undefined, [-0.45, a, 0])
    for (const [dx, dy] of [
      [-0.07, 0.07],
      [0.07, 0.07],
      [-0.07, -0.07],
      [0.07, -0.07],
    ]) {
      body.add(GEO.cylinderLow, { position: [Math.sin(a) * s(r + 0.14) + Math.cos(a) * s(dx), s(2.0 + dy), Math.cos(a) * s(r + 0.14) - Math.sin(a) * s(dx)], rotation: [Math.PI / 2 - 0.45, a, 0], scale: [s(0.035), s(0.08), s(0.035)], color: '#2b2e36' })
    }
  }
  // The docking tunnel, its ring, the beacon and an antenna.
  body.add(GEO.cylinder, { position: at(0, 2.98, 0), scale: [s(0.46), s(0.36), s(0.46)], color: '#c3c9d3' })
  body.add(GEO.cylinder, { position: at(0, 3.18, 0), scale: [s(0.56), s(0.08), s(0.56)], color: '#e8452e' })
  glow.add(GEO.sphere, { position: at(0.3, 3.3, 0), scale: s(0.07), color: '#ff3b3b' })
  body.add(GEO.cylinderLow, { position: at(-0.25, 3.55, 0), scale: [s(0.025), s(0.7), s(0.025)], color: '#c3c9d3' })
}

/** A six-wheeled moon rover: chassis, cab with a windscreen, a dish, a solar panel, headlights. Faces +Z. */
export function addRover(c, { color = '#eef1f5', accent = '#ff7a1a' } = {}) {
  const { body, glass, glow } = c
  body.box(0, 0.75, 0, 2.2, 0.45, 4, color)
  body.box(0, 0.98, 0, 2.24, 0.08, 4.04, accent)
  body.box(0, 1.45, 0.9, 1.9, 0.9, 1.6, color)
  glass.box(0, 1.5, 1.71, 1.6, 0.55, 0.05, '#ffffff')
  body.box(0, 1.25, -0.9, 2, 0.06, 1.8, '#1d3a8a')
  for (const side of [-1, 1]) {
    for (const z of [-1.4, 0, 1.4]) body.add(GEO.cylinder, { position: [side * 1.25, 0.42, z], rotation: [0, 0, Math.PI / 2], scale: [0.42, 0.34, 0.42], color: '#2a2d35' })
  }
  body.add(GEO.cylinderLow, { position: [-0.7, 2.3, 0.3], scale: [0.05, 1, 0.05], color: '#c3c9d3' })
  body.add(GEO.cone, { position: [-0.7, 2.85, 0.3], rotation: [-0.7, 0, 0], scale: [0.5, 0.2, 0.5], color })
  glow.box(0.75, 1.15, 2.05, 0.3, 0.16, 0.06, '#fff6d0')
  glow.box(-0.75, 1.15, 2.05, 0.3, 0.16, 0.06, '#fff6d0')
}

/** Shape helpers the other craft recipes (liner.js) build from. */
export { ALONG_Z, FIN, FLAT, mirror, plate, UPRIGHT }
