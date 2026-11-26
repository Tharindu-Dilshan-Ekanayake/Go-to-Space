import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color } from 'three'

import { destinationById } from '@shared/balance'
import { fbm, LAKE_LEVEL, speckle, terrainHeight, terrainOf } from '@shared/terrain'
import { layoutOf, SAFE_ROOM, SURFACE_LANDING } from '@shared/world'

import { useQuality } from '../../store/quality'
import { asToyInstance, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { useCraft } from './craft'
import { Blinkers } from './effects'
import { GEO, scatter, useBlocks, useProps, useScatter } from './kit'
import SkyBody, { Sun } from './SkyBody'
import { ParkedJets } from './jets'
import { OxygenStore } from './o2'
import { addSquarePad } from './pads'
import { SafeRoom } from './saferoom'
import { addRover } from './vehicles'

const SURFACE = layoutOf('moon')
const Z = SURFACE.zones
const LANDING = SURFACE_LANDING
/** How far the terrain mesh reaches from the middle (the mountains are inside it). */
const TERRAIN_HALF = 220

/** What hangs in each destination's sky. */
const SKIES = {
  // Low in the north, where the camera looks when you arrive.
  moon: [{ body: 'earth', direction: [0.3, 0.2, -0.95], size: 0.11, halo: '#6fb7ff' }],
  mars: [{ body: 'moon', direction: [-0.5, 0.22, -0.85], size: 0.025 }],
  venus: [],
  mercury: [],
  europa: [
    { body: 'jupiter', direction: [0.45, 0.24, -0.86], size: 0.24, halo: '#f0d9b0' },
    { body: 'io', direction: [-0.5, 0.35, -0.8], size: 0.02 },
  ],
  io: [
    { body: 'jupiter', direction: [-0.35, 0.28, -0.9], size: 0.3, halo: '#f0d9b0' },
    { body: 'europa', direction: [0.6, 0.3, -0.75], size: 0.018 },
  ],
  ganymede: [{ body: 'jupiter', direction: [0.55, 0.22, -0.8], size: 0.18, halo: '#f0d9b0' }],
  callisto: [{ body: 'jupiter', direction: [-0.5, 0.2, -0.85], size: 0.13, halo: '#f0d9b0' }],
  titan: [{ body: 'saturn', direction: [0.4, 0.26, -0.88], size: 0.16, ring: true }],
}

const _c = new Color()
const _rock = new Color()
const _dust = new Color()
const _special = new Color()
/** Worlds with wide dark plains between the craters. */
const MARIA = new Set(['moon', 'mercury', 'ganymede', 'callisto'])

/**
 * The ground of `place` as one mesh: a grid packed tight in the middle (where you walk)
 * and spreading out towards the mountains, heights from shared/terrain.js (the same the
 * collision uses), coloured per vertex - dust on the flats, bare rock on the slopes and
 * crater floors, and each world's own pattern on top.
 */
function buildTerrain(place, look, segments) {
  const n = segments + 1
  // u in [-1, 1] -> metres: dense near the middle, sparse far out.
  const axis = Array.from({ length: n }, (_, i) => {
    const u = (i / segments) * 2 - 1
    return Math.sign(u) * (64 * Math.abs(u) + (TERRAIN_HALF - 64) * Math.abs(u) ** 3)
  })
  const positions = new Float32Array(n * n * 3)
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = axis[i]
      const z = axis[j]
      positions.set([x, terrainHeight(place, x, z), z], (j * n + i) * 3)
    }
  }
  const index = []
  for (let j = 0; j < segments; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = j * n + i
      index.push(a, a + n, a + 1, a + 1, a + n, a + n + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()

  const normals = geometry.getAttribute('normal')
  const colors = new Float32Array(n * n * 3)
  const styles = new Float32Array(n * n).fill(STYLE.ROAD)
  const ground = new Color(look.ground)
  _rock.set(look.rock)
  _dust.set(look.dust)
  const { seed, craters } = terrainOf(place)
  for (let v = 0; v < n * n; v += 1) {
    const x = positions[v * 3]
    const y = positions[v * 3 + 1]
    const z = positions[v * 3 + 2]
    const slope = 1 - normals.getY(v)
    _c.copy(ground)
    // Bare rock on the slopes and down in the hollows; fresh dust on the high ground.
    _c.lerp(_rock, Math.min(1, Math.max(0, (slope - 0.06) / 0.25)) * 0.8)
    if (y < -0.4) _c.lerp(_rock, Math.min(0.6, (-0.4 - y) * 0.35))
    if (y > 8) _c.lerp(_dust, Math.min(0.5, (y - 8) / 30))
    // Craters: a dark floor and a bright fresh rim, so they read from across the plain.
    for (const crater of craters) {
      const q = Math.hypot(x - crater.x, z - crater.z) / crater.r
      if (q < 0.85) _c.lerp(_rock, 0.45 * (1 - q / 0.85) + 0.2).multiplyScalar(0.97)
      else if (q < 1.35) _c.lerp(_dust, 0.55 * (1 - Math.abs(q - 1.08) / 0.27))
    }
    // Wide dark plains (maria) on the old cratered moons.
    if (MARIA.has(place)) {
      const mare = fbm(x / 70, z / 70, seed + 8)
      if (mare > 0.08) _c.multiplyScalar(1 - Math.min(0.28, (mare - 0.08) * 1.6))
    }
    if (place === 'europa') {
      // Reddish-brown cracks criss-crossing the ice.
      const crack = Math.abs(fbm(x / 11, z / 11, seed + 4))
      if (crack < 0.025) _c.lerp(_special.set('#a8603a'), 1 - crack / 0.025)
    } else if (place === 'io') {
      // Sulphur fields: white frost and orange-red flows over the yellow.
      const p = fbm(x / 16, z / 16, seed + 5)
      if (p > 0.13) _c.lerp(_special.set('#f4f0d2'), Math.min(1, (p - 0.13) * 8))
      else if (p < -0.12) _c.lerp(_special.set('#d8561a'), Math.min(1, (-0.12 - p) * 8))
    } else if (place === 'titan' && y < LAKE_LEVEL + 0.6) {
      // Methane lakes: dark and still, shading smoothly into the shore.
      _c.lerp(_special.set('#1d140c'), 1 - (y - LAKE_LEVEL) / 0.6)
      if (y <= LAKE_LEVEL + 0.05) styles[v] = STYLE.SMOOTH
    } else if (place === 'mars') {
      // Dune crests catch a lighter dust.
      const crest = Math.sin(x * 0.18 + fbm(x / 30, z / 30, seed + 3) * 6)
      if (crest > 0.7) _c.lerp(_dust, (crest - 0.7) * 1.4)
    }
    const k = 0.94 + speckle(place, x, z) * 0.12
    colors.set([_c.r * k, _c.g * k, _c.b * k], v * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('aStyle', new BufferAttribute(styles, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/** The terrain mesh for `place`, rebuilt when the place or the detail level changes. */
function Terrain({ place, look, segments }) {
  const mesh = useMemo(() => asToyInstance(buildTerrain(place, look, segments), sharedMaterials().toy), [place, look, segments])
  useEffect(() => () => disposeBlocks(mesh), [mesh])
  return <primitive object={mesh} />
}

/** Lit marker posts down both sides of the path from the landing pad to the outpost. */
const PATH_POSTS = [10, 14, 18, 22].flatMap((z) => [
  [-3.2, z],
  [3.2, z],
])

/**
 * A destination's surface: rolling ground in its colours with craters you can walk in and
 * out of, mountains all round, rocks scattered about (fewer on low settings), the outpost
 * - module, habitat dome, solar array, antenna, flag and rover - with its Cargo Pad, the
 * beacon that flies you back up to Halo Station, and your spaceplane on the landing pad.
 * What's overhead depends where you are: Earth from the Moon, Jupiter from its moons,
 * Saturn's rings from Titan.
 *
 * One component for every destination (`place` picks the look), in its own chunk.
 *
 * @param {{ place: string }} props
 */
export function Surface({ place }) {
  const dest = destinationById(place)
  const look = dest.look
  const density = useQuality((s) => s.settings.decorDensity)
  const level = useQuality((s) => s.level)
  const segments = level === 'LOW' ? 72 : level === 'MEDIUM' ? 96 : 120
  const seed = useMemo(() => [...place].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7), [place])

  const blocks = useBlocks((b) => {
    // The outpost module: a long white hull with an orange stripe, lit windows, a door.
    b.addOn(-14, 0, -9, 12, 4, 6, '#e8ebf0', STYLE.SMOOTH)
    b.addOn(-14, 2.6, -5.95, 12.05, 0.4, 0.1, '#ff7a1a', STYLE.SMOOTH)
    for (let i = 0; i < 4; i += 1) b.addOn(-18.5 + i * 3, 1.3, -5.95, 1.6, 0.9, 0.1, '#9fe0ff', STYLE.GLOW)
    b.addOn(-14, 4, -9, 12.4, 0.3, 6.4, '#9aa1ad', STYLE.SMOOTH)
    b.addOn(-9.2, 0, -5.4, 1.8, 2.6, 1.4, '#cfd4dc', STYLE.SMOOTH)
    b.addOn(-9.2, 0.1, -4.68, 1.2, 2.2, 0.06, '#3a4150', STYLE.SMOOTH)
    b.addOn(-8.5, 2.1, -4.66, 0.25, 0.25, 0.04, '#3aff8a', STYLE.GLOW)
    // Crates waiting by the Cargo Pad.
    for (const [x, z, s, y] of [
      [-19, -3.4, 1.2, 0],
      [-19, -3.4, 0.7, 1.2],
      [-17.6, -3.6, 0.9, 0],
      [-9.5, -2.2, 1.1, 0],
    ])
      b.addOn(x, y, z, s, s, s, '#c8925a', STYLE.SMOOTH, 0.3)
    // The solar array behind the module: three tilted panels on posts.
    for (let i = 0; i < 3; i += 1) {
      const x = -18 + i * 4
      b.addOn(x, 0, -18, 0.2, 1.6, 0.2, '#9aa1ad', STYLE.SMOOTH)
      b.add(x, 1.9, -18, 3.6, 0.08, 2.4, '#1d3a8a', STYLE.GALAXY, 0, -0.5)
      b.add(x, 1.86, -18, 3.75, 0.06, 2.55, '#c3c9d3', STYLE.SMOOTH, 0, -0.5)
    }
    // The landing pad, its hazard edging.
    b.addOn(LANDING.x, 0, LANDING.z, 14, 0.12, 14, '#5d6573', STYLE.PLATE)
    for (const [x, z, sx, sz] of [
      [0, LANDING.z - 7, 14, 0.4],
      [0, LANDING.z + 7, 14, 0.4],
      [-7, LANDING.z, 0.4, 14],
      [7, LANDING.z, 0.4, 14],
    ])
      b.addOn(x, 0.12, z, sx, 0.03, sz, '#ffc21a', STYLE.SMOOTH)
    b.addOn(LANDING.x, 0.12, LANDING.z, 4, 0.02, 0.5, '#ffffff', STYLE.SMOOTH)
    b.addOn(LANDING.x, 0.12, LANDING.z, 0.5, 0.02, 4, '#ffffff', STYLE.SMOOTH)
    // Path marker posts.
    for (const [x, z] of PATH_POSTS) {
      b.addOn(x, 0, z, 0.16, 0.7, 0.16, '#9aa1ad', STYLE.SMOOTH)
      b.addOn(x, 0.7, z, 0.22, 0.12, 0.22, '#3ad6ff', STYLE.GLOW)
    }
    // The flag by the module.
    b.addOn(-6, 0, -4, 0.1, 4.2, 0.1, '#d7dce3', STYLE.SMOOTH)
    b.add(-5.1, 3.6, -4, 1.7, 1, 0.04, '#2f6fe0', STYLE.SMOOTH)
    b.add(-5.1, 3.6, -3.97, 1.1, 0.25, 0.04, '#ffffff', STYLE.SMOOTH)
  }, place)

  const props = useProps((b) => {
    const ring = (zone, color) => addSquarePad(b, zone, color)
    ring(Z.cargo, '#ffb21a')
    ring(Z.beacon, '#3ad6ff')
    // The beacon: a mast with a lamp housing.
    b.add(GEO.cylinderLow, { position: [Z.beacon.x + 3.6, 3, Z.beacon.z], scale: [0.18, 6, 0.18], color: '#9aa1ad', style: STYLE.SMOOTH })
    b.add(GEO.cylinder, { position: [Z.beacon.x + 3.6, 6.15, Z.beacon.z], scale: [0.35, 0.3, 0.35], color: '#5d6573', style: STYLE.SMOOTH })
    // The tube from the safe room (SafeRoom) to the module.
    b.add(GEO.cylinder, { position: [-21.5, 1.3, -9], rotation: [0, 0, Math.PI / 2], scale: [1, 3.4, 1], color: '#d7dce3', style: STYLE.SMOOTH })
    for (const x of [-20.6, -22.6]) b.add(GEO.cylinder, { position: [x, 1.3, -9], rotation: [0, 0, Math.PI / 2], scale: [1.08, 0.2, 1.08], color: '#ff7a1a', style: STYLE.SMOOTH })
    // The antenna mast and dish on the module.
    b.add(GEO.cylinderLow, { position: [-9.5, 7, -10], scale: [0.15, 6, 0.15], color: '#9aa1ad', style: STYLE.SMOOTH })
    b.add(GEO.cone, { position: [-17, 5, -10], rotation: [-0.8, 0.4, 0], scale: [1.6, 0.6, 1.6], color: '#e8ebf0', style: STYLE.SMOOTH })
    b.add(GEO.cylinderLow, { position: [-17, 5.25, -9.75], rotation: [-0.8, 0.4, 0], scale: [0.06, 0.9, 0.06], color: '#9aa1ad', style: STYLE.SMOOTH })
    // Io's volcano, its lava glowing, on the horizon.
    if (place === 'io') {
      const y = terrainHeight(place, 40, -96)
      b.add(GEO.coneLow, { position: [40, y + 9, -96], scale: [26, 18, 26], color: look.rock, style: STYLE.SMOOTH })
      b.add(GEO.cylinderLow, { position: [40, y + 17.6, -96], scale: [3.4, 1, 3.4], color: '#ff6a14', style: STYLE.LAVA })
    }
  }, place)

  const rover = useCraft((c) => addRover(c), '')

  // Rocks scattered over the ground (none on the flat spots), sitting on it.
  const keepOut = useMemo(
    () => [
      { x: 0, z: 12, radius: 26 },
      { x: -16, z: -10, radius: 20 },
      { x: LANDING.x, z: LANDING.z, radius: 12 },
      { x: 0, z: 6, radius: 7 },
    ],
    [],
  )
  const rockPlaces = useMemo(
    () =>
      scatter(seed + 1, Math.round(110 * density), 150, keepOut, { minScale: 0.4, maxScale: 2.8 }).map((p) => ({
        ...p,
        y: terrainHeight(place, p.x, p.z) - p.s * 0.25,
        sy: p.s * 0.65,
      })),
    [seed, density, keepOut, place],
  )
  const rocks = useScatter(
    (b) => {
      b.add(GEO.rock, { position: [0, 0.2, 0], scale: [1, 0.7, 0.9], color: look.rock, style: STYLE.SMOOTH })
      b.add(GEO.rock, { position: [0.7, 0.05, 0.4], rotation: [0.4, 1, 0], scale: [0.45, 0.35, 0.4], color: look.rock, style: STYLE.SMOOTH })
    },
    rockPlaces,
    place,
  )

  const lights = useMemo(
    () => [
      // The landing pad's four corners, and the beacon's lamp.
      ...[
        [-7, LANDING.z - 7],
        [7, LANDING.z - 7],
        [-7, LANDING.z + 7],
        [7, LANDING.z + 7],
      ].map(([x, z]) => ({ x, y: 0.35, z, color: '#ffb21a', size: 0.2 })),
      { x: Z.beacon.x + 3.6, y: 6.5, z: Z.beacon.z, color: '#3ad6ff', size: 0.32 },
      { x: -9.5, y: 10.1, z: -10, color: '#ff3b3b', size: 0.22 },
      { x: SAFE_ROOM.x, y: 2.4 + SAFE_ROOM.radius * 0.62 + 0.35, z: SAFE_ROOM.z, color: '#ff3b3b', size: 0.18 },
    ],
    [],
  )

  return (
    <group>
      <Terrain place={place} look={look} segments={segments} />
      <primitive object={blocks} />
      {props && <primitive object={props} />}
      {rocks && <primitive object={rocks} />}
      <primitive object={rover} position={[8, 0, -8]} rotation={[0, -0.5, 0]} />
      <ParkedJets place={place} />
      <OxygenStore place={place} />
      <SafeRoom />
      <Blinkers lights={lights} period={1.4} duty={0.4} />
      {(SKIES[place] || []).map((sky) => (
        <SkyBody key={sky.body} {...sky} />
      ))}
      {/* Under no air the Sun is a blazing disc (Mercury's, close in, is huge). */}
      {look.stars > 0 && <Sun size={place === 'mercury' ? 0.09 : 0.03} glare={place === 'mercury' ? 7 : 9} />}
    </group>
  )
}

export default Surface
