import { useEffect, useMemo } from 'react'
import { BoxGeometry, CylinderGeometry, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { bindTexture } from '../texgen/slots'
import { surfaceSlot } from '../textures'

/**
 * Textured building blocks: planes, boxes and cylinders whose UVs are in metres divided
 * by the texture's tile size, so every surface shows its texture at true scale (slabs
 * stay 2 m, windows stay a floor tall) however big the box. Everything of one material
 * is merged into a single mesh: one draw call per material.
 */

/** Scales a geometry's UVs by `su` across and `sv` up (for the faces in `range`, or all). */
function scaleUv(geometry, su, sv, start = 0, count = Infinity) {
  const uv = geometry.getAttribute('uv')
  const end = Math.min(uv.count, start + count)
  for (let i = start; i < end; i += 1) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  uv.needsUpdate = true
}

/**
 * A box, centred at (x, y, z), turned `rotY`, its texture tiling every `tile` metres
 * (`[across, up]` to set the two apart, e.g. a facade's 6 m by 3 m floor).
 */
export function tiledBox(w, h, d, tile, { x = 0, y = 0, z = 0, rotY = 0, rotX = 0 } = {}) {
  const [tu, tv] = Array.isArray(tile) ? tile : [tile, tile]
  const g = new BoxGeometry(w, h, d)
  // BoxGeometry's faces, four vertices each: +x, -x, +y, -y, +z, -z.
  scaleUv(g, d / tu, h / tv, 0, 8)
  scaleUv(g, w / tu, d / tu, 8, 8)
  scaleUv(g, w / tu, h / tv, 16, 8)
  if (rotX) g.rotateX(rotX)
  if (rotY) g.rotateY(rotY)
  g.translate(x, y, z)
  return g
}

/** A box resting on `base` (its bottom at that height). */
export const tiledBoxOn = (w, h, d, tile, { x = 0, base = 0, z = 0, rotY = 0 } = {}) => tiledBox(w, h, d, tile, { x, y: base + h / 2, z, rotY })

/** A flat horizontal plane at height y, `w` by `d`, tiling every `tile` metres. */
export function tiledPlane(w, d, tile, { x = 0, y = 0, z = 0, segments = 1 } = {}) {
  const g = new PlaneGeometry(w, d, segments, segments)
  g.rotateX(-Math.PI / 2)
  scaleUv(g, w / tile, d / tile)
  g.translate(x, y, z)
  return g
}

/**
 * An arched roof: part of a cylinder lying along Z, its arc on top, flattened to `squash`
 * of its radius in height.
 */
export function tiledVault(radius, length, tile, { x = 0, y = 0, z = 0, arc = Math.PI, squash = 1 } = {}) {
  const g = new CylinderGeometry(radius, radius, length, 24, 1, true, -arc / 2, arc)
  scaleUv(g, (radius * arc) / tile, length / tile)
  // The arc is centred on +Z; turning -90 degrees about X brings it to the top.
  g.rotateX(-Math.PI / 2)
  g.scale(1, squash, 1)
  g.translate(x, y, z)
  return g
}

/**
 * One mesh of `material` from the geometries `fill(add)` adds, merged; rebuilt when `key`
 * changes, freed on unmount (the shared material stays).
 */
export function useSurface(fill, material, key = '') {
  const mesh = useMemo(() => {
    const parts = []
    fill((g) => parts.push(g))
    if (parts.length === 0) return null
    for (const p of parts) {
      for (const name of Object.keys(p.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) p.deleteAttribute(name)
    }
    const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))
    for (const p of parts) p.dispose()
    const m = new Mesh(merged, material)
    m.receiveShadow = true
    m.castShadow = true
    m.matrixAutoUpdate = false
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, key])
  useEffect(() => () => mesh?.geometry.dispose(), [mesh])
  return mesh
}

let materials = null

/**
 * A Lambert material (cheap to shade) showing surface `kind`, with a little bump through
 * the same image; it follows the texture worker's swap from placeholder to the real map.
 */
export function surfaceMaterial(kind, extra = {}) {
  const m = new MeshLambertMaterial({ bumpScale: 1.2, ...extra })
  bindTexture(surfaceSlot(kind), m, ['map', 'bumpMap'])
  return m
}

/**
 * The shared surface materials. Lambert (cheap to shade) with each texture as its colour
 * and, through the same image, a little bump - joints, blades and ribs catch the light.
 */
export function surfaceMaterials() {
  if (!materials) {
    materials = {
      // The ground's macro variation comes in vertex colours.
      grass: surfaceMaterial('grass', { vertexColors: true, bumpScale: 2 }),
      concrete: surfaceMaterial('concrete', { bumpScale: 0.5 }),
      roof: surfaceMaterial('concrete', { color: '#9aa0a8', bumpScale: 0.5 }),
      asphalt: surfaceMaterial('asphalt', { bumpScale: 0.6 }),
      tread: surfaceMaterial('tread', { bumpScale: 2.5 }),
      facade: surfaceMaterial('facade', { bumpScale: 0.4 }),
      corrugated: surfaceMaterial('corrugated', { bumpScale: 3 }),
      deck: surfaceMaterial('deck', { bumpScale: 1.4 }),
    }
  }
  return materials
}
