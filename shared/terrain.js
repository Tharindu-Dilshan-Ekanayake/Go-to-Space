import { destinationById } from './balance.js'
import { hash2, mulberry32 } from './rng.js'

/**
 * Each destination's ground: rolling hills, craters (a bowl with a raised rim) and, past
 * the edge of where you can walk, a ring of mountains closing the view. Flat where the
 * outpost, the pads and the paths between them are, so everything there stands level.
 *
 * Pure and seeded: the server, the client's collision and the client's terrain mesh all
 * get exactly the same height for the same spot.
 */

/** How each destination's land is shaped. `hills` metres of roll, `craters` how many, `dunes` ripples (Mars). */
const SHAPES = {
  moon: { hills: 2.6, scale: 34, craters: 26, crater: [4, 13], rim: 0.9, mountains: 26 },
  mars: { hills: 3.2, scale: 46, craters: 8, crater: [5, 12], rim: 0.6, mountains: 30, dunes: 0.55 },
  venus: { hills: 2.2, scale: 28, craters: 4, crater: [4, 9], rim: 0.5, mountains: 22 },
  mercury: { hills: 2.8, scale: 30, craters: 32, crater: [3, 12], rim: 1, mountains: 24 },
  europa: { hills: 1.2, scale: 40, craters: 3, crater: [4, 8], rim: 0.4, mountains: 16 },
  io: { hills: 2.4, scale: 32, craters: 6, crater: [4, 9], rim: 0.6, mountains: 28 },
  ganymede: { hills: 2.6, scale: 36, craters: 20, crater: [4, 12], rim: 0.8, mountains: 24 },
  callisto: { hills: 3, scale: 30, craters: 34, crater: [3, 14], rim: 1, mountains: 26 },
  titan: { hills: 2, scale: 44, craters: 4, crater: [5, 10], rim: 0.5, mountains: 20, lakes: true },
}

/** Where the land is kept flat: [x, z, radius] (it eases back to hills over FLAT_EASE metres). */
export const FLAT_SPOTS = [
  [-16, -10, 18],
  [-14, 2, 7],
  [14, 2, 7],
  [0, 30, 11],
  [0, 12, 10],
  [8, -8, 5],
  // The safe room (world.js SAFE_ROOM).
  [-29, -6, 9],
]
const FLAT_EASE = 10
/** Mountains start rising past this distance from the middle (walls in the walkable edge at 58). */
const MOUNTAIN_START = 66

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Smooth value noise in [0, 1]. */
function noise(x, z, seed) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const fx = x - xi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)
  const a = hash2(xi, zi, seed)
  const b = hash2(xi + 1, zi, seed)
  const c = hash2(xi, zi + 1, seed)
  const d = hash2(xi + 1, zi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Three octaves of noise, centred on 0 (about -0.5..0.5). */
export function fbm(x, z, seed) {
  return noise(x, z, seed) * 0.57 + noise(x * 2.03, z * 2.03, seed + 7) * 0.29 + noise(x * 4.1, z * 4.1, seed + 13) * 0.14 - 0.5
}

const seedOf = (place) => [...place].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 17)

const cache = new Map()

/** A destination's terrain description: its shape, seed and craters (made once). */
export function terrainOf(place) {
  let t = cache.get(place)
  if (t) return t
  const shape = SHAPES[place]
  if (!shape || !destinationById(place)) return null
  const seed = seedOf(place)
  const rand = mulberry32(seed)
  const craters = []
  let tries = 0
  while (craters.length < shape.craters && tries < shape.craters * 30) {
    tries += 1
    const r = shape.crater[0] + rand() * rand() * (shape.crater[1] - shape.crater[0])
    const x = (rand() * 2 - 1) * 120
    const z = (rand() * 2 - 1) * 120
    // Keep craters off the flat spots (their rims would spill onto the pads).
    if (FLAT_SPOTS.some(([fx, fz, fr]) => Math.hypot(x - fx, z - fz) < fr + r + 4)) continue
    craters.push({ x, z, r, depth: r * (0.16 + rand() * 0.1) })
  }
  t = { shape, seed, craters }
  cache.set(place, t)
  return t
}

/** 0 on the flat spots, easing up to 1 away from them. */
export function wildness(x, z) {
  let m = Infinity
  for (const [fx, fz, fr] of FLAT_SPOTS) m = Math.min(m, Math.hypot(x - fx, z - fz) - fr)
  return smooth(0, FLAT_EASE, m)
}

/** How far a crater sinks (or its rim rises) the ground at (x, z). */
function craterAt(c, x, z, rim) {
  const d = Math.hypot(x - c.x, z - c.z)
  if (d > c.r * 1.7) return 0
  const q = d / c.r
  const bowl = q < 1 ? -c.depth * (1 - q * q) : 0
  const lip = c.depth * rim * Math.exp(-(((q - 1) / 0.32) ** 2))
  return bowl + lip
}

/**
 * Ground height at (x, z) on `place` (0 anywhere that isn't a destination). Titan's
 * hollows fill with methane lakes: the ground there sits at the lake's level.
 */
export function terrainHeight(place, x, z) {
  const t = terrainOf(place)
  if (!t) return 0
  const { shape, seed, craters } = t
  let h = fbm(x / shape.scale, z / shape.scale, seed) * 2 * shape.hills
  if (shape.dunes) h += Math.sin(x * 0.18 + fbm(x / 30, z / 30, seed + 3) * 6) * shape.dunes
  for (let i = 0; i < craters.length; i += 1) h += craterAt(craters[i], x, z, shape.rim)
  h *= wildness(x, z)
  // The mountains round the basin.
  const r = Math.max(Math.abs(x), Math.abs(z))
  if (r > MOUNTAIN_START) {
    const rise = smooth(MOUNTAIN_START, MOUNTAIN_START + 70, r)
    h += rise * shape.mountains * (0.55 + noise(x / 26, z / 26, seed + 21) * 0.9)
  }
  if (shape.lakes) h = Math.max(h, LAKE_LEVEL)
  return h
}

/** Titan's methane lakes lie at this height. */
export const LAKE_LEVEL = -0.9

/** Cheap per-spot variety in [0, 1) for colouring the ground (seeded). */
export const speckle = (place, x, z) => hash2(Math.floor(x * 2), Math.floor(z * 2), seedOf(place) + 99)
