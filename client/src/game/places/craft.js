import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BackSide,
  BufferAttribute,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three'

import { PropBuilder } from '../blocks'
import { LIGHTS } from '../sceneStyle'

/**
 * Craft (the rocket, spaceplanes, the pod, the rover) are drawn nicer than the scenery:
 * painted metal that catches the light and reflects the sky, real glass, and parts that
 * glow. A craft is built into three merged parts - `body`, `glass`, `glow` - so a whole
 * craft is three draw calls (or three instanced meshes for a hangar full of them).
 */
export class Craft {
  constructor() {
    this.body = new PropBuilder()
    this.glass = new PropBuilder()
    this.glow = new PropBuilder()
    /** See-through glass (a cabin roof): drawn after everything solid. */
    this.clear = new PropBuilder()
  }
}

let materials = null

/** The three shared craft materials. */
export function craftMaterials() {
  if (!materials) {
    materials = {
      // Gloss paint over metal: shiny highlights, a soft sky reflection.
      body: new MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.32, envMapIntensity: 1.1 }),
      // Tinted canopy glass: dark, mirror-smooth, reflecting the sky.
      glass: new MeshStandardMaterial({ color: '#16304a', metalness: 0.85, roughness: 0.05, envMapIntensity: 1.8 }),
      // Lights, engine cores, screens: always full bright.
      glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      // Clear glass you can see who's inside through: faint tint, a soft sky reflection.
      clear: new MeshStandardMaterial({ color: '#cfeeff', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.4 }),
    }
  }
  return materials
}

const PARTS = ['body', 'glass', 'glow', 'clear']

function buildCraft(fill) {
  const c = new Craft()
  fill(c)
  const group = new Group()
  const mats = craftMaterials()
  for (const part of PARTS) {
    const geometry = c[part].build()
    if (!geometry) continue
    const mesh = new Mesh(geometry, mats[part])
    mesh.castShadow = part === 'body'
    if (part === 'clear') mesh.renderOrder = 2
    group.add(mesh)
  }
  return group
}

function disposeGroup(group) {
  group?.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose()
      if (o.isInstancedMesh) o.dispose()
    }
  })
}

/** One craft built by `fill(craft)`, as a Group; rebuilt when `key` changes, freed on unmount. */
export function useCraft(fill, key = '') {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const group = useMemo(() => buildCraft(fill), [key])
  useEffect(() => () => disposeGroup(group), [group])
  return group
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _up = new Vector3(0, 1, 0)

/**
 * The same craft at many `places` (`{ x, y, z, s, r }`): each part an InstancedMesh, so a
 * row of nine parked spaceplanes is still three draw calls.
 */
export function useCraftScatter(fill, places, key = '') {
  const group = useMemo(() => {
    const c = new Craft()
    fill(c)
    const g = new Group()
    const mats = craftMaterials()
    for (const part of PARTS) {
      const geometry = c[part].build()
      if (!geometry) continue
      const mesh = new InstancedMesh(geometry, mats[part], places.length)
      if (part === 'clear') mesh.renderOrder = 2
      places.forEach((at, i) => {
        _q.setFromAxisAngle(_up, at.r || 0)
        _p.set(at.x, at.y || 0, at.z)
        _s.setScalar(at.s || 1)
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      g.add(mesh)
    }
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, key])
  useEffect(() => () => disposeGroup(group), [group])
  return group
}

/**
 * Builds the sky the craft reflect - a soft gradient from blue overhead through a bright
 * horizon to dusky ground, and a hot spot where the sun is - and makes it the scene's
 * environment (only the craft's standard materials use it; the scenery is Lambert).
 * Done once per renderer, behind the loading screen; ~1 ms.
 */
export function CraftEnvironment() {
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { scene } = get()
    const env = new Scene()
    const geometry = new SphereGeometry(10, 32, 16)
    const colors = new Float32Array(geometry.getAttribute('position').count * 3)
    const pos = geometry.getAttribute('position')
    const top = new Color('#4f86d6')
    const horizon = new Color('#eef4ff')
    const ground = new Color('#5d5f5a')
    const sun = new Vector3(...LIGHTS.sunDirection).normalize()
    const c = new Color()
    const dir = new Vector3()
    for (let i = 0; i < pos.count; i += 1) {
      dir.fromBufferAttribute(pos, i).normalize()
      if (dir.y >= 0) c.copy(horizon).lerp(top, Math.pow(dir.y, 0.6))
      else c.copy(horizon).lerp(ground, Math.min(1, -dir.y * 3))
      const glare = Math.pow(Math.max(0, dir.dot(sun)), 64) * 6
      c.r += glare
      c.g += glare
      c.b += glare * 0.9
      colors.set([c.r, c.g, c.b], i * 3)
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    const material = new MeshBasicMaterial({ vertexColors: true, side: BackSide })
    env.add(new Mesh(geometry, material))
    const pmrem = new PMREMGenerator(gl)
    const target = pmrem.fromScene(env, 0.02)
    scene.environment = target.texture
    geometry.dispose()
    material.dispose()
    pmrem.dispose()
    return () => {
      if (scene.environment === target.texture) scene.environment = null
      target.dispose()
    }
  }, [gl, get])
  return null
}
