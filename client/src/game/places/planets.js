import { useMemo } from 'react'

import { getQuality } from '../../store/quality'
import { textureSlot, useSlotTexture } from '../texgen/slots'

/**
 * The solar system's bodies, painted procedurally (texgen/paint.js): every pixel of an
 * equirectangular map is a point on the sphere, coloured from 3D noise sampled there - no
 * seam at the date line, no pinching at the poles. Earth gets continents with biomes by
 * latitude and polar ice (and a separate cloud layer), Jupiter turbulent bands and its
 * great red storm, Saturn pale bands (and textured rings), Mars dark regions and polar
 * caps, Venus swirling cloud, the moons their craters, cracks and sulphur.
 *
 * 2:1 maps as wide as the preset allows (512 on LOW, 1024 above), painted on the texture
 * worker and kept for the session (~8 MB on LOW for all of them). Until a map arrives the
 * body shows in its average colour; `warmPlanets` queues them all once the lobby's up, so
 * they're ready long before anyone gets to space.
 */

/** Each body's average colour (rings and clouds: invisible) until its map is painted. */
const AVERAGE = {
  earth: [90, 125, 135],
  earthClouds: [255, 255, 255, 0],
  moon: [161, 163, 168],
  mars: [190, 117, 81],
  venus: [221, 190, 123],
  mercury: [148, 142, 134],
  europa: [220, 200, 179],
  io: [232, 201, 102],
  ganymede: [153, 142, 127],
  callisto: [101, 93, 83],
  titan: [211, 149, 73],
  jupiter: [205, 173, 138],
  saturn: [213, 191, 142],
  sun: [255, 234, 168],
  saturnRings: [185, 172, 139, 0],
}

/** Map width for planets: the preset's cap (512 on LOW). */
const planetWidth = () => Math.min(1024, getQuality().maxTexture)

/** The slot for `body` ('earth', 'earthClouds', 'moon', ..., 'saturnRings', 'sun'). */
export function planetSlot(body) {
  return textureSlot(body, planetWidth(), {
    repeat: body !== 'saturnRings',
    placeholder: AVERAGE[body] || AVERAGE.moon,
  })
}

/** React: `body`'s map (its average colour until painted; re-renders once when it is). */
export const usePlanetTexture = (body) => useSlotTexture(planetSlot(body))

/** Every body there is, in the order they're most likely needed. */
const WARM_ORDER = ['earth', 'earthClouds', 'moon', 'sun', 'jupiter', 'saturn', 'saturnRings', 'mars', 'venus', 'mercury', 'europa', 'io', 'ganymede', 'callisto', 'titan']

/** Queues every body's map on the texture worker (after the lobby's surfaces). */
export function warmPlanets() {
  for (const body of WARM_ORDER) planetSlot(body)
}

/** Atmosphere glow round each body's edge in its picture (airless bodies have none). */
const AIR = { earth: [111, 183, 255], venus: [240, 216, 144], mars: [232, 160, 112], titan: [232, 160, 80] }

/**
 * A little picture of `body` for the menus: its painted map wrapped on a ball, lit from
 * the upper left, Earth with its clouds, an air glow round the edge where there's air.
 * `size` pixels square, as a data URL; null until the map is painted.
 */
function paintThumb(body, map, clouds, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const { data: src, width: w, height: h } = map.image
  const cl = clouds?.image?.width > 1 ? clouds.image : null
  const air = AIR[body]
  const R = size / 2 - (air ? size * 0.06 : 1)
  const lx = -0.55
  const ly = 0.5
  const lz = 0.67
  const sample = (image, u, lat, out) => {
    const px = Math.min(image.width - 1, Math.floor((((u % 1) + 1) % 1) * image.width))
    const py = Math.min(image.height - 1, Math.max(0, Math.floor(((Math.PI / 2 - lat) / Math.PI) * image.height)))
    const i = ((image.height - 1 - py) * image.width + px) * 4
    out[0] = image.data[i]
    out[1] = image.data[i + 1]
    out[2] = image.data[i + 2]
    out[3] = image.data[i + 3]
  }
  const c = [0, 0, 0, 0]
  const k = [0, 0, 0, 0]
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5 - size / 2) / R
      const ny = (size / 2 - y - 0.5) / R
      const r2 = nx * nx + ny * ny
      const o = (y * size + x) * 4
      const r = Math.sqrt(r2)
      if (r > 1) {
        // The air's glow just outside the edge.
        if (air) {
          const g = Math.max(0, 1 - (r - 1) / 0.12) ** 2 * 0.8
          img.data[o] = air[0]
          img.data[o + 1] = air[1]
          img.data[o + 2] = air[2]
          img.data[o + 3] = 255 * g
        }
        continue
      }
      const nz = Math.sqrt(1 - r2)
      const lat = Math.asin(ny)
      const lon = Math.atan2(nz, nx) + 1.1
      sample({ data: src, width: w, height: h }, lon / (Math.PI * 2), lat, c)
      if (cl) {
        sample(cl, lon / (Math.PI * 2) + 0.13, lat, k)
        const a = k[3] / 255
        c[0] += (k[0] - c[0]) * a
        c[1] += (k[1] - c[1]) * a
        c[2] += (k[2] - c[2]) * a
      }
      const light = 0.16 + 1.05 * Math.max(0, nx * lx + ny * ly + nz * lz)
      const rim = air ? (1 - nz) ** 3 * 0.7 : 0
      const edge = Math.min(1, (1 - r) * R)
      for (let j = 0; j < 3; j += 1) img.data[o + j] = Math.min(255, c[j] * light + (air ? air[j] * rim : 0))
      img.data[o + 3] = 255 * edge
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

/** Pictures already made, by body and size: `{ map, clouds, url }` (remade if a map changes). */
const thumbs = new Map()
function thumbOf(body, map, clouds, size) {
  if (!(map.image?.width > 1)) return null
  const key = `${body}@${size}`
  const hit = thumbs.get(key)
  if (hit && hit.map === map && hit.clouds === clouds) return hit.url
  const url = paintThumb(body, map, clouds, size)
  thumbs.set(key, { map, clouds, url })
  return url
}

/** React: a picture of `body` (see paintThumb), null until its map is painted. */
export function usePlanetThumb(body, size = 128) {
  const map = usePlanetTexture(body)
  const clouds = usePlanetTexture('earthClouds')
  const cloudMap = body === 'earth' ? clouds : null
  return useMemo(() => thumbOf(body, map, cloudMap, size), [body, map, cloudMap, size])
}
