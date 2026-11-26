import { DataTexture, LinearFilter, LinearMipmapLinearFilter } from 'three'

import { getQuality } from '../store/quality'
import { paintTexture } from './texgen/paint'
import { setSlotAnisotropy, textureSlot } from './texgen/slots'

/**
 * The game's surface textures and sprites, all procedural (texgen/paint.js: no image
 * files to download).
 *
 * Surfaces - grass, concrete slabs, asphalt, steel tread plate, glass facade, corrugated
 * metal - are seamless, as wide as the preset allows (512 on LOW, 1024 above), mipmapped
 * and anisotropically filtered so ground seen at a low angle stays crisp. They're painted
 * on a worker thread and handed out as slots (texgen/slots.js): bind a material to one and
 * it shows the real texture as soon as it's painted, with its average colour until then.
 *
 * Sprites - soft shadows, glows, puffs of smoke and cloud - are small masks, made here
 * at once when first asked for.
 */

/** Surface texture side: the preset's cap (512 on LOW). */
const surfaceSize = () => Math.min(1024, getQuality().maxTexture)

/** Each surface's average colour, shown until its texture is painted. */
const AVERAGE = {
  grass: [86, 149, 59],
  concrete: [176, 173, 167],
  asphalt: [57, 60, 66],
  tread: [138, 144, 151],
  facade: [156, 174, 192],
  corrugated: [154, 160, 167],
  deck: [126, 136, 151],
}

/** The slot for surface `kind` ('grass', 'concrete', 'asphalt', 'tread', 'facade', 'corrugated'). */
export const surfaceSlot = (kind) => textureSlot(kind, surfaceSize(), { placeholder: AVERAGE[kind] })

/** The lobby's surfaces (the station's deck is painted after them, when asked for). */
const LOBBY = ['grass', 'concrete', 'asphalt', 'tread', 'facade', 'corrugated']

/** The lobby's surfaces, asked for at once; resolves when they're all painted. */
export function lobbyTexturesReady() {
  return Promise.all(LOBBY.map((kind) => surfaceSlot(kind).ready))
}

let anisotropy = 4
const sprites = new Map()

/** GameScene tells us what the GPU can do (and what the preset allows). */
export function setTextureAnisotropy(n) {
  anisotropy = Math.max(1, n)
  setSlotAnisotropy(anisotropy)
}

/** A sprite mask `kind` at `size`, painted right here the first time (they're small). */
function sprite(kind, size) {
  let t = sprites.get(kind)
  if (t) return t
  const { width, height, data } = paintTexture(kind, size)
  t = new DataTexture(data, width, height)
  t.magFilter = LinearFilter
  t.minFilter = LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  sprites.set(kind, t)
  return t
}

/** A soft shadow, as a greyscale alpha map: a rounded rectangle (`round` false) or a disc. */
export const shadowTexture = (round = false) => sprite(round ? 'shadowRound' : 'shadowRect', 128)

/** A round glow: white in the middle fading to nothing (halos, sun glare, engine light). */
export const glowTexture = () => sprite('glow', 128)

/** A puff of cloud or smoke, as an alpha map: billowy edges round a soft middle. */
export const puffTexture = () => sprite('puff', 256)
