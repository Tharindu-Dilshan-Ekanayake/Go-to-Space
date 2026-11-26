import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, CylinderGeometry, MeshBasicMaterial, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three'

import { ORRERY } from '@shared/world'

import { useQuality } from '../../store/quality'
import { STYLE } from '../materials'
import { bindTexture } from '../texgen/slots'
import { glowTexture } from '../textures'
import { useProps } from './kit'
import { planetSlot } from './planets'
import { PlanetRings } from './SkyBody'

/** Height of the model's Sun above the deck (the planets orbit at this height, over your head). */
const SUN_Y = 6.2
/** The Sun's middle in the world (the station places the model at ORRERY). */
const SUN_WORLD = new Vector3(ORRERY.x, SUN_Y, ORRERY.z)

/** Shared shapes: a smooth sphere for every world, a hair-thin ring for the orbits. */
const SPHERE = new SphereGeometry(1, 28, 16)
const SPHERE_LOW = new SphereGeometry(1, 18, 12)
const ORBIT = new TorusGeometry(1, 0.006, 3, 64)
/** The base's shapes: a smooth drum, and a slim ring for the lit rims. */
const DRUM = new CylinderGeometry(1, 1, 1, 48)
const RIM = new TorusGeometry(1, 0.03, 4, 64)

/**
 * The worlds, out from the Sun: their size and orbit (metres), the seconds one lap
 * takes, where they start, their tilt, and their moons. Not to scale - to be seen.
 */
const BODIES = [
  { body: 'mercury', size: 0.28, orbit: 2.4, period: 10, phase: 0.4 },
  { body: 'venus', size: 0.42, orbit: 3.3, period: 16, phase: 2.1 },
  { body: 'earth', size: 0.46, orbit: 4.3, period: 22, phase: 4.0, tilt: 0.41, moons: [{ body: 'moon', size: 0.13, orbit: 0.82, period: 4 }] },
  { body: 'mars', size: 0.34, orbit: 5.3, period: 30, phase: 1.2, tilt: 0.44 },
  {
    body: 'jupiter',
    size: 0.95,
    orbit: 6.9,
    period: 46,
    phase: 3.3,
    tilt: 0.05,
    moons: [
      { body: 'io', size: 0.11, orbit: 1.35, period: 2.6 },
      { body: 'europa', size: 0.1, orbit: 1.6, period: 3.6 },
      { body: 'ganymede', size: 0.15, orbit: 1.92, period: 4.8 },
      { body: 'callisto', size: 0.13, orbit: 2.25, period: 6.4 },
    ],
  },
  { body: 'saturn', size: 0.78, orbit: 8.9, period: 64, phase: 5.4, tilt: 0.47, ring: true, moons: [{ body: 'titan', size: 0.14, orbit: 1.95, period: 5.2 }] },
]

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

/** Lit by the model's own Sun (a day side and a night side), with a faint blue rim of light. */
const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 sunPos;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 color = texture2D(map, vUv).rgb;
  vec3 n = normalize(vNormal);
  float day = max(dot(n, normalize(sunPos - vWorld)), 0.0);
  float rim = pow(1.0 - max(dot(n, normalize(cameraPosition - vWorld)), 0.0), 3.0);
  gl_FragColor = vec4(color * (0.14 + 1.2 * day) + vec3(0.35, 0.62, 1.0) * rim * 0.3, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * Each world's material, made once for the session: one shader program for them all,
 * following its map from placeholder to painted (texgen/slots.js).
 */
const materials = new Map()
function worldMaterial(body) {
  let m = materials.get(body)
  if (m) return m
  m = new ShaderMaterial({ uniforms: { map: { value: null }, sunPos: { value: SUN_WORLD } }, vertexShader: VERTEX, fragmentShader: FRAGMENT })
  const slot = planetSlot(body)
  const material = m
  const apply = (t) => {
    material.uniforms.map.value = t
  }
  apply(slot.texture)
  slot.listeners.add(apply)
  materials.set(body, m)
  return m
}

let sunMaterial = null
function getSunMaterial() {
  if (!sunMaterial) {
    sunMaterial = new MeshBasicMaterial({ color: '#ffe9b0', toneMapped: false })
    bindTexture(planetSlot('sun'), sunMaterial)
  }
  return sunMaterial
}

/**
 * Halo Station's centrepiece: the solar system in miniature, turning over a holographic
 * floor. The Sun blazes on its pillar; Mercury to Saturn circle it on hair-thin orbits,
 * Earth with the Moon, Jupiter with its four big moons, Saturn with its rings and Titan -
 * every one wearing the same painted map as the real thing out in the sky. Place it at
 * ORRERY (its base is a collider there).
 */
export function Orrery() {
  const base = useProps((b) => {
    b.add(DRUM, { position: [0, 0.45, 0], scale: [ORRERY.radius, 0.9, ORRERY.radius], color: '#e3e8ee', style: STYLE.SMOOTH })
    b.add(DRUM, { position: [0, 0.92, 0], scale: [ORRERY.radius - 0.45, 0.04, ORRERY.radius - 0.45], color: '#0f1d3d', style: STYLE.GLOW })
    b.add(RIM, { position: [0, 0.93, 0], rotation: [Math.PI / 2, 0, 0], scale: [ORRERY.radius - 0.22, ORRERY.radius - 0.22, 1], color: '#3ad6ff', style: STYLE.GLOW })
    b.add(RIM, { position: [0, 0.05, 0], rotation: [Math.PI / 2, 0, 0], scale: [ORRERY.radius + 0.02, ORRERY.radius + 0.02, 1], color: '#3ad6ff', style: STYLE.GLOW })
    // The Sun's pillar, and a lit collar where it meets the floor.
    const h = SUN_Y - 1.4 - 0.9
    b.add(DRUM, { position: [0, 0.9 + h / 2, 0], scale: [0.2, h, 0.2], color: '#aab3bf', style: STYLE.SMOOTH })
    b.add(DRUM, { position: [0, 1.0, 0], scale: [0.7, 0.16, 0.7], color: '#3ad6ff', style: STYLE.GLOW })
    // Every orbit, a fine line of light.
    for (const w of BODIES) b.add(ORBIT, { position: [0, SUN_Y, 0], rotation: [Math.PI / 2, 0, 0], scale: [w.orbit, w.orbit, w.orbit], color: '#2f7fc4', style: STYLE.GLOW })
  }, '')

  const glow = useMemo(() => glowTexture(), [])
  const low = useQuality((st) => st.level === 'LOW')
  const sphere = low ? SPHERE_LOW : SPHERE
  /** Everything that turns: `{ el, speed, phase }` by key, written by ref callbacks. */
  const turning = useRef(new Map())
  const turn = (key, speed, phase = 0) => (el) => {
    if (el) turning.current.set(key, { el, speed, phase })
    else turning.current.delete(key)
  }

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (const { el, speed, phase } of turning.current.values()) el.rotation.y = phase + t * speed
  })

  return (
    <group position={[ORRERY.x, 0, ORRERY.z]}>
      {base && <primitive object={base} />}
      <mesh geometry={sphere} material={getSunMaterial()} position={[0, SUN_Y, 0]} scale={1.25} ref={turn('sun', 0.08)} />
      <sprite position={[0, SUN_Y, 0]} scale={7.5}>
        <spriteMaterial map={glow} color="#ffcf70" transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.9} />
      </sprite>
      {BODIES.map((w) => (
        <group key={w.body} position={[0, SUN_Y, 0]} ref={turn(`orbit:${w.body}`, (Math.PI * 2) / w.period, w.phase)}>
          <group position={[w.orbit, 0, 0]} rotation={[0, 0, w.tilt || 0]}>
            <mesh geometry={sphere} material={worldMaterial(w.body)} scale={w.size} ref={turn(`spin:${w.body}`, 0.6)} />
            {w.ring && (
              <group scale={w.size}>
                <PlanetRings tilt={[Math.PI / 2, 0, 0]} opacity={0.9} />
              </group>
            )}
            {/* Moons: not on LOW (six tiny spheres, six draw calls). */}
            {!low &&
              (w.moons || []).map((m, i) => (
              <group key={m.body} ref={turn(`moon:${m.body}`, (Math.PI * 2) / m.period, i * 1.7)}>
                <mesh geometry={sphere} material={worldMaterial(m.body)} position={[m.orbit, 0, 0]} scale={m.size} />
              </group>
            ))}
          </group>
        </group>
      ))}
    </group>
  )
}

export default Orrery
