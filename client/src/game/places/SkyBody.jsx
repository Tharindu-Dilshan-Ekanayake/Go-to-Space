import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, DoubleSide, RingGeometry, Vector3 } from 'three'

import { useQuality } from '../../store/quality'
import { LIGHTS } from '../sceneStyle'
import { glowTexture } from '../textures'
import { Atmosphere } from './effects'
import { usePlanetTexture } from './planets'

/**
 * A ring geometry whose texture runs across the ring's width (u 0 at the inner edge, 1 at
 * the outer), so a strip texture lays down as bands. Shared.
 */
function bandedRing(inner, outer) {
  const g = new RingGeometry(inner, outer, 96, 1)
  const pos = g.getAttribute('position')
  const uv = g.getAttribute('uv')
  for (let i = 0; i < pos.count; i += 1) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    uv.setXY(i, (r - inner) / (outer - inner), 0.5)
  }
  return g
}
const RING = bandedRing(1.3, 2.25)

/** The rings round a planet of radius 1 (scale them with the planet). */
export function PlanetRings({ tilt = [Math.PI / 2 - 0.35, 0, 0.2], opacity = 0.95 }) {
  const map = usePlanetTexture('saturnRings')
  return (
    <mesh geometry={RING} rotation={tilt} renderOrder={-1} frustumCulled={false}>
      <meshLambertMaterial map={map} transparent opacity={opacity} side={DoubleSide} fog={false} depthWrite={false} emissive="#ffffff" emissiveMap={map} emissiveIntensity={0.25} />
    </mesh>
  )
}

/**
 * A planet of radius 1: its surface, Earth's clouds drifting over it, rings, and a glow of
 * air round its edge (`halo`). Shared by the sky and the flight scene.
 */
export function Planet({ body, ring = false, halo = null, sphereRef, depthWrite = false }) {
  const map = usePlanetTexture(body)
  const cloudMap = usePlanetTexture('earthClouds')
  const clouds = body === 'earth' ? cloudMap : null
  const cloudsRef = useRef(null)
  // Smooth enough at any size on screen; fewer facets on LOW (they never show there).
  const low = useQuality((st) => st.level === 'LOW')
  const seg = low ? [1, 32, 16] : [1, 48, 24]
  useFrame((_state, delta) => {
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.006
  })
  return (
    <group>
      <mesh ref={sphereRef} rotation={[0.25, 0, 0.1]} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={seg} />
        {/* A faint glow of its own, so even its shaded side reads against the black. */}
        <meshLambertMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.18} fog={false} depthWrite={depthWrite} />
      </mesh>
      {clouds && (
        <mesh ref={cloudsRef} scale={1.012} renderOrder={-1} frustumCulled={false}>
          <sphereGeometry args={seg} />
          <meshLambertMaterial map={clouds} transparent depthWrite={false} fog={false} emissive="#ffffff" emissiveMap={clouds} emissiveIntensity={0.15} />
        </mesh>
      )}
      {ring && <PlanetRings />}
      {halo && <Atmosphere color={halo} radius={1} strength={1.7} />}
    </group>
  )
}

/**
 * A planet or moon hanging in the sky: always the same size and direction however you
 * walk, like the real thing - it follows the camera, drawn just inside the sky dome and
 * behind everything else (no depth write, no fog).
 *
 * @param {{ body: string, direction: [number, number, number], size: number,
 *   ring?: boolean, halo?: string, spin?: number }} props `size` is its apparent radius at
 *   the dome's distance, as a fraction of it (0.2 is big)
 */
export function SkyBody({ body, direction, size, ring = false, halo = null, spin = 0.01 }) {
  const ref = useRef(null)
  const sphereRef = useRef(null)
  const camera = useThree((s) => s.camera)
  // Just inside the sky dome (Sky.jsx sits at 0.9 of the view distance).
  const distance = useQuality((s) => s.settings.viewDistance) * 0.8
  const len = Math.hypot(...direction)
  const radius = distance * size

  useFrame((_state, delta) => {
    const group = ref.current
    if (!group) return
    group.position.set(
      camera.position.x + (direction[0] / len) * distance,
      camera.position.y + (direction[1] / len) * distance,
      camera.position.z + (direction[2] / len) * distance,
    )
    if (sphereRef.current) sphereRef.current.rotation.y += delta * spin
  })

  return (
    <group ref={ref} scale={radius} renderOrder={-1}>
      <Planet body={body} ring={ring} halo={halo} sphereRef={sphereRef} />
    </group>
  )
}

const SUN_DIR = new Vector3(...LIGHTS.sunDirection).normalize()

/**
 * The Sun, where the light comes from: a blazing disc and a wide glare round it, following
 * the camera like the other bodies. For space and airless skies (under air the sky shader
 * draws its glow). `size` as SkyBody's.
 */
export function Sun({ size = 0.035, glare = 9 }) {
  const ref = useRef(null)
  const camera = useThree((s) => s.camera)
  const distance = useQuality((s) => s.settings.viewDistance) * 0.78
  const glow = useMemo(() => glowTexture(), [])
  const sunMap = usePlanetTexture('sun')
  useFrame(() => {
    const g = ref.current
    if (!g) return
    g.position.copy(camera.position).addScaledVector(SUN_DIR, distance)
  })
  const r = distance * size
  return (
    <group ref={ref} renderOrder={-1}>
      <mesh scale={r} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[1, 24, 12]} />
        <meshBasicMaterial map={sunMap} toneMapped={false} fog={false} depthWrite={false} />
      </mesh>
      <sprite scale={r * glare} renderOrder={-1}>
        <spriteMaterial map={glow} color="#fff1c8" transparent blending={AdditiveBlending} depthWrite={false} fog={false} opacity={0.85} />
      </sprite>
    </group>
  )
}

export default SkyBody
