import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide } from 'three'

import { LAUNCH_CYCLE_MS } from '@shared/balance'
import { mulberry32 } from '@shared/rng'
import { fbm } from '@shared/terrain'
import { EARTH_JET, LAUNCH_PAD, layoutOf, ROCKET, SUIT_SHOP } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getGame, serverNow } from '../../store/game'
import { useQuality } from '../../store/quality'
import { asToyInstance, disposeBlocks } from '../blocks'
import { burst } from '../fx/fxQueue'
import { sharedMaterials, STYLE } from '../materials'
import { useCraft } from './craft'
import { Blinkers, ContactShadows } from './effects'
import { GEO, useBlocks, useProps, useScatter } from './kit'
import SkyBody from './SkyBody'
import { surfaceMaterials, tiledBox, tiledBoxOn, tiledPlane, tiledVault, useSurface } from './surfaces'
import { ParkedJets } from './jets'
import { OxygenStore } from './o2'
import { addSquarePad } from './pads'
import { SuitShop } from './suitShop'
import { addRocket } from './vehicles'

const EARTH = layoutOf('earth')
const Z = EARTH.zones
const PAD = LAUNCH_PAD

const COLORS = {
  white: '#eef1f5',
  steel: '#8d939c',
  gantry: '#d8552c',
  hazard: '#ffc21a',
  crate: '#c8925a',
  crateDark: '#a8743f',
  shop: '#6a4cff',
  cargo: '#ffb21a',
  map: '#3ad6ff',
  boarding: '#3aff8a',
}

/** Seconds the rocket takes to climb out of sight; it's back on the pad after this. */
const CLIMB_S = 13
/** The spaceliner parked on the hangar apron (shared/world.js EARTH_JET). */
const PLANE = { x: EARTH_JET.x, z: EARTH_JET.z }

/** Inside the perimeter wall (plus a margin) the ground is flat; outside it rolls into hills. */
const FLAT = { minX: -70, maxX: 70, minZ: -76, maxZ: 62 }
function hillAt(x, z) {
  const dx = Math.max(FLAT.minX - x, 0, x - FLAT.maxX)
  const dz = Math.max(FLAT.minZ - z, 0, z - FLAT.maxZ)
  const d = Math.hypot(dx, dz)
  if (d <= 0) return 0
  const rise = Math.min(1, d / 60)
  return rise * rise * (3 - 2 * rise) * (5 + (fbm(x / 45, z / 45, 77) + 0.5) * 9)
}

const _c = new Color()
const _dry = new Color(1.12, 1.05, 0.7)

/** The ground: grass to the horizon, flat inside the wall, hills outside, its green varied in broad patches. */
function useGround(segments) {
  return useSurface(
    (add) => {
      const g = tiledPlane(560, 560, 6, { segments })
      const pos = g.getAttribute('position')
      const colors = new Float32Array(pos.count * 3)
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i)
        const z = pos.getZ(i)
        pos.setY(i, hillAt(x, z))
        const n = fbm(x / 38, z / 38, 5)
        const dry = Math.max(0, fbm(x / 70, z / 70, 9) - 0.15)
        _c.setRGB(0.92 + n * 0.3, 0.95 + n * 0.25, 0.9 + n * 0.2).lerp(_dry, dry * 1.4)
        colors.set([_c.r, _c.g, _c.b], i * 3)
      }
      g.setAttribute('color', new BufferAttribute(colors, 3))
      g.computeVertexNormals()
      add(g)
    },
    surfaceMaterials().grass,
    segments,
  )
}

/**
 * The mountain range round the horizon: one ring of ridges, forested at the foot, bare rock
 * higher up and snow on the peaks - hazy in the fog, as far mountains are.
 */
function useMountains() {
  const mesh = useMemo(() => {
    const A = 120
    const rows = [
      [118, 0],
      [132, 0.3],
      [146, 0.75],
      [158, 1],
      [172, 0.82],
      [186, 0.55],
    ]
    const positions = []
    const colors = []
    const forest = new Color('#46634f')
    const rock = new Color('#76838d')
    const snow = new Color('#f1f4f7')
    for (let j = 0; j < rows.length; j += 1) {
      const [r, k] = rows[j]
      for (let i = 0; i <= A; i += 1) {
        const a = (i / A) * Math.PI * 2
        const ridge = 0.5 + 0.5 * Math.sin(a * 5 + 1.3) * Math.sin(a * 3.1) + 0.35 * Math.sin(a * 17 + j)
        const peak = 22 + ridge * 38
        const y = k * peak + (j > 0 ? Math.sin(a * 41 + j * 2) * 1.6 : 0)
        positions.push(Math.cos(a) * r, y, Math.sin(a) * r)
        const rel = y / 60
        _c.copy(forest)
        if (rel > 0.28) _c.lerp(rock, Math.min(1, (rel - 0.28) / 0.25))
        if (rel > 0.62) _c.lerp(snow, Math.min(1, (rel - 0.62) / 0.12))
        colors.push(_c.r, _c.g, _c.b)
      }
    }
    const index = []
    for (let j = 0; j < rows.length - 1; j += 1) {
      for (let i = 0; i < A; i += 1) {
        const a = j * (A + 1) + i
        const b = a + A + 1
        index.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
    g.setAttribute('aStyle', new BufferAttribute(new Float32Array(positions.length / 3).fill(STYLE.SMOOTH), 1))
    g.setIndex(index)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return asToyInstance(g, sharedMaterials().toy)
  }, [])
  useEffect(() => () => disposeBlocks(mesh), [mesh])
  return mesh
}

/** Trees outside the wall, on the hills: pines and round leafy trees, each a slightly different green. */
function useTreePlaces(density) {
  return useMemo(() => {
    const out = { pine: [], leafy: [] }
    const rand = mulberry32(12345)
    const want = Math.round(190 * density)
    let tries = 0
    while (out.pine.length + out.leafy.length < want && tries < want * 30) {
      tries += 1
      const x = (rand() * 2 - 1) * 125
      const z = (rand() * 2 - 1) * 125
      const r = Math.hypot(x, z)
      const outside = x < FLAT.minX + 3 || x > FLAT.maxX - 3 || z < FLAT.minZ + 3 || z > FLAT.maxZ - 3
      if (!outside || r > 122) continue
      const g = 0.82 + rand() * 0.3
      const place = { x, y: hillAt(x, z), z, s: 0.75 + rand() * 0.8, r: rand() * 6.28, tint: `rgb(${Math.round(235 * g)}, ${Math.round(255 * g)}, ${Math.round(225 * g)})` }
      ;(rand() < 0.62 ? out.pine : out.leafy).push(place)
    }
    return out
  }, [density])
}

/** Lamp posts along the walkways (their lamps glow), and the plaza's flower planters. */
const LAMPS = [
  [-6, 40],
  [6, 40],
  [-6, 26],
  [6, 26],
  [-6, 4],
  [6, 4],
  [-6, -18],
  [6, -18],
]
const PLANTERS = [
  [-12, 38],
  [12, 38],
  [-12, -24],
  [12, -24],
]
const FLOWERS = ['#ff5f8a', '#ffd21f', '#b77bff', '#ffffff', '#ff8a3a']

/** Red warning lights: the gantry's top, the antenna, the hangar roof, the fuel tanks. */
const BLINKERS = [
  { x: PAD.x + 7.6, y: PAD.height + 28.4, z: ROCKET.z, color: '#ff3b3b', size: 0.35 },
  { x: -41, y: 14.6, z: -8, color: '#ff3b3b', size: 0.3 },
  { x: 50, y: 13.4, z: -11, color: '#ff3b3b', size: 0.3 },
  { x: 50, y: 13.4, z: 15, color: '#ff3b3b', size: 0.3 },
  { x: 32, y: 8.9, z: -32, color: '#ffb21a', size: 0.25 },
  { x: 36.5, y: 8.9, z: -32, color: '#ffb21a', size: 0.25 },
]

/** What throws a soft shadow on the ground: [x, z, width, depth, height, floor]. */
const SHADOW_RECTS = [
  [-38, -4, 17, 21, 9],
  [50, 2, 21, 29, 12],
  [SUIT_SHOP.x, SUIT_SHOP.z, SUIT_SHOP.w + 0.4, SUIT_SHOP.d + 0.4, 6],
  [PAD.x, PAD.z, 23, 23, 1.4],
  [PAD.x + 7.6, ROCKET.z, 4.6, 4.6, 28, PAD.height],
  [34.25, -32, 9.5, 4.8, 9],
  [-26.6, 9.6, 3, 3, 2.6],
  [-25, 17, 3, 3, 2.6],
  [PLANE.x, PLANE.z - 0.3, 3.6, 18.4, 2.2],
  [PLANE.x, PLANE.z - 1.4, 13.4, 4.2, 1.2],
].map(([x, z, w, d, h, y]) => ({ x, z, w, d, h, y }))

/**
 * Earth's spaceport - the lobby, and the only place in the start-up bundle. A concrete
 * plaza in a green valley ringed by mountains: Mission Control (three floors of glass) to
 * the west, the corrugated hangar and its apron to the east with a spaceplane parked on
 * it, the Cargo Pad and the Suit Shop either side of the Star Map console, and up north
 * the launch pad, its gantry and the rocket, which lifts off for real on the shared
 * schedule.
 *
 * Surfaces are textured (textures.js) and merged per material; props are merged toy
 * blocks; soft contact shadows ground everything, on every preset. About 25 draw calls.
 */
export function EarthBase() {
  const density = useQuality((s) => s.settings.decorDensity)
  const level = useQuality((s) => s.level)
  const mats = surfaceMaterials()

  const ground = useGround(level === 'LOW' ? 56 : 80)
  const mountains = useMountains()

  const concrete = useSurface((add) => {
    // The plaza, the apron round the launch pad, their curbs.
    add(tiledPlane(100, 80, 12, { x: 0, y: 0.02, z: 10 }))
    add(tiledPlane(36, 14, 12, { x: 0, y: 0.021, z: -37 }))
    for (const [x, z, w, d] of [
      [0, 50.2, 100.8, 0.4],
      [0, -29.8, 32, 0.4],
      [-50.2, 10, 0.4, 80.8],
      [50.2, 10, 0.4, 80.8],
    ])
      add(tiledBoxOn(w, 0.16, d, 2, { x, z }))
    // The launch pad deck's sides, and the perimeter wall.
    add(tiledBoxOn(PAD.half * 2, PAD.height - 0.01, PAD.half * 2, 4, { x: PAD.x, z: PAD.z }))
    const { minX, maxX, minZ, maxZ } = EARTH.bounds
    add(tiledBoxOn(maxX - minX + 2.4, 1.3, 1.2, 4, { x: 0, z: minZ - 0.6 }))
    add(tiledBoxOn(maxX - minX + 2.4, 1.3, 1.2, 4, { x: 0, z: maxZ + 0.6 }))
    add(tiledBoxOn(1.2, 1.3, maxZ - minZ, 4, { x: minX - 0.6, z: (minZ + maxZ) / 2 }))
    add(tiledBoxOn(1.2, 1.3, maxZ - minZ, 4, { x: maxX + 0.6, z: (minZ + maxZ) / 2 }))
    // Mission Control's plinth and roof parapet.
    add(tiledBoxOn(17, 0.4, 21, 4, { x: -38, z: -4 }))
    add(tiledBoxOn(16.6, 0.7, 0.4, 4, { x: -38, base: 9.4, z: 6.1 }))
    add(tiledBoxOn(16.6, 0.7, 0.4, 4, { x: -38, base: 9.4, z: -14.1 }))
    add(tiledBoxOn(0.4, 0.7, 20.6, 4, { x: -29.9, base: 9.4, z: -4 }))
    add(tiledBoxOn(0.4, 0.7, 20.6, 4, { x: -46.1, base: 9.4, z: -4 }))
  }, mats.concrete)

  const roof = useSurface((add) => add(tiledPlane(16, 20, 12, { x: -38, y: 9.42, z: -4 })), mats.roof)

  const asphalt = useSurface((add) => {
    // The hangar apron, and a taxiway strip in front of the hangar door.
    add(tiledPlane(18, 34, 4, { x: 31, y: 0.026, z: 2 }))
    add(tiledPlane(8, 34, 4, { x: 44, y: 0.025, z: 2 }))
  }, mats.asphalt)

  const tread = useSurface((add) => {
    add(tiledPlane(PAD.half * 2, PAD.half * 2, 2, { x: PAD.x, y: PAD.height, z: PAD.z }))
    const rampLength = Math.hypot(7, PAD.height)
    add(tiledBox(8, 0.3, rampLength, 2, { x: PAD.x, y: PAD.height / 2 - 0.12, z: PAD.z + PAD.half + 3.5, rotX: Math.atan2(PAD.height, 7) }))
  }, mats.tread)

  const facade = useSurface((add) => add(tiledBoxOn(16, 9, 20, [6, 3], { x: -38, base: 0.4, z: -4 })), mats.facade)

  const corrugated = useSurface((add) => {
    add(tiledBoxOn(20, 10, 28, 2, { x: 50, z: 2 }))
    add(tiledVault(10, 28.6, 2, { x: 50, y: 10, z: 2, squash: 0.32 }))
  }, mats.corrugated)

  const blocks = useBlocks((b) => {
    // Painted lines: walkways from spawn to the pads, the yellow line to the launch pad,
    // the taxi line and parking box on the apron.
    b.addOn(-10, 0.02, 21, 1.2, 0.02, 14, '#f4f6f8', STYLE.SMOOTH, 0.95)
    // ...and along the south row, to the Suit Shop (east) and the Oxygen Store (west).
    b.addOn(13.2, 0.02, 30.3, 17, 0.02, 1.2, '#f4f6f8', STYLE.SMOOTH)
    b.addOn(-13.2, 0.02, 30.3, 16, 0.02, 1.2, '#f4f6f8', STYLE.SMOOTH)
    b.addOn(0, 0.02, -8, 1.2, 0.02, 34, COLORS.hazard, STYLE.SMOOTH)
    b.addOn(37, 0.03, 2, 0.35, 0.02, 34, COLORS.hazard, STYLE.SMOOTH)
    for (const [x, z, w, d] of [
      [PLANE.x, PLANE.z - 10.5, 15, 0.3],
      [PLANE.x, PLANE.z + 10.5, 15, 0.3],
      [PLANE.x - 7.5, PLANE.z, 0.3, 21],
      [PLANE.x + 7.5, PLANE.z, 0.3, 21],
    ])
      b.addOn(x, 0.03, z, w, 0.02, d, '#f4f6f8', STYLE.SMOOTH)
    // Mission Control's entrance: a door and its canopy.
    b.addOn(-29.75, 0.4, 2, 0.3, 2.8, 3.4, '#24303f', STYLE.SMOOTH)
    b.addOn(-28.8, 3.4, 2, 2.4, 0.2, 4.4, COLORS.white, STYLE.SMOOTH)
    // The hangar door: a dark panel in its frame, with ribs.
    b.addOn(39.9, 0, 2, 0.3, 8, 18, '#5d6673', STYLE.SMOOTH)
    for (let i = 0; i < 6; i += 1) b.addOn(39.75, 0, -6 + i * 3.2 + 1.6, 0.2, 8, 0.15, '#47505c', STYLE.SMOOTH)
    b.addOn(39.8, 8, 2, 0.5, 0.5, 18.6, COLORS.hazard, STYLE.SMOOTH)
    // The Cargo depot's crate stacks.
    for (const [x, z, y, s] of [
      [-27, 9.5, 0, 1.4],
      [-27, 9.5, 1.4, 1.2],
      [-25.8, 8.6, 0, 1.1],
      [-25.5, 16.5, 0, 1.5],
      [-25.5, 16.5, 1.5, 1.1],
      [-24.6, 17.4, 0, 1],
    ]) {
      b.addOn(x, y, z, s, s, s, COLORS.crate, STYLE.SMOOTH, 0.2)
      b.addOn(x, y + s - 0.02, z, s + 0.02, 0.04, s * 0.22, COLORS.crateDark, STYLE.SMOOTH, 0.2)
    }
    // The Star Map console's pedestal.
    b.addOn(0, 0, 12.1, 1.8, 1, 1, '#2a3446', STYLE.SMOOTH)
    // Hazard edging round the pad deck, the flame trench under the rocket.
    for (const [x, z, sx, sz] of [
      [PAD.x, PAD.z + PAD.half - 0.2, PAD.half * 2, 0.4],
      [PAD.x, PAD.z - PAD.half + 0.2, PAD.half * 2, 0.4],
      [PAD.x - PAD.half + 0.2, PAD.z, 0.4, PAD.half * 2],
      [PAD.x + PAD.half - 0.2, PAD.z, 0.4, PAD.half * 2],
    ])
      b.addOn(x, PAD.height, z, sx, 0.03, sz, COLORS.hazard, STYLE.SMOOTH)
    b.addOn(ROCKET.x, PAD.height, ROCKET.z, 5, 0.04, 5, '#30343b', STYLE.SMOOTH)
    // The gantry tower: four posts, cross beams every 3 m, braces, two arms to the rocket.
    const gx = PAD.x + 7.6
    const gz = ROCKET.z
    for (const [dx, dz] of [
      [-1.8, -1.8],
      [1.8, -1.8],
      [-1.8, 1.8],
      [1.8, 1.8],
    ])
      b.addOn(gx + dx, PAD.height, gz + dz, 0.4, 28, 0.4, COLORS.gantry, STYLE.SMOOTH)
    for (let y = 3; y < 28; y += 3) {
      b.addOn(gx, PAD.height + y, gz - 1.8, 4, 0.3, 0.3, COLORS.gantry, STYLE.SMOOTH)
      b.addOn(gx, PAD.height + y, gz + 1.8, 4, 0.3, 0.3, COLORS.gantry, STYLE.SMOOTH)
      b.addOn(gx - 1.8, PAD.height + y, gz, 0.3, 0.3, 4, COLORS.gantry, STYLE.SMOOTH)
      b.addOn(gx + 1.8, PAD.height + y, gz, 0.3, 0.3, 4, COLORS.gantry, STYLE.SMOOTH)
      b.add(gx, PAD.height + y - 1.5, gz + 1.8, 0.16, 4.2, 0.16, COLORS.gantry, STYLE.SMOOTH, 0, 0, 0.93)
      b.add(gx - 1.8, PAD.height + y - 1.5, gz, 0.16, 4.2, 0.16, COLORS.gantry, STYLE.SMOOTH, 0, 0.93, 0)
    }
    for (const y of [12, 20]) b.addOn(gx - 3.6, PAD.height + y, gz, 3.6, 0.4, 1.2, COLORS.steel, STYLE.PLATE)
  }, '')

  const props = useProps((b) => {
    // Rings on the floor: the Cargo Pad, the Suit Shop's mat, the Star Map, boarding.
    const ring = (zone, color, y = 0) => addSquarePad(b, zone, color, y)
    ring(Z.cargo, COLORS.cargo)
    ring(Z.suits, COLORS.shop)
    ring(Z.map, COLORS.map)
    ring(Z.boarding, COLORS.boarding, PAD.height)
    // The Star Map's globe.
    b.add(GEO.sphere, { position: [0, 1.9, 12.1], scale: 0.75, color: '#2a3cff', style: STYLE.GALAXY })
    b.add(GEO.ring, { position: [0, 1.9, 12.1], rotation: [1.2, 0, 0.3], scale: [1.05, 1.05, 1], color: COLORS.map, style: STYLE.GLOW })
    // Mission Control's roof: the antenna, the radar dish's pedestal (the dish turns:
    // RadarDish), two plant boxes.
    b.add(GEO.cylinderLow, { position: [-41, 12, -8], scale: [0.2, 5, 0.2], color: COLORS.steel, style: STYLE.SMOOTH })
    b.add(GEO.cylinder, { position: [-36, 10.4, 0], scale: [0.9, 1.6, 0.9], color: COLORS.steel, style: STYLE.SMOOTH })
    for (const z of [-10, 2]) {
      b.box(-42, 9.95, z, 3, 0.9, 2, '#9aa1ad', STYLE.SMOOTH)
      b.add(GEO.sphere, { position: [-42, 10.5, z], scale: [1.3, 0.5, 0.8], color: '#3fae4a', style: STYLE.SMOOTH })
    }
    // Fuel tanks, east of the pad, and their pipe.
    for (const [x, z] of [
      [32, -32],
      [36.5, -32],
    ]) {
      b.add(GEO.cylinder, { position: [x, 4, z], scale: [2, 8, 2], color: COLORS.white, style: STYLE.SMOOTH })
      b.add(GEO.sphere, { position: [x, 8, z], scale: [2, 0.8, 2], color: COLORS.white, style: STYLE.SMOOTH })
      b.add(GEO.cylinder, { position: [x, 3, z], scale: [2.04, 0.6, 2.04], color: COLORS.gantry, style: STYLE.SMOOTH })
      b.add(GEO.cylinder, { position: [x, 6, z], scale: [2.03, 0.12, 2.03], color: '#aab2bd', style: STYLE.SMOOTH })
    }
    b.add(GEO.cylinderLow, { position: [20, 0.5, -32], rotation: [0, 0, Math.PI / 2], scale: [0.25, 18, 0.25], color: COLORS.steel, style: STYLE.SMOOTH })
    // Floodlight masts at the pad's corners.
    for (const [x, z] of [
      [-14, -58],
      [14, -58],
      [-14, -30],
    ]) {
      b.add(GEO.cylinderLow, { position: [x, 7, z], scale: [0.18, 14, 0.18], color: COLORS.steel, style: STYLE.SMOOTH })
      b.box(x, 14.2, z, 1.6, 0.6, 0.5, '#fff6d0', STYLE.GLOW)
    }
    // Lamp posts, planters with flowers, flags at the plaza's south edge.
    for (const [x, z] of LAMPS) {
      b.add(GEO.cylinderLow, { position: [x, 2.2, z], scale: [0.1, 4.4, 0.1], color: '#3a3f4a', style: STYLE.SMOOTH })
      b.add(GEO.sphere, { position: [x, 4.5, z], scale: 0.32, color: '#fff3c4', style: STYLE.GLOW })
    }
    for (const [x, z] of PLANTERS) {
      b.box(x, 0.35, z, 2.4, 0.7, 2.4, '#aeb3bc', STYLE.SMOOTH)
      b.box(x, 0.72, z, 2.1, 0.06, 2.1, '#5c3f26', STYLE.SMOOTH)
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2
        b.add(GEO.sphere, { position: [x + Math.cos(a) * 0.6, 0.95, z + Math.sin(a) * 0.6], scale: 0.28, color: FLOWERS[i % FLOWERS.length], style: STYLE.SMOOTH })
      }
      b.add(GEO.sphere, { position: [x, 1.15, z], scale: [0.55, 0.5, 0.55], color: '#3fae4a', style: STYLE.SMOOTH })
    }
    for (const [i, x] of [-12, -6, 6, 12].entries()) {
      b.add(GEO.cylinderLow, { position: [x, 4, 46], scale: [0.09, 8, 0.09], color: '#d7dce3', style: STYLE.SMOOTH })
      b.box(x + 0.95, 7.2, 46, 1.8, 1.1, 0.04, i % 2 ? '#2f6fe0' : '#e8452e', STYLE.SMOOTH)
      b.box(x + 0.95, 7.2, 46.03, 1.2, 0.22, 0.04, '#ffffff', STYLE.SMOOTH)
    }
  }, '')

  const treePlaces = useTreePlaces(density)
  const pines = useScatter(
    (b) => {
      b.add(GEO.cylinderLow, { position: [0, 1, 0], scale: [0.32, 2, 0.32], color: '#6e4728', style: STYLE.SMOOTH })
      b.add(GEO.coneLow, { position: [0, 3.1, 0], scale: [2.3, 3.2, 2.3], color: '#2f6b35', style: STYLE.SMOOTH })
      b.add(GEO.coneLow, { position: [0, 4.9, 0], scale: [1.8, 2.8, 1.8], color: '#367a3c', style: STYLE.SMOOTH, rotation: [0, 0.5, 0] })
      b.add(GEO.coneLow, { position: [0, 6.6, 0], scale: [1.2, 2.3, 1.2], color: '#3f8a44', style: STYLE.SMOOTH, rotation: [0, 1, 0] })
    },
    treePlaces.pine,
  )
  const leafy = useScatter(
    (b) => {
      b.add(GEO.cylinderLow, { position: [0, 1.3, 0], scale: [0.3, 2.6, 0.3], color: '#6e4728', style: STYLE.SMOOTH })
      b.add(GEO.rock, { position: [0, 3.6, 0], scale: [2.1, 1.8, 2.1], color: '#4f9a3f', style: STYLE.SMOOTH })
      b.add(GEO.rock, { position: [0.9, 4.3, 0.4], scale: [1.3, 1.2, 1.3], color: '#5aab48', style: STYLE.SMOOTH, rotation: [0.4, 1, 0] })
      b.add(GEO.rock, { position: [-0.8, 4.1, -0.5], scale: [1.2, 1.1, 1.2], color: '#468c38', style: STYLE.SMOOTH, rotation: [1, 0.3, 0] })
    },
    treePlaces.leafy,
  )
  const treeShadows = useMemo(() => [...treePlaces.pine, ...treePlaces.leafy].map((t) => ({ x: t.x, z: t.z, y: t.y, r: 2 * t.s, h: 6 * t.s })), [treePlaces])

  return (
    <group>
      {ground && <primitive object={ground} />}
      <primitive object={mountains} />
      {concrete && <primitive object={concrete} />}
      {roof && <primitive object={roof} />}
      {asphalt && <primitive object={asphalt} />}
      {tread && <primitive object={tread} />}
      {facade && <primitive object={facade} />}
      {corrugated && <primitive object={corrugated} />}
      <primitive object={blocks} />
      {props && <primitive object={props} />}
      {pines && <primitive object={pines} />}
      {leafy && <primitive object={leafy} />}
      <ParkedJets place="earth" />
      <OxygenStore place="earth" />
      <SuitShop />
      <ContactShadows rects={SHADOW_RECTS} discs={treeShadows} />
      <RadarDish />
      <Blinkers lights={BLINKERS} period={1.5} duty={0.3} />
      <LaunchRocket />
      <BoardingBeam />
      {/* The Moon, pale in the day sky. */}
      <SkyBody body="moon" direction={[0.6, 0.45, -0.7]} size={0.05} spin={0} />
    </group>
  )
}

/** The radar dish on Mission Control's roof, sweeping round and round. */
function RadarDish() {
  const ref = useRef(null)
  const dish = useProps((b) => {
    b.add(GEO.cone, { position: [0, 0.6, 0.4], rotation: [-1.1, 0, 0], scale: [2.6, 0.9, 2.6], color: COLORS.white, style: STYLE.SMOOTH })
    b.add(GEO.cylinderLow, { position: [0, 0.9, 1.2], rotation: [-1.1, 0, 0], scale: [0.07, 1.8, 0.07], color: COLORS.steel, style: STYLE.SMOOTH })
    b.add(GEO.sphere, { position: [0, 1.5, 1.9], scale: 0.2, color: '#ff3b3b', style: STYLE.GLOW })
  }, '')
  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.6
  })
  return (
    <group ref={ref} position={[-36, 11.6, 0]}>
      {dish && <primitive object={dish} />}
    </group>
  )
}

/**
 * The rocket on the pad, which really launches on the shared schedule (balance
 * LAUNCH_CYCLE_MS, on the server's clock): ignition, a climb out of sight, and a fresh
 * one back on the pad a few seconds later. Its flame shows while it burns.
 */
function LaunchRocket() {
  const ref = useRef(null)
  const flameRef = useRef(null)
  const lastPhase = useRef(-1)
  const rocket = useCraft((c) => addRocket(c), '')

  useFrame((state) => {
    const group = ref.current
    if (!group) return
    const t = (serverNow() % LAUNCH_CYCLE_MS) / 1000
    const flying = t < CLIMB_S
    // Lift-off: a puff of smoke and a rumble, once per launch (and only if you're here).
    const phase = Math.floor(serverNow() / LAUNCH_CYCLE_MS)
    if (phase !== lastPhase.current) {
      if (lastPhase.current !== -1 && flying && t < 1 && !getGame().trip) {
        burst({ x: ROCKET.x, y: PAD.height + 1, z: ROCKET.z, count: 50, palette: 'smoke', speed: 7 })
        sfx.rumble()
      }
      lastPhase.current = phase
    }
    const climb = flying ? 1.6 * t * t : 0
    group.position.set(ROCKET.x, PAD.height + climb, ROCKET.z)
    group.visible = climb < 400
    const flame = flameRef.current
    if (flame) {
      flame.visible = flying
      if (flying) flame.scale.set(1, 1 + Math.sin(state.clock.elapsedTime * 50) * 0.12 + Math.min(1.5, t * 0.3), 1)
    }
  })

  return (
    <group ref={ref}>
      <primitive object={rocket} />
      <mesh ref={flameRef} position={[0, -2.6, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
        <coneGeometry args={[1.3, 6, 12, 1, true]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
      </mesh>
    </group>
  )
}

/** A soft column of green light over the boarding ring, so you can see it from anywhere. */
function BoardingBeam() {
  const ref = useRef(null)
  useFrame((state) => {
    if (ref.current) ref.current.material.opacity = 0.12 + Math.sin(state.clock.elapsedTime * 2.5) * 0.04
  })
  return (
    <mesh ref={ref} position={[Z.boarding.x, PAD.height + 2.5, Z.boarding.z]}>
      <cylinderGeometry args={[Z.boarding.radius, Z.boarding.radius, 5, 24, 1, true]} />
      <meshBasicMaterial color={COLORS.boarding} transparent opacity={0.14} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
    </mesh>
  )
}

export default EarthBase
