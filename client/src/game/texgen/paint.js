import { mulberry32 } from '@shared/rng'

/**
 * Every procedural texture in the game, painted into plain RGBA buffers: surfaces
 * (grass, concrete, asphalt, tread plate, glass facade, corrugated metal), the planets
 * (from 3D noise sampled on the sphere: no seams, no pinched poles) and the soft sprites.
 *
 * Pure functions with no DOM, so they run in a Web Worker (worker.js) and never stall a
 * frame. `paintTexture(kind, size)` returns `{ width, height, data }`, rows bottom first
 * (as a GPU data texture expects).
 */

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

// --- Seamless 2D noise (surfaces) -------------------------------------------------------------

/** Integer hash -> [0, 1). */
function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Value noise on a lattice that repeats every `period` cells: tiles seamlessly. */
function tileNoise(x, y, period, seed) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const x0 = ((xi % period) + period) % period
  const y0 = ((yi % period) + period) % period
  const x1 = (x0 + 1) % period
  const y1 = (y0 + 1) % period
  const a = hash(x0, y0, seed)
  const b = hash(x1, y0, seed)
  const c = hash(x0, y1, seed)
  const d = hash(x1, y1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/**
 * Tiling fractal noise at texture coordinate (s, t) in [0, 1): `base` cells across at the
 * first octave, doubling each octave. Returns about [0, 1].
 */
function tileFbm(s, t, base, octaves, seed) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let period = base
  for (let o = 0; o < octaves; o += 1) {
    sum += tileNoise(s * period, t * period, period, seed + o * 17) * amp
    norm += amp
    amp *= 0.5
    period *= 2
  }
  return sum / norm
}


/** A square `size` texture painted per pixel by `shade(s, t, out)` (s, t in [0, 1), t down). */
function paint(size, shade) {
  const data = new Uint8Array(size * size * 4)
  const out = [0, 0, 0]
  for (let y = 0; y < size; y += 1) {
    const row = (size - 1 - y) * size
    for (let x = 0; x < size; x += 1) {
      shade(x / size, y / size, out)
      const i = (row + x) * 4
      data[i] = clamp255(out[0])
      data[i + 1] = clamp255(out[1])
      data[i + 2] = clamp255(out[2])
      data[i + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

const SURFACES = {
  /** Lawn: lighter and darker patches, a fine grain of blades, dry flecks. Tiles every ~6 m. */
  grass(size) {
    const dark = hex('#3f7f2f')
    const light = hex('#69a845')
    const dry = hex('#9a9a52')
    return paint(size, (s, t, out) => {
      const patch = tileFbm(s, t, 4, 3, 1)
      const blades = tileFbm(s, t, 64, 2, 2)
      const fleck = tileNoise(s * 128, t * 128, 128, 3)
      const k = Math.min(1, Math.max(0, patch * 1.4 - 0.2))
      for (let c = 0; c < 3; c += 1) out[c] = dark[c] + (light[c] - dark[c]) * k
      const g = 0.78 + blades * 0.42
      for (let c = 0; c < 3; c += 1) out[c] *= g
      if (fleck > 0.93) for (let c = 0; c < 3; c += 1) out[c] += (dry[c] - out[c]) * 0.6
    })
  },
  /** Poured concrete in 3 m slabs, four by four to the tile (12 m): tone per slab, grain, stains, slim joints. */
  concrete(size) {
    const base = hex('#bab7b0')
    const SLABS = 4
    return paint(size, (s, t, out) => {
      const sx = s * SLABS
      const sy = t * SLABS
      const fx = sx - Math.floor(sx)
      const fy = sy - Math.floor(sy)
      const tone = 0.96 + hash(Math.floor(sx), Math.floor(sy), 7) * 0.07
      const grain = 0.93 + tileFbm(s, t, 96, 2, 8) * 0.12
      const stain = 1 - Math.max(0, tileFbm(s, t, 3, 3, 9) - 0.55) * 0.5
      const joint = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.008 ? 0.7 : 1
      const k = tone * grain * stain * joint
      for (let c = 0; c < 3; c += 1) out[c] = base[c] * k
    })
  },
  /**
   * Station hull plating: 4 m panels, two by two to the tile (8 m). Each panel its own
   * tone, bevelled edges (lit on one side, shaded on the other), a row of rivets inside
   * every edge, a recessed inset, and grime gathered in patches. Tiles every 8 m.
   */
  deck(size) {
    const base = hex('#7f8a9a')
    const P = 2
    return paint(size, (s, t, out) => {
      const px = s * P
      const py = t * P
      const ix = Math.floor(px)
      const iy = Math.floor(py)
      const fx = px - ix
      const fy = py - iy
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy)
      let k = 0.95 + hash(ix, iy, 21) * 0.08
      if (edge < 0.006) k *= 0.5
      else if (edge < 0.022) k *= fx < 0.022 || fy < 0.022 ? 1.14 : 0.84
      else {
        // Rivets: little domes 5 cm across, every 25 cm, 16 cm in from the edge.
        const along = edge === fx || edge === 1 - fx ? fy : fx
        const d = Math.hypot(edge - 0.04, ((along * 16) % 1 - 0.5) / 16)
        if (d < 0.011) k *= 1.22 - d * 12
        else if (d < 0.014) k *= 0.8
        // The inset: a fine groove, then a slightly lighter middle.
        if (edge > 0.115 && edge < 0.122) k *= 0.82
        else if (edge >= 0.122) k *= 1.035
      }
      k *= 0.9 + tileFbm(s, t, 6, 4, 22) * 0.14
      k *= 0.96 + tileFbm(s, t, 160, 2, 23) * 0.07
      for (let c = 0; c < 3; c += 1) out[c] = base[c] * k
    })
  },
  /** Asphalt: dark grain with lighter aggregate, faintly patchy. Tiles every 4 m. */
  asphalt(size) {
    const base = hex('#3c3f45')
    return paint(size, (s, t, out) => {
      const grain = 0.82 + tileFbm(s, t, 128, 2, 11) * 0.3
      const patch = 0.92 + tileFbm(s, t, 3, 2, 12) * 0.14
      const stone = tileNoise(s * 256, t * 256, 256, 13) > 0.9 ? 1.45 : 1
      const k = grain * patch * stone
      for (let c = 0; c < 3; c += 1) out[c] = base[c] * k
    })
  },
  /** Steel tread plate: raised lozenges in alternating directions on brushed grey. Tiles every 2 m. */
  tread(size) {
    const base = hex('#8e949c')
    const N = 16
    return paint(size, (s, t, out) => {
      const cx = s * N
      const cy = t * N
      const ix = Math.floor(cx)
      const iy = Math.floor(cy)
      const fx = cx - ix - 0.5
      const fy = cy - iy - 0.5
      // A lozenge, turned one way or the other on alternate cells.
      const flip = (ix + iy) % 2 === 0 ? 1 : -1
      const a = (fx + flip * fy) * 0.7071
      const b = (fx - flip * fy) * 0.7071
      const lozenge = Math.abs(a) < 0.34 && Math.abs(b) < 0.07
      const lit = lozenge ? (b > 0 ? 1.25 : 0.82) : 1
      const brush = 0.93 + tileNoise(s * 4, t * 256, 4, 14) * 0.1
      const scuff = 1 - Math.max(0, tileFbm(s, t, 4, 3, 15) - 0.6) * 0.6
      const k = lit * brush * scuff
      for (let c = 0; c < 3; c += 1) out[c] = base[c] * k
    })
  },
  /** An office facade, one floor (3 m) by 6 m per tile: tinted glass between white panels, mullions every 1.5 m. */
  facade(size) {
    const glassTop = hex('#a7c3dc')
    const glassLow = hex('#3a5675')
    const panel = hex('#e9ecf0')
    const frame = hex('#5b6470')
    return paint(size, (s, t, out) => {
      // t runs down the texture: 0 the top of the floor, 1 its bottom.
      const mullion = (s * 4) % 1
      const inGlass = t > 0.16 && t < 0.78
      if (mullion < 0.035 || mullion > 0.965 || Math.abs(t - 0.16) < 0.012 || Math.abs(t - 0.78) < 0.012) {
        for (let c = 0; c < 3; c += 1) out[c] = frame[c]
      } else if (inGlass) {
        const g = (t - 0.16) / 0.62
        const pane = Math.floor(s * 4)
        const tint = 0.94 + hash(pane, 1, 21) * 0.12
        const streak = Math.exp(-((((s * 4 + g * 1.4) % 1) - 0.5) ** 2) * 60) * 0.25
        for (let c = 0; c < 3; c += 1) out[c] = (glassTop[c] + (glassLow[c] - glassTop[c]) * g) * tint + 255 * streak
      } else {
        const seam = (s * 8) % 1 < 0.012 ? 0.86 : 1
        for (let c = 0; c < 3; c += 1) out[c] = panel[c] * seam * (0.97 + tileNoise(s * 64, t * 64, 64, 22) * 0.05)
      }
    })
  },
  /** Corrugated cladding: vertical ribs catching the light, faint streaks. Tiles every 2 m. */
  corrugated(size) {
    const base = hex('#c3cad3')
    return paint(size, (s, t, out) => {
      const rib = 0.82 + 0.22 * Math.sin(s * Math.PI * 2 * 20)
      const streak = 0.94 + tileNoise(s * 128, t * 3, 128, 31) * 0.08
      const grime = 1 - Math.max(0, t - 0.75) * 0.35
      const k = rib * streak * grime
      for (let c = 0; c < 3; c += 1) out[c] = base[c] * k
    })
  },
}

/** Sprites, as greyscale masks (alpha maps): a soft shadow (rounded rect or disc), a glow, a puff. */
function mask(out, v, power) {
  const a = 255 * Math.max(0, v) ** power
  out[0] = a
  out[1] = a
  out[2] = a
}
const SPRITES = {
  shadowRect: (size) =>
    paint(size, (s, t, out) => mask(out, 1 - Math.hypot(Math.max(0, Math.abs(s - 0.5) * 2 - 0.55) / 0.45, Math.max(0, Math.abs(t - 0.5) * 2 - 0.55) / 0.45), 1.6)),
  shadowRound: (size) => paint(size, (s, t, out) => mask(out, 1 - Math.hypot(s - 0.5, t - 0.5) * 2, 1.6)),
  glow: (size) => paint(size, (s, t, out) => mask(out, 1 - Math.hypot(s - 0.5, t - 0.5) * 2, 2.2)),
  puff: (size) =>
    paint(size, (s, t, out) => {
      const d = Math.hypot(s - 0.5, t - 0.5) * 2
      const n = tileFbm(s, t, 4, 4, 41)
      mask(out, Math.min(1, (1 - d * (0.75 + n * 0.6)) * 2.2), 1)
    }),
}

// --- 3D noise (planets) ---------------------------------------------------------------------

function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function noise3(x, y, z, seed) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = x - xi
  const fy = y - yi
  const fz = z - zi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const w = fz * fz * (3 - 2 * fz)
  const l = (a, b, t) => a + (b - a) * t
  const c000 = hash3(xi, yi, zi, seed)
  const c100 = hash3(xi + 1, yi, zi, seed)
  const c010 = hash3(xi, yi + 1, zi, seed)
  const c110 = hash3(xi + 1, yi + 1, zi, seed)
  const c001 = hash3(xi, yi, zi + 1, seed)
  const c101 = hash3(xi + 1, yi, zi + 1, seed)
  const c011 = hash3(xi, yi + 1, zi + 1, seed)
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed)
  return l(l(l(c000, c100, u), l(c010, c110, u), v), l(l(c001, c101, u), l(c011, c111, u), v), w)
}

/** Fractal noise on the unit sphere point (x, y, z), `freq` at the first octave; about [0, 1]. */
function fbm3(x, y, z, freq, octaves, seed) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = freq
  for (let o = 0; o < octaves; o += 1) {
    sum += noise3(x * f, y * f, z * f, seed + o * 31) * amp
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / norm
}

// --- Painting -----------------------------------------------------------------------------

const mix = (a, b, t, out) => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  out[0] = a[0] + (b[0] - a[0]) * k
  out[1] = a[1] + (b[1] - a[1]) * k
  out[2] = a[2] + (b[2] - a[2]) * k
  return out
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Paints a 2:1 map `width` wide: `shade(x, y, z, lat, out)` gets the sphere point for each
 * pixel (and its latitude, -PI/2..PI/2) and writes [r, g, b, a?] (0-255) into `out`.
 * Rows are stored bottom first (north last), as a GPU data texture expects.
 */
function paintSphere(width, shade, alpha = false) {
  const height = width / 2
  const data = new Uint8Array(width * height * 4)
  const out = [0, 0, 0, 255]
  for (let py = 0; py < height; py += 1) {
    const lat = Math.PI / 2 - ((py + 0.5) / height) * Math.PI
    const cl = Math.cos(lat)
    const y = Math.sin(lat)
    const row = (height - 1 - py) * width
    for (let px = 0; px < width; px += 1) {
      const lon = ((px + 0.5) / width) * Math.PI * 2
      out[3] = 255
      shade(cl * Math.cos(lon), y, cl * Math.sin(lon), lat, out)
      const i = (row + px) * 4
      data[i] = clamp255(out[0])
      data[i + 1] = clamp255(out[1])
      data[i + 2] = clamp255(out[2])
      data[i + 3] = alpha ? clamp255(out[3]) : 255
    }
  }
  return { width, height, data }
}

/** Random crater centres on the sphere: [x, y, z, angular radius, cos of 1.5 radii (the reach of its rim)]. */
function craterList(seed, count, minR, maxR) {
  const rand = mulberry32(seed)
  const out = []
  for (let i = 0; i < count; i += 1) {
    const u = rand() * 2 - 1
    const a = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = minR + rand() * rand() * (maxR - minR)
    out.push([s * Math.cos(a), u, s * Math.sin(a), r, Math.cos(r * 1.5)])
  }
  return out
}

/** Darkens crater floors and brightens their rims, for the point (x, y, z). */
function craterShade(craters, x, y, z) {
  let k = 1
  for (let i = 0; i < craters.length; i += 1) {
    const c = craters[i]
    const dot = x * c[0] + y * c[1] + z * c[2]
    // Outside this crater's reach (the cheap test that rules out nearly every pixel).
    if (dot < c[4]) continue
    const q = Math.acos(Math.min(1, dot)) / c[3]
    if (q < 0.85) k *= 0.8 + q * 0.1
    else if (q < 1.25) k *= 1.12 - Math.abs(q - 1.05) * 0.5
  }
  return k
}

/** A cratered grey-brown world: base and dark-plain colours, how many craters, extra noise. */
function rocky(width, { base, dark, seed, craters = 60, mare = 0.5, detail = 0.18 }) {
  const b = hex(base)
  const m = hex(dark)
  const list = craterList(seed, craters, 0.02, 0.14)
  const out3 = [0, 0, 0]
  return paintSphere(width, (x, y, z, _lat, out) => {
    const maria = smooth(0.5, 0.62, fbm3(x, y, z, 1.6, 4, seed + 1)) * mare
    mix(b, m, maria, out3)
    const k = (1 - detail / 2 + fbm3(x, y, z, 9, 3, seed + 2) * detail) * craterShade(list, x, y, z)
    out[0] = out3[0] * k
    out[1] = out3[1] * k
    out[2] = out3[2] * k
  })
}

const PAINTERS = {
  earth(width) {
    const deep = hex('#0b2f63')
    const shallow = hex('#2167b0')
    const jungle = hex('#2f6e2c')
    const forest = hex('#4b8a3a')
    const desert = hex('#c6a568')
    const tundra = hex('#8a8c6c')
    const ice = hex('#f2f6fa')
    const c = [0, 0, 0]
    const sea = [0, 0, 0]
    return paintSphere(width, (x, y, z, lat, out) => {
      const land = fbm3(x, y, z, 1.4, 5, 101)
      const absLat = Math.abs(lat) / (Math.PI / 2)
      // Land and sea blend over a band, not a hard line, so the coast stays smooth even
      // when the map is magnified (a 512 map spread across the whole screen).
      const coast = smooth(0.52, 0.56, land)
      if (coast < 1) mix(deep, shallow, smooth(0.42, 0.54, land), sea)
      if (coast > 0) {
        const dry = fbm3(x, y, z, 3, 3, 102)
        // Green round the equator, deserts in the subtropics, forest, then tundra.
        if (absLat < 0.2) mix(jungle, forest, dry, c)
        else if (absLat < 0.42) mix(forest, desert, smooth(0.45, 0.6, dry + (0.35 - Math.abs(absLat - 0.31)) * 0.6), c)
        else if (absLat < 0.7) mix(forest, tundra, smooth(0.55, 0.7, absLat), c)
        else mix(tundra, ice, smooth(0.7, 0.8, absLat), c)
        const k = 0.9 + fbm3(x, y, z, 12, 2, 103) * 0.2
        c[0] *= k
        c[1] *= k
        c[2] *= k
        if (coast < 1) mix(sea, c, coast, c)
      } else {
        c[0] = sea[0]
        c[1] = sea[1]
        c[2] = sea[2]
      }
      if (absLat > 0.86) mix(c, ice, smooth(0.86, 0.9, absLat + fbm3(x, y, z, 6, 2, 104) * 0.04), c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  earthClouds(width) {
    return paintSphere(
      width,
      (x, y, z, lat, out) => {
        // Swirling bands of cloud, thicker at mid-latitudes.
        const warp = fbm3(x, y, z, 2, 3, 201) * 1.5
        const n = fbm3(x + warp, y * 1.6, z + warp, 2.6, 4, 202)
        const band = 0.75 + 0.25 * Math.cos(lat * 6)
        const a = smooth(0.46, 0.8, n * band + 0.05)
        out[0] = 255
        out[1] = 255
        out[2] = 255
        out[3] = a * 235
      },
      true,
    )
  },
  moon: (w) => rocky(w, { base: '#b4b6bb', dark: '#6f7178', seed: 301, craters: 70, mare: 0.85 }),
  mercury: (w) => rocky(w, { base: '#9a948c', dark: '#6c6760', seed: 302, craters: 90, mare: 0.4 }),
  callisto: (w) => rocky(w, { base: '#6b6258', dark: '#463f37', seed: 303, craters: 110, mare: 0.5, detail: 0.3 }),
  ganymede: (w) => rocky(w, { base: '#a39888', dark: '#6a6155', seed: 304, craters: 60, mare: 0.7 }),
  mars(width) {
    const base = hex('#c05a2c')
    const dark = hex('#6b3420')
    const light = hex('#dd8a55')
    const cap = hex('#f4f2ee')
    const c = [0, 0, 0]
    const list = craterList(401, 30, 0.02, 0.08)
    return paintSphere(width, (x, y, z, lat, out) => {
      const n = fbm3(x, y, z, 1.8, 5, 402)
      mix(base, dark, smooth(0.52, 0.66, n), c)
      mix(c, light, smooth(0.6, 0.35, n) * 0.5, c)
      const k = (0.92 + fbm3(x, y, z, 10, 2, 403) * 0.16) * craterShade(list, x, y, z)
      c[0] *= k
      c[1] *= k
      c[2] *= k
      const absLat = Math.abs(lat) / (Math.PI / 2)
      mix(c, cap, smooth(0.84, 0.88, absLat + fbm3(x, y, z, 5, 2, 404) * 0.05), c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  venus(width) {
    const a = hex('#c9a056')
    const b = hex('#f2dda2')
    const c = [0, 0, 0]
    return paintSphere(width, (x, y, z, lat, out) => {
      const warp = fbm3(x, y, z, 2.2, 4, 501) * 2
      const n = fbm3(x * 0.6 + warp, y * 3 + warp * 0.5, z * 0.6 + warp, 1.8, 4, 502)
      mix(a, b, n * 1.3 - 0.15 + Math.cos(lat * 4) * 0.08, c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  europa(width) {
    const ice = hex('#ece3d3')
    const tan = hex('#c9ab86')
    const line = hex('#9c5636')
    const c = [0, 0, 0]
    return paintSphere(width, (x, y, z, _lat, out) => {
      mix(ice, tan, smooth(0.5, 0.7, fbm3(x, y, z, 2, 4, 601)) * 0.6, c)
      const crack = Math.abs(fbm3(x, y, z, 3.5, 4, 602) - 0.5)
      const crack2 = Math.abs(fbm3(x, y, z, 6, 3, 603) - 0.5)
      mix(c, line, smooth(0.025, 0, Math.min(crack, crack2 * 1.4)), c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  io(width) {
    const yellow = hex('#e8d05e')
    const white = hex('#f6f1d6')
    const orange = hex('#d8641c')
    const black = hex('#2a1a12')
    const c = [0, 0, 0]
    const vents = craterList(701, 26, 0.015, 0.05)
    return paintSphere(width, (x, y, z, _lat, out) => {
      const n = fbm3(x, y, z, 2.5, 4, 702)
      mix(yellow, white, smooth(0.58, 0.7, n), c)
      mix(c, orange, smooth(0.42, 0.3, n), c)
      // Volcanic vents: a black centre in an orange-red halo.
      for (const [vx, vy, vz, r] of vents) {
        const dot = x * vx + y * vy + z * vz
        if (dot < Math.cos(r * 2.2)) continue
        const q = Math.acos(Math.min(1, dot)) / r
        if (q < 1) mix(c, black, 1 - q * 0.9, c)
        else if (q < 2.2) mix(c, orange, (2.2 - q) / 1.2 * 0.7, c)
      }
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  titan(width) {
    const a = hex('#c7873c')
    const b = hex('#e3a95a')
    const c = [0, 0, 0]
    return paintSphere(width, (x, y, z, lat, out) => {
      mix(a, b, fbm3(x, y * 2, z, 2, 3, 801) * 0.9 + Math.cos(lat * 3) * 0.1, c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  jupiter(width) {
    const bands = ['#efe3c8', '#c9a27a', '#e6d2ad', '#a8734c', '#f2e7cf', '#b8885e', '#e0c9a1', '#8f5f3d'].map(hex)
    const storm = hex('#c45c34')
    const c = [0, 0, 0]
    return paintSphere(width, (x, y, z, lat, out) => {
      // Bands by latitude, smeared sideways by turbulence.
      const turb = (fbm3(x * 2, y * 8, z * 2, 2.5, 5, 901) - 0.5) * 0.18
      const b = (lat / Math.PI + 0.5 + turb) * 14
      const i = Math.floor(b)
      mix(bands[((i % bands.length) + bands.length) % bands.length], bands[(((i + 1) % bands.length) + bands.length) % bands.length], smooth(0.75, 1, b - i), c)
      // The great red storm, south of the equator.
      const lon = Math.atan2(z, x)
      const dl = lat + 0.38
      const dn = Math.atan2(Math.sin(lon - 0.8), Math.cos(lon - 0.8))
      const e = (dn / 0.32) ** 2 + (dl / 0.13) ** 2
      if (e < 1.6) mix(c, storm, smooth(1.6, 0.6, e + turb * 3), c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  saturn(width) {
    const a = hex('#e6d6aa')
    const b = hex('#c8ad78')
    const c = [0, 0, 0]
    return paintSphere(width, (x, y, z, lat, out) => {
      const turb = (fbm3(x * 2, y * 8, z * 2, 2, 4, 1001) - 0.5) * 0.1
      const s = Math.sin((lat / Math.PI + turb) * 48) * 0.5 + 0.5
      mix(a, b, s * 0.7 + Math.abs(lat) * 0.25, c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
  sun(width) {
    const a = hex('#ffdf7a')
    const b = hex('#fff6d8')
    const c = [0, 0, 0]
    return paintSphere(width, (x, y, z, _lat, out) => {
      mix(a, b, fbm3(x, y, z, 14, 3, 1101), c)
      out[0] = c[0]
      out[1] = c[1]
      out[2] = c[2]
    })
  },
}

/** Saturn's rings, as a strip across their width: bright bands, dark gaps, the Cassini division. */
function paintRings(width) {
  const height = 4
  const data = new Uint8Array(width * height * 4)
  const rand = mulberry32(1201)
  const fine = Array.from({ length: 64 }, () => 0.75 + rand() * 0.25)
  for (let x = 0; x < width; x += 1) {
    const t = x / width
    let a = smooth(0, 0.06, t) * smooth(1, 0.92, t)
    a *= fine[Math.floor(t * 64)]
    if (t > 0.6 && t < 0.66) a *= 0.12
    if (t < 0.22) a *= 0.45
    const shade = 0.82 + 0.18 * Math.sin(t * 90)
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 4
      data[i] = 226 * shade
      data[i + 1] = 210 * shade
      data[i + 2] = 170 * shade
      data[i + 3] = a * 255
    }
  }
  return { width, height, data }
}

/** Paints texture `kind` (a surface, a sprite, a planet, or 'saturnRings') at `size` (planets: the width). */
export function paintTexture(kind, size) {
  if (SURFACES[kind]) return SURFACES[kind](size)
  if (SPRITES[kind]) return SPRITES[kind](size)
  if (kind === 'saturnRings') return paintRings(size)
  return (PAINTERS[kind] || PAINTERS.moon)(size)
}
