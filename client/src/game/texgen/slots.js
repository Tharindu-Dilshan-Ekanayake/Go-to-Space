import { useCallback, useSyncExternalStore } from 'react'
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * Textures painted in the background (worker.js), handed out as "slots": a slot holds a
 * texture straight away - a 1-pixel placeholder in the texture's average colour - and
 * swaps in the real one when the worker delivers it. Materials bound to a slot
 * (`bindTexture`) and components using one (`useSlotTexture`) pick the swap up; the
 * shader never recompiles (a map is a map, whichever texture it is).
 *
 * One worker, first come first served: the lobby's surfaces are asked for first, the
 * planets after.
 */

let worker = null
let nextId = 1
const pending = new Map()

function getWorker() {
  if (worker !== null) return worker
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const job = pending.get(event.data.id)
      pending.delete(event.data.id)
      job?.resolve(event.data)
    }
  } catch {
    worker = false
  }
  return worker
}

/** Paints `kind` at `size` off the main thread (or, without workers, in idle time here). */
function requestPaint(kind, size) {
  const w = getWorker()
  if (w) {
    return new Promise((resolve) => {
      const id = nextId
      nextId += 1
      pending.set(id, { resolve })
      w.postMessage({ id, kind, size })
    })
  }
  return import('./paint').then(
    ({ paintTexture }) =>
      new Promise((resolve) => {
        const run = () => resolve(paintTexture(kind, size))
        if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 })
        else setTimeout(run, 50)
      }),
  )
}

let anisotropy = 4
/** How much anisotropic filtering painted textures get (GameScene sets it from the GPU and preset). */
export function setSlotAnisotropy(n) {
  anisotropy = n
}

const slots = new Map()

/**
 * The slot for texture `kind` at `size`, asking for it to be painted the first time.
 * `srgb` (colour, not a mask), `repeat` (tiles), `placeholder` its average [r, g, b] or
 * [r, g, b, a] (a = 0 for overlays that should stay invisible until painted).
 */
export function textureSlot(kind, size, { srgb = true, repeat = true, placeholder = [128, 128, 128] } = {}) {
  const key = `${kind}@${size}`
  let slot = slots.get(key)
  if (slot) return slot
  const wrap = repeat ? RepeatWrapping : undefined
  const temp = new DataTexture(new Uint8Array(placeholder.length === 4 ? placeholder : [...placeholder, 255]), 1, 1)
  if (srgb) temp.colorSpace = SRGBColorSpace
  if (wrap) temp.wrapS = temp.wrapT = wrap
  temp.magFilter = LinearFilter
  temp.minFilter = LinearFilter
  temp.needsUpdate = true
  slot = { texture: temp, listeners: new Set(), ready: null }
  slot.ready = requestPaint(kind, size).then(({ width, height, data }) => {
    const t = new DataTexture(data, width, height)
    if (srgb) t.colorSpace = SRGBColorSpace
    if (wrap) t.wrapS = t.wrapT = wrap
    t.magFilter = LinearFilter
    t.minFilter = LinearMipmapLinearFilter
    t.generateMipmaps = true
    t.anisotropy = anisotropy
    t.needsUpdate = true
    slot.texture = t
    for (const listener of slot.listeners) listener(t)
    temp.dispose()
    return t
  })
  slots.set(key, slot)
  return slot
}

/** Keeps `material[prop]` (for each of `props`) on `slot`'s texture, now and after the swap. */
export function bindTexture(slot, material, props = ['map']) {
  const apply = (t) => {
    for (const prop of props) material[prop] = t
  }
  apply(slot.texture)
  slot.listeners.add(apply)
}

/** React: the slot's current texture, re-rendering once when the real one arrives. */
export function useSlotTexture(slot) {
  const subscribe = useCallback(
    (onChange) => {
      slot.listeners.add(onChange)
      return () => slot.listeners.delete(onChange)
    },
    [slot],
  )
  return useSyncExternalStore(subscribe, () => slot.texture)
}
