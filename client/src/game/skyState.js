import { Color, Vector3 } from 'three'

import { LIGHTS, lookOf } from './sceneStyle'

const START = lookOf('earth').sky

/**
 * Sky shader uniforms, module-level so a change of place can retint the sky without
 * React: `showSky` writes `.value` and the next frame shows it.
 */
export const skyUniforms = {
  topColor: { value: new Color(START.top) },
  horizonColor: { value: new Color(START.horizon) },
  exponent: { value: START.exponent },
  /** Towards the sun (the same as the sun light's), its glow's colour and strength. */
  sunDirection: { value: new Vector3(...LIGHTS.sunDirection).normalize() },
  sunColor: { value: new Color(START.sun) },
  glow: { value: START.glow },
  /** How many thin high clouds streak across it, and how many stars show (0-1 each). */
  clouds: { value: START.clouds },
  stars: { value: START.stars },
  /** The Milky Way band (0-1): space and airless worlds. */
  nebula: { value: START.nebula },
  /** Puffy fair-weather clouds near the horizon (0-1): Earth's sky. */
  cumulus: { value: START.cumulus },
}

/** Sets the sky (and `fog`, if given) to `place`'s look. */
export function showSky(place, fog, viewDistance) {
  const { sky, fog: f } = lookOf(place)
  skyUniforms.topColor.value.set(sky.top)
  skyUniforms.horizonColor.value.set(sky.horizon)
  skyUniforms.exponent.value = sky.exponent
  skyUniforms.sunColor.value.set(sky.sun)
  skyUniforms.glow.value = sky.glow
  skyUniforms.clouds.value = sky.clouds
  skyUniforms.stars.value = sky.stars
  skyUniforms.nebula.value = sky.nebula
  skyUniforms.cumulus.value = sky.cumulus
  if (fog) {
    fog.color.set(f.color)
    // Near/far are fractions of the preset's view distance.
    fog.near = viewDistance * 0.3 * f.near
    fog.far = viewDistance * 0.95 * f.far
  }
}
