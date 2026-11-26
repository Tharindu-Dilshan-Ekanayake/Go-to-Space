import { useEffect, useMemo } from 'react'
import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'

import { mulberry32 } from '@shared/rng'

import { asToyInstance, BlockSet, createToyInstances, disposeBlocks, PropBuilder, toColor } from '../blocks'
import { sharedMaterials } from '../materials'

/**
 * The scene-building kit every place uses: blocks and props merged into a handful of
 * meshes through the one shared toy material, disposed when the place unmounts. (Planet
 * textures live in planets.js, surface textures in ../textures.js.)
 */

// Template geometries for PropBuilder: never drawn themselves, so never disposed.
export const GEO = {
  cylinder: new CylinderGeometry(1, 1, 1, 16),
  cylinderLow: new CylinderGeometry(1, 1, 1, 8),
  cone: new ConeGeometry(1, 1, 16),
  coneLow: new ConeGeometry(1, 1, 7),
  sphere: new SphereGeometry(1, 16, 10),
  ring: new TorusGeometry(1, 0.08, 6, 32),
  /** A big ring with a fat tube (the station's habitat wheel). */
  ringThick: new TorusGeometry(1, 0.06, 10, 72),
  rock: new IcosahedronGeometry(1, 0),
}

/*
 * The three builders below take `fill` (usually an inline function, new every render)
 * and a `key`: the mesh is rebuilt only when the key changes - it names what the fill
 * depends on (a place, a quality level, a list of positions). `fill` itself is left out
 * of the memo's dependencies on purpose: rebuilding meshes every render would be ruinous.
 */

function buildBlocks(fill) {
  const set = new BlockSet()
  fill(set)
  return set.build(sharedMaterials().toy)
}

function buildProps(fill) {
  const builder = new PropBuilder()
  fill(builder)
  const geometry = builder.build()
  return geometry ? asToyInstance(geometry, sharedMaterials().toy) : null
}

/** A BlockSet built by `fill(set)` as one InstancedMesh, disposed on unmount (the material is shared). */
export function useBlocks(fill, key = '') {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mesh = useMemo(() => buildBlocks(fill), [key])
  useEffect(() => () => disposeBlocks(mesh), [mesh])
  return mesh
}

/** A PropBuilder built by `fill(builder)` as one mesh (one draw call), disposed on unmount. */
export function useProps(fill, key = '') {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mesh = useMemo(() => buildProps(fill), [key])
  useEffect(() => () => mesh && disposeBlocks(mesh), [mesh])
  return mesh
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _up = new Vector3(0, 1, 0)

function buildScatter(fill, places) {
  const builder = new PropBuilder()
  fill(builder)
  const geometry = builder.build()
  if (!geometry || places.length === 0) return null
  const instanced = createToyInstances(geometry, sharedMaterials().toy, places.length)
  places.forEach((at, i) => {
    _q.setFromAxisAngle(_up, at.r || 0)
    _p.set(at.x, at.y || 0, at.z)
    const sc = at.s || 1
    _s.set(at.sx ?? sc, at.sy ?? sc, at.sz ?? sc)
    instanced.setMatrixAt(i, _m.compose(_p, _q, _s))
    // A tint over the prop's own colours, for variety (a greener tree, a greyer rock).
    if (at.tint) instanced.setColorAt(i, toColor(at.tint))
  })
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
  instanced.count = places.length
  instanced.instanceMatrix.needsUpdate = true
  instanced.frustumCulled = true
  instanced.computeBoundingSphere()
  return instanced
}

/**
 * One prop shape, placed many times: `fill(builder)` makes the shape, `places` is a
 * list of `{ x, y, z, s, r, tint? }` (scale, Y turn, a colour tint). One draw call for them all. Rebuilt
 * when `places` (keep it memoised) or `key` changes.
 */
export function useScatter(fill, places, key = '') {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mesh = useMemo(() => buildScatter(fill, places), [places, key])
  useEffect(() => () => mesh && disposeBlocks(mesh), [mesh])
  return mesh
}

/**
 * Scatter positions: `count` points in the square `half` metres round the origin, kept
 * out of every circle in `keepOut` (`{ x, z, radius }`). Seeded, so the same everywhere.
 */
export function scatter(seed, count, half, keepOut = [], { minScale = 0.6, maxScale = 1.6, y = 0 } = {}) {
  const rand = mulberry32(seed)
  const out = []
  let tries = 0
  while (out.length < count && tries < count * 20) {
    tries += 1
    const x = (rand() * 2 - 1) * half
    const z = (rand() * 2 - 1) * half
    if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.radius)) continue
    out.push({ x, y, z, s: minScale + rand() * (maxScale - minScale), r: rand() * Math.PI * 2 })
  }
  return out
}
