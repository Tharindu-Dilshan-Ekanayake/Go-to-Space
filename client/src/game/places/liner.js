import { CylinderGeometry, LatheGeometry, TorusGeometry, Vector2 } from 'three'

import { JET_KINDS, LINER_GEAR } from '@shared/world'

import { GEO } from './kit'
import { ALONG_Z, FIN, FLAT, mirror, plate, UPRIGHT } from './vehicles'

/** The fuselage radius, and the glass-roofed cabin from z CABIN[0] to CABIN[1]. */
const LR = 1.7
const CABIN = [-5.0, 5.6]
const CABIN_LEN = CABIN[1] - CABIN[0]
/** How far round the hull comes up the sides (radians above the middle) before the glass. */
const RIM = 0.35

/** A part of a cylinder lying along Z: theta 0 is its bottom, PI its top. */
function hullPart(radius, length, thetaStart, thetaLength) {
  const g = new CylinderGeometry(radius, radius, length, 32, 1, true, thetaStart, thetaLength)
  g.rotateX(Math.PI / 2)
  return g
}
const lathe = (points) =>
  new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    32,
  )

const HULL = hullPart(LR, CABIN_LEN, -Math.PI / 2 - RIM, Math.PI + 2 * RIM)
const ROOF = hullPart(LR * 0.995, CABIN_LEN, Math.PI / 2 + RIM, Math.PI - 2 * RIM)
const RIB = new TorusGeometry(LR + 0.02, 0.045, 4, 24, Math.PI - 2 * RIM)
const NOSE = lathe([
  [LR, 0],
  [1.66, 0.8],
  [1.48, 1.7],
  [1.1, 2.5],
  [0.6, 3.1],
  [0.18, 3.42],
  [0, 3.5],
])
const TAIL = lathe([
  [LR, 0],
  [1.62, 1.2],
  [1.35, 2.4],
  [0.95, 3.4],
  [0.55, 4.2],
  [0, 4.3],
])
const WING = [
  [1.4, 0.6],
  [6.6, -2.7],
  [6.6, -3.4],
  [1.4, -3.0],
]
const EDGE = [
  [1.45, 0.55],
  [6.6, -2.7],
  [6.6, -2.95],
  [1.45, 0.2],
]
const STAB = [
  [0.4, -7.4],
  [3.2, -8.6],
  [3.2, -9.1],
  [0.4, -8.9],
]
const WING_R = plate(WING, 0.24)
const WING_L = plate(mirror(WING), 0.24)
const EDGE_R = plate(EDGE, 0.26)
const EDGE_L = plate(mirror(EDGE), 0.26)
const STAB_R = plate(STAB, 0.14)
const STAB_L = plate(mirror(STAB), 0.14)
const TAIL_FIN = plate(
  [
    [-5.6, 0],
    [-8.0, 3.0],
    [-9.0, 3.0],
    [-8.9, 0],
  ],
  0.2,
)

/**
 * The Orbit Express spaceliner, parked by the Earth spaceport: a long white fuselage with
 * a clear glass roof over a cabin of sixteen seats - two by two in eight rows either side
 * of an aisle (shared/world.js JET_KINDS.liner) - so everyone sitting in it shows. A
 * smooth nose with a wraparound windscreen, a tapering tail with a tall fin and
 * stabilisers, low swept wings with coloured leading edges and winglets, two big engines
 * on pylons, a dark belly, glass-roof ribs, lit windows, nav lights, landing gear, and
 * the boarding stair up to the cabin on its left side. Nose along +Z, about 18.6 m long.
 */
export function addSpaceliner(c, { color = '#f3f5f8', accent = '#2f6fe0' } = {}) {
  const { body, glass, glow, clear } = c
  const dark = '#2b2e36'
  const rimY = LR * Math.sin(RIM)
  const rimX = LR * Math.cos(RIM)
  const cz = (CABIN[0] + CABIN[1]) / 2

  // The hull round the cabin, the glass roof over it, its ribs and rim.
  body.add(HULL, { position: [0, 0, cz], color })
  clear.add(ROOF, { position: [0, 0, cz] })
  for (let i = 0; i <= 8; i += 1)
    body.add(RIB, {
      position: [0, 0, CABIN[0] + 0.05 + i * ((CABIN_LEN - 0.1) / 8)],
      rotation: [0, 0, RIM],
      color: '#c3c9d3',
    })
  for (const side of [-1, 1]) {
    body.box(side * rimX, rimY, cz, 0.16, 0.12, CABIN_LEN, accent)
    // The accent stripe down each side, and a row of lit windows above it.
    body.box(side * LR, -0.2, cz, 0.04, 0.24, CABIN_LEN, accent)
    for (let i = 0; i < 9; i += 1) glow.box(side * (LR - 0.005), 0.18, CABIN[0] + 0.7 + i * 1.15, 0.04, 0.22, 0.5, '#bdeeff')
  }

  // Inside: the floor and its aisle, the cabin walls, the bulkheads at either end.
  body.box(0, -0.62, cz, 2.9, 0.12, CABIN_LEN, '#3a3f4a')
  body.box(0, -0.55, cz, 0.5, 0.02, CABIN_LEN, accent)
  for (const side of [-1, 1]) body.box(side * (rimX - 0.12), -0.02, cz, 0.1, 1.2, CABIN_LEN, '#dfe4ea')
  for (const z of CABIN) body.box(0, -0.02, z, 2.9, 1.2, 0.12, '#dfe4ea')
  // Sixteen seats: a cushion, a back, and a headrest in the accent colour.
  for (const [x, y, z] of JET_KINDS.liner.seats) {
    body.box(x, y - 0.06, z, 0.62, 0.12, 0.6, '#3a3f4a')
    body.box(x, y + 0.36, z - 0.36, 0.62, 0.84, 0.12, dark, undefined, [-0.12, 0, 0])
    body.box(x, y + 0.86, z - 0.42, 0.42, 0.22, 0.12, accent, undefined, [-0.12, 0, 0])
  }

  // The nose with its wraparound windscreen; the tail and its cap; the dark belly.
  body.add(NOSE, {
    position: [0, 0, CABIN[1]],
    rotation: [Math.PI / 2, 0, 0],
    color,
  })
  glass.add(GEO.sphere, {
    position: [0, 0.62, CABIN[1] + 1.55],
    scale: [1.32, 0.62, 1.2],
  })
  body.add(TAIL, {
    position: [0, 0, CABIN[0]],
    rotation: [-Math.PI / 2, 0, 0],
    color,
  })
  body.add(GEO.cylinder, {
    position: [0, 0, CABIN[0] - 4.25],
    rotation: ALONG_Z,
    scale: [0.5, 0.12, 0.5],
    color: dark,
  })
  body.box(0, -LR + 0.04, 0, 1.6, 0.14, 15.4, dark)

  // Wings, leading edges, winglets; the tail fin with a white tip; the stabilisers.
  body.add(WING_R, { position: [0, -0.95, 0], rotation: FLAT, color })
  body.add(WING_L, { position: [0, -0.95, 0], rotation: FLAT, color })
  body.add(EDGE_R, { position: [0, -0.94, 0], rotation: FLAT, color: accent })
  body.add(EDGE_L, { position: [0, -0.94, 0], rotation: FLAT, color: accent })
  for (const side of [-1, 1])
    body.add(FIN, {
      position: [side * 6.55, -1.0, -0.4],
      rotation: UPRIGHT,
      scale: [0.6, 0.75, 1.2],
      color: accent,
    })
  body.add(TAIL_FIN, {
    position: [0.1, 0.9, 0],
    rotation: UPRIGHT,
    color: accent,
  })
  body.box(0, 3.75, -8.5, 0.22, 0.3, 1.0, color)
  body.add(STAB_R, { position: [0, 0.35, 0], rotation: FLAT, color })
  body.add(STAB_L, { position: [0, 0.35, 0], rotation: FLAT, color })

  // Two engines on pylons under the wings: intake ring, body, nozzle, hot core.
  for (const side of [-1, 1]) {
    const x = side * 3.7
    body.box(x, -1.32, -1.2, 0.24, 0.5, 1.8, color)
    body.add(GEO.cylinder, {
      position: [x, -1.85, -1.3],
      rotation: ALONG_Z,
      scale: [0.62, 3.2, 0.62],
      color: '#d7dce3',
    })
    body.add(GEO.cylinder, {
      position: [x, -1.85, 0.25],
      rotation: ALONG_Z,
      scale: [0.66, 0.16, 0.66],
      color: accent,
    })
    body.add(GEO.cone, {
      position: [x, -1.85, -3.1],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [0.5, 0.5, 0.5],
      color: dark,
    })
    glow.add(GEO.cylinder, {
      position: [x, -1.85, -3.36],
      rotation: ALONG_Z,
      scale: [0.32, 0.04, 0.32],
      color: '#ffb347',
    })
  }

  // Nav lights: red on the left wingtip, green on the right, white on the fin.
  glow.add(GEO.sphere, {
    position: [-6.62, -0.95, -3.1],
    scale: 0.16,
    color: '#ff3b3b',
  })
  glow.add(GEO.sphere, {
    position: [6.62, -0.95, -3.1],
    scale: 0.16,
    color: '#3bff6a',
  })
  glow.add(GEO.sphere, {
    position: [0.1, 3.95, -8.9],
    scale: 0.14,
    color: '#ffffff',
  })

  // Landing gear: nose and two mains, each a strut and twin wheels.
  const floor = -LINER_GEAR
  const strut = LINER_GEAR - LR + 0.2
  for (const [x, z] of [
    [0, 6.8],
    [-1.7, -1.6],
    [1.7, -1.6],
  ]) {
    body.box(x, floor + 0.34 + strut / 2 - 0.2, z, 0.18, strut, 0.18, '#5d6573')
    for (const dz of [-0.24, 0.24])
      body.add(GEO.cylinder, {
        position: [x, floor + 0.34, z + dz],
        rotation: [0, 0, Math.PI / 2],
        scale: [0.34, 0.26, 0.34],
        color: '#1d2027',
      })
  }

  // The boarding stair, from beside its pad up to the cabin rim on the left side.
  const { door, pad } = JET_KINDS.liner
  const foot = pad.x + 1.2
  const run = door.x - foot
  const rise = rimY - floor
  const length = Math.hypot(run, rise)
  const tilt = Math.atan2(rise, run)
  const mx = (door.x + foot) / 2
  const my = (rimY + floor) / 2
  body.box(mx, my, door.z, length, 0.12, 1.3, '#8d939c', undefined, [0, 0, tilt])
  for (let i = 1; i < 8; i += 1) {
    const t = i / 8
    body.box(foot + run * t, floor + rise * t + 0.08, door.z, 0.08, 0.05, 1.3, '#c3c9d3')
  }
  for (const dz of [-0.68, 0.68]) {
    body.box(mx, my + 0.85, door.z + dz, length, 0.06, 0.06, accent, undefined, [0, 0, tilt])
    body.box(foot, floor + 0.45, door.z + dz, 0.06, 0.9, 0.06, '#8d939c')
    body.box(door.x - 0.05, rimY + 0.45, door.z + dz, 0.06, 0.9, 0.06, '#8d939c')
  }
}
