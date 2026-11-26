import { destinationById, EARTH, STATION } from '@shared/balance'

/**
 * Every place's look in one spot: its sky, fog and light. Colours are sRGB hex, exactly
 * as you'd pick them in an image editor.
 *
 * Light intensities are three.js physical units: a light of intensity PI (~3.14) lights
 * a surface facing it to its full colour. The hemisphere fill plus the sun add up to
 * about that on the ground, so shadowed sides read cool and lit ones warm.
 */

export const LIGHTS = {
  /** Towards the sun (high in the south-east, behind the usual view north), shared by the sky's glow and the sun light. */
  sunDirection: [0.4, 0.78, 0.48],
  shadowSoftness: 2,
  shadowIntensity: 0.55,
}

/** Earth's spaceport on a clear day. */
const EARTH_LOOK = {
  sky: { top: '#2f7fe6', horizon: '#cfe8ff', exponent: 0.55, sun: '#fff6e0', glow: 0.55, clouds: 0.5, stars: 0, nebula: 0, cumulus: 1 },
  fog: { color: '#cfe8ff', near: 1, far: 1 },
  light: { hemiSky: '#dbe5f0', hemiGround: '#6a7a55', hemiIntensity: 1.0, sunColor: '#fff0d4', sunIntensity: 2.35 },
}

/** Orbit: black sky full of stars, a hard white sun, no fog to speak of. */
const SPACE_LOOK = {
  sky: { top: '#000003', horizon: '#04060e', exponent: 0.8, sun: '#ffffff', glow: 0.9, clouds: 0, stars: 1, nebula: 1, cumulus: 0 },
  fog: { color: '#04060e', near: 3, far: 3 },
  light: { hemiSky: '#9fb4ff', hemiGround: '#1a1c28', hemiIntensity: 0.9, sunColor: '#ffffff', sunIntensity: 2.6 },
}

const lookCache = new Map()

/**
 * The look of `place`: `{ sky, fog, light }`. Destinations build theirs from their
 * balance `look` colours: a sky from `skyTop` to `horizon`, stars if airless, and a
 * light tinted by their dust.
 */
export function lookOf(place) {
  if (place === EARTH) return EARTH_LOOK
  if (place === STATION || place === 'transit') return SPACE_LOOK
  let look = lookCache.get(place)
  if (look) return look
  const dest = destinationById(place)
  if (!dest) return EARTH_LOOK
  const c = dest.look
  const airless = c.stars > 0
  look = {
    // Mercury sits so close to the Sun that its glow fills a good part of the sky.
    sky: { top: c.skyTop, horizon: c.horizon, exponent: airless ? 0.8 : 0.5, sun: '#fff4e0', glow: place === 'mercury' ? 2.4 : airless ? 0.9 : 0.6, clouds: airless ? 0 : 0.35, stars: c.stars, nebula: airless ? 0.85 : 0, cumulus: 0 },
    // Hazy worlds fade into their sky sooner; airless ones barely at all.
    fog: { color: c.horizon, near: airless ? 2.5 : 0.7, far: airless ? 2.5 : 0.85 },
    light: { hemiSky: airless ? '#b8c4e0' : c.horizon, hemiGround: c.rock, hemiIntensity: airless ? 0.85 : 1.15, sunColor: airless ? '#ffffff' : '#fff0d8', sunIntensity: airless ? 2.5 : 1.9 },
  }
  lookCache.set(place, look)
  return look
}
