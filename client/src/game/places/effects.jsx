import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { LIGHTS } from '../sceneStyle'
import { shadowTexture } from '../textures'

/**
 * Small shared effects for the places: blinking lights, planet atmospheres and soft
 * contact shadows.
 */

const BULB = new SphereGeometry(1, 8, 6)

/**
 * A set of little lights that blink: nav lights on masts, runway and pad edge lights,
 * the station's beacons. All merged into one mesh (one draw call), each in its own
 * colour; they flash together, `period` seconds apart, briefly (`duty` of the time) -
 * or pulse softly when `pulse` is set.
 *
 * @param {{ lights: { x: number, y: number, z: number, color?: string, size?: number }[],
 *   period?: number, duty?: number, pulse?: boolean, phase?: number }} props
 */
export function Blinkers({ lights, period = 1.6, duty = 0.35, pulse = false, phase = 0 }) {
  const ref = useRef(null)
  const geometry = useMemo(() => {
    const parts = lights.map((l) => {
      const g = BULB.clone()
      const size = l.size ?? 0.22
      g.scale(size, size, size)
      g.translate(l.x, l.y, l.z)
      const c = new Color(l.color || '#ff3b3b')
      const n = g.getAttribute('position').count
      const colors = new Float32Array(n * 3)
      for (let i = 0; i < n; i += 1) colors.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new BufferAttribute(colors, 3))
      g.deleteAttribute('uv')
      return g
    })
    const merged = mergeGeometries(parts)
    for (const p of parts) p.dispose()
    return merged
  }, [lights])
  const material = useMemo(() => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }), [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    const t = (state.clock.elapsedTime / period + phase) % 1
    const on = pulse ? 0.55 + 0.45 * Math.sin(t * Math.PI * 2) : t < duty ? 1 : 0.18
    mesh.material.color.setScalar(on)
  })

  return <mesh ref={ref} geometry={geometry} material={material} />
}

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const atmosphereFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Brightest at the limb, where you look through the most air.
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
    gl_FragColor = vec4(uColor * rim * uStrength, rim);
  }
`

/**
 * A planet's air, glowing round its edge: draw it on a sphere a few percent bigger than
 * the planet. Additive, no depth writes, no fog.
 */
function createAtmosphereMaterial(color, strength = 1.4) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uStrength: { value: strength } },
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  })
}

/** An atmosphere shell, as a component: `radius` is the planet's; the shell sits just outside it. */
export function Atmosphere({ color, radius = 1, strength = 1.4 }) {
  const material = useMemo(() => createAtmosphereMaterial(color, strength), [color, strength])
  useEffect(() => () => material.dispose(), [material])
  return (
    <mesh scale={radius * 1.08} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  )
}

// --- Contact shadows ----------------------------------------------------------------------

const _m = new Matrix4()
const _q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
const _p = new Vector3()
const _s = new Vector3()
/** Which way shadows fall along the ground: away from the sun. */
const SUN = new Vector3(...LIGHTS.sunDirection).normalize()
const FALL = { x: -SUN.x / SUN.y, z: -SUN.z / SUN.y }

function shadowMesh(items, round, opacity) {
  if (items.length === 0) return null
  const material = new MeshBasicMaterial({ color: '#000000', alphaMap: shadowTexture(round), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true })
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, items.length)
  items.forEach((it, i) => {
    // Tall things throw their shadow further from their foot, away from the sun.
    const lean = (it.h || 0) * 0.32
    const w = round ? it.r * 2 : it.w
    const d = round ? it.r * 2 : it.d
    _p.set(it.x + FALL.x * lean, (it.y || 0) + 0.035, it.z + FALL.z * lean)
    _s.set(w + lean * 0.6, d + lean * 0.6, 1)
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.renderOrder = 1
  return mesh
}

/**
 * Soft shadows on the ground under buildings, craft and trees: `rects` (`{ x, z, w, d,
 * y?, h? }`) and `discs` (`{ x, z, r, y?, h? }`), `h` the height of what casts it. They
 * ground everything on every preset, LOW included (where there are no realtime shadows).
 * Two draw calls in all.
 */
export function ContactShadows({ rects = [], discs = [], opacity = 0.42 }) {
  const meshes = useMemo(() => [shadowMesh(rects, false, opacity), shadowMesh(discs, true, opacity)].filter(Boolean), [rects, discs, opacity])
  useEffect(
    () => () => {
      for (const m of meshes) {
        m.geometry.dispose()
        m.material.dispose()
        m.dispose()
      }
    },
    [meshes],
  )
  return meshes.map((m) => <primitive key={m.uuid} object={m} />)
}
