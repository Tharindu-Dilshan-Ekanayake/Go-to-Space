import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Euler, Quaternion, Vector3 } from 'three'

import { isUnlocked } from '@shared/logic'
import { BAYS, GARDEN, layoutOf } from '@shared/world'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { STYLE } from '../materials'
import { useCraft, useCraftScatter } from './craft'
import { Blinkers } from './effects'
import { ParkedJets } from './jets'
import { OxygenStore } from './o2'
import { addSquarePad } from './pads'
import { GEO, useBlocks, useProps } from './kit'
import Orrery from './Orrery'
import SkyBody, { Sun } from './SkyBody'
import { surfaceMaterials, tiledPlane, useSurface } from './surfaces'
import { addPod, addSpaceplane, SPACEPLANE_GEAR } from './vehicles'

const STATION = layoutOf('station')
const POD = STATION.zones.pod
const { minX, maxX, minZ, maxZ } = STATION.bounds
const W = maxX - minX
const D = maxZ - minZ
const CX = (minX + maxX) / 2
const CZ = (minZ + maxZ) / 2

const COLORS = {
  hull: '#3a404c',
  hullDark: '#2c313b',
  wall: '#e3e8ee',
  wallDark: '#aab3bf',
  trim: '#3ad6ff',
  glass: '#9fd8ff',
  open: '#3aff8a',
  locked: '#ff4a3b',
  hazard: '#ffc21a',
  hazardDark: '#2a2d35',
  panel: '#1d3a8a',
  window: '#ffe7a0',
}

/** The habitat wheel far behind the bays: where it turns, how big it is. */
const WHEEL = { x: 0, y: 52, z: -150, radius: 66 }
/**
 * The halo the station is named for: a great lit ring circling high over the deck,
 * held up on four pylons from the deck's corners.
 */
const HALO = { y: 19, radius: 74 }
const PARKED_SCALE = 0.75

/** Euler angles turning +Y to point from `a` to `b` (for a pylon cylinder between them). */
const _dir = new Vector3()
const _q = new Quaternion()
const _e = new Euler()
const _yAxis = new Vector3(0, 1, 0)
function strut(a, b) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const length = _dir.length()
  _q.setFromUnitVectors(_yAxis, _dir.normalize())
  _e.setFromQuaternion(_q)
  return { position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotation: [_e.x, _e.y, _e.z], length }
}

/**
 * Halo Station, high above Earth. A great deck of hull plating with glowing lanes; the
 * solar system turning in miniature at its heart (Orrery); a shuttle bay for every
 * destination along the north wall, each with a spaceplane on its gear and a screen over
 * it (green: open; red: locked); a lounge of open-cockpit jets to sit in, east; the garden
 * dome, west; the re-entry pod home. Overhead the halo itself circles the deck; behind the
 * bays the habitat wheel turns slowly and truss arms carry solar wings far out either side.
 * Earth fills the sky; the Moon and the planets hang in the black over the Milky Way.
 *
 * Its own chunk: fetched once the lobby is up, never at start-up.
 */
export function Station() {
  const unlockedKey = useGame((s) => s.profile.unlocked.join(','))
  const profile = useGame((s) => s.profile)

  // The deck: hull plating, one textured plane (one draw call, painted on the worker).
  const deck = useSurface((add) => add(tiledPlane(W + 6, D + 6, 8, { x: CX, y: 0.01, z: CZ })), surfaceMaterials().deck)

  const blocks = useBlocks((b) => {
    // The hull under the deck: a thick slab, a deep keel, and rows of lit ports.
    b.addOn(CX, -1.4, CZ, W + 6, 1.4, D + 6, COLORS.hull, STYLE.SMOOTH)
    b.addOn(CX, -6.4, CZ, W - 6, 5, D - 8, COLORS.hullDark, STYLE.SMOOTH)
    b.addOn(CX, -10.4, CZ - 4, W - 34, 4, D - 26, '#262a33', STYLE.SMOOTH)
    for (let i = 0; i < 14; i += 1) b.addOn(minX + 6 + i * 7.6, -5, maxZ + 0.02 - 1, 4, 0.8, 0.1, COLORS.window, STYLE.GLOW)
    for (let i = 0; i < 8; i += 1) {
      b.addOn(minX - 0.02, -5, minZ + 6 + i * 8, 0.1, 0.8, 4, COLORS.window, STYLE.GLOW)
      b.addOn(maxX + 0.02, -5, minZ + 6 + i * 8, 0.1, 0.8, 4, COLORS.window, STYLE.GLOW)
    }
    // A lit edge all round the deck.
    b.addOn(CX, -0.05, maxZ + 3, W + 6, 0.12, 0.2, COLORS.trim, STYLE.GLOW)
    b.addOn(minX - 3, -0.05, CZ, 0.2, 0.12, D + 6, COLORS.trim, STYLE.GLOW)
    b.addOn(maxX + 3, -0.05, CZ, 0.2, 0.12, D + 6, COLORS.trim, STYLE.GLOW)

    // Lanes of light: from the arrival point up to the solar system, along the bays, out
    // to the jet lounge and the pod.
    for (const x of [-9, 9]) b.addOn(x, 0, 18, 0.35, 0.03, 24, COLORS.trim, STYLE.GLOW)
    b.addOn(0, 0, 30, 18.35, 0.03, 0.35, COLORS.trim, STYLE.GLOW)
    b.addOn(0, 0, BAYS[0].z + 6, 2 * (maxX - 4), 0.03, 0.35, COLORS.trim, STYLE.GLOW)
    b.addOn(22, 0, 11, 26, 0.03, 0.35, COLORS.trim, STYLE.GLOW)
    b.addOn(-24, 0, 28, 28, 0.03, 0.35, COLORS.trim, STYLE.GLOW)
    // Chevrons pointing the way to the bays.
    for (let i = 0; i < 4; i += 1) {
      for (const side of [-1, 1]) b.add(side * 0.9, 0.02, -14 - i * 2.4, 2.2, 0.03, 0.35, COLORS.hazard, STYLE.GLOW, side * 0.7)
    }

    // Glass rail on three sides, on posts.
    b.addOn(CX, 0, maxZ + 2.4, W + 5, 1.1, 0.2, COLORS.glass, STYLE.GLOW)
    b.addOn(minX - 2.4, 0, CZ, 0.2, 1.1, D + 5, COLORS.glass, STYLE.GLOW)
    b.addOn(maxX + 2.4, 0, CZ, 0.2, 1.1, D + 5, COLORS.glass, STYLE.GLOW)
    for (let x = minX - 2.4; x <= maxX + 2.5; x += 7) b.addOn(x, 0, maxZ + 2.4, 0.3, 1.3, 0.3, COLORS.wallDark, STYLE.SMOOTH)
    for (let z = minZ; z <= maxZ + 2.5; z += 7) {
      b.addOn(minX - 2.4, 0, z, 0.3, 1.3, 0.3, COLORS.wallDark, STYLE.SMOOTH)
      b.addOn(maxX + 2.4, 0, z, 0.3, 1.3, 0.3, COLORS.wallDark, STYLE.SMOOTH)
    }

    // The bay wall: back wall and roof, a lit trim, and a frame round each bay with
    // hazard stripes up its sides.
    const bayZ = BAYS[0].z
    b.addOn(CX, 0, bayZ - 10.5, W + 6, 12, 0.6, COLORS.wall, STYLE.SMOOTH)
    b.addOn(CX, 12, bayZ - 5.5, W + 6, 0.7, 11, COLORS.wallDark, STYLE.SMOOTH)
    b.addOn(CX, 11.2, bayZ - 0.1, W + 6, 0.3, 0.3, COLORS.trim, STYLE.GLOW)
    b.addOn(CX, 12.7, bayZ - 5.5, W - 10, 0.5, 6, COLORS.wall, STYLE.SMOOTH)
    for (const bay of BAYS) {
      for (const side of [-1, 1]) {
        const x = bay.x + side * 4.6
        b.addOn(x, 0, bay.z - 5, 0.8, 12, 10, COLORS.wall, STYLE.SMOOTH)
        for (let y = 0; y < 10; y += 1) b.addOn(x - side * 0.41, y, bay.z + 0.02, 0.06, 1, 0.5, y % 2 ? COLORS.hazard : COLORS.hazardDark, STYLE.SMOOTH)
      }
      b.addOn(bay.x, 0, bay.z - 5, 8.4, 0.04, 10, '#2a2f38', STYLE.PLATE)
      // A strip light along the bay's ceiling.
      b.addOn(bay.x, 11.3, bay.z - 5, 0.4, 0.12, 8, '#fff6d0', STYLE.GLOW)
    }

    // The garden dome's base, its lit trim, and a lawn inside.
    b.addOn(GARDEN.x, 0, GARDEN.z, GARDEN.w, 1.3, GARDEN.d, COLORS.wall, STYLE.SMOOTH)
    b.addOn(GARDEN.x, 1.3, GARDEN.z, GARDEN.w - 0.8, 0.06, GARDEN.d - 0.8, '#4caf43', STYLE.SMOOTH)
    for (const [x, z, w, d] of [
      [0, GARDEN.d / 2, GARDEN.w + 0.2, 0.2],
      [0, -GARDEN.d / 2, GARDEN.w + 0.2, 0.2],
      [-GARDEN.w / 2, 0, 0.2, GARDEN.d + 0.2],
      [GARDEN.w / 2, 0, 0.2, GARDEN.d + 0.2],
    ])
      b.addOn(GARDEN.x + x, 1.3, GARDEN.z + z, w, 0.16, d, COLORS.trim, STYLE.GLOW)

    // The jet lounge: a raised strip of light framing the two parked jets.
    b.addOn(40, 0, 11, 0.35, 0.03, 30, COLORS.trim, STYLE.GLOW)

    // Truss arms out to the solar wings, either side.
    for (const side of [-1, 1]) {
      const x0 = side * (maxX + 3)
      for (const [dy, dz] of [
        [0, -1.4],
        [0, 1.4],
        [-2.4, -1.4],
        [-2.4, 1.4],
      ])
        b.add(x0 + side * 30, -1.2 + dy, dz, 60, 0.35, 0.35, COLORS.wallDark, STYLE.SMOOTH)
      for (let i = 0; i < 15; i += 1) {
        const x = x0 + side * (i * 4 + 2)
        b.add(x, -2.4, 0, 0.2, 3.2, 0.2, COLORS.wallDark, STYLE.SMOOTH, 0, 0, side * 0.6)
        b.add(x, -2.4, 0, 0.2, 0.2, 3, COLORS.wallDark, STYLE.SMOOTH)
      }
      // Three solar wings per arm, each a framed panel either side of the truss.
      for (let i = 0; i < 3; i += 1) {
        const x = x0 + side * (14 + i * 15)
        for (const z of [-9, 9]) {
          b.add(x, -1.2, z, 13, 0.12, 13, COLORS.panel, STYLE.GALAXY)
          b.add(x, -1.25, z, 13.4, 0.08, 13.4, COLORS.wallDark, STYLE.SMOOTH)
        }
      }
    }

    // Planters along the south rail, and cargo stacked by the pod.
    for (const x of [-44, -26, -8, 8, 26, 44]) {
      b.addOn(x, 0, maxZ + 0.6, 3.4, 0.8, 1.4, COLORS.wallDark, STYLE.SMOOTH)
      b.addOn(x, 0.8, maxZ + 0.6, 3.1, 0.06, 1.1, '#4caf43', STYLE.SMOOTH)
    }
    for (const [x, z, s, y] of [
      [-48, 20, 1.3, 0],
      [-49.4, 20.2, 1, 0],
      [-48, 20, 0.9, 1.3],
      [-30, 34, 1.3, 0],
      [-31.3, 33.6, 1.1, 0],
    ])
      b.addOn(x, y, z, s, s, s, '#c8925a', STYLE.SMOOTH, 0.2)
    // The pod's launch frame.
    for (const dx of [-2.6, 2.6]) b.addOn(POD.x + dx, 0, POD.z - 3, 0.35, 6, 0.35, COLORS.wallDark, STYLE.SMOOTH)
    b.addOn(POD.x, 6, POD.z - 3, 5.6, 0.35, 0.35, COLORS.wallDark, STYLE.SMOOTH)
  }, '')

  const props = useProps((b) => {
    // Bay rings and the screen over each bay: green if you can fly there, red if locked.
    for (const bay of BAYS) {
      const open = isUnlocked(profile, bay.id)
      const color = open ? COLORS.open : COLORS.locked
      addSquarePad(b, bay, color)
      // The screen over the bay: dark, framed in green (open) or red (locked); its words
      // are printed on it (placeLabels).
      b.box(bay.x, 9.8, bay.z - 0.5, 6.6, 1.7, 0.12, color, STYLE.GLOW)
      b.box(bay.x, 9.8, bay.z - 0.42, 6.2, 1.36, 0.06, '#0d1a33', STYLE.GLOW)
    }
    // The re-entry pod's ring.
    addSquarePad(b, POD, '#ffb21a')
    // Little trees in the planters.
    for (const x of [-44, -26, -8, 8, 26, 44]) {
      for (const dx of [-0.9, 0.9]) {
        b.add(GEO.cylinderLow, { position: [x + dx, 1.2, maxZ + 0.6], scale: [0.08, 0.8, 0.08], color: '#7a4f2c', style: STYLE.SMOOTH })
        b.add(GEO.sphere, { position: [x + dx, 1.9, maxZ + 0.6], scale: [0.55, 0.7, 0.55], color: '#3fae4a', style: STYLE.SMOOTH })
      }
    }
    // Inside the dome: three trees, flowers, two benches.
    for (const [dx, dz, s] of [
      [0, 0, 1.2],
      [-3.8, -1.6, 0.9],
      [3.6, 1.4, 0.95],
    ]) {
      b.add(GEO.cylinderLow, { position: [GARDEN.x + dx, 1.3 + s, GARDEN.z + dz], scale: [0.18 * s, 2 * s, 0.18 * s], color: '#7a4f2c', style: STYLE.SMOOTH })
      b.add(GEO.sphere, { position: [GARDEN.x + dx, 1.3 + 2.6 * s, GARDEN.z + dz], scale: [1.4 * s, 1.15 * s, 1.4 * s], color: '#3fae4a', style: STYLE.SMOOTH })
    }
    for (const [dx, dz, c] of [
      [-1.8, 2.6, '#ff6fa8'],
      [2, -2.4, '#ffd23a'],
      [-5, 2.2, '#b06bff'],
      [5.2, -2, '#ff8a3a'],
    ])
      b.add(GEO.sphere, { position: [GARDEN.x + dx, 1.45, GARDEN.z + dz], scale: [0.5, 0.25, 0.5], color: c, style: STYLE.SMOOTH })
    for (const dz of [-3.6, 3.6]) b.box(GARDEN.x + 1.5, 1.7, GARDEN.z + dz, 2, 0.15, 0.6, '#9a6436', STYLE.SMOOTH)

    // The halo: a great lit ring high over the deck, windows round its inside, on four
    // pylons from the deck's corners.
    b.add(GEO.ringThick, { position: [0, HALO.y, CZ], rotation: [Math.PI / 2, 0, 0], scale: [HALO.radius, HALO.radius, HALO.radius * 0.6], color: '#dfe4ea', style: STYLE.SMOOTH })
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2
      const r = HALO.radius * 0.95
      b.box(Math.cos(a) * r, HALO.y - 0.3, CZ + Math.sin(a) * r, 0.25, 1.1, 2.8, COLORS.window, STYLE.GLOW, [0, -a, 0])
    }
    b.add(GEO.ring, { position: [0, HALO.y - 2.4, CZ], rotation: [Math.PI / 2, 0, 0], scale: [HALO.radius * 0.94, HALO.radius * 0.94, 2], color: COLORS.trim, style: STYLE.GLOW })
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const a = Math.atan2(sz, sx)
      const p = strut([sx * (maxX + 2), -0.5, CZ + sz * (D / 2 + 2)], [Math.cos(a) * HALO.radius * 0.97, HALO.y, CZ + Math.sin(a) * HALO.radius * 0.97])
      b.add(GEO.cylinderLow, { position: p.position, rotation: p.rotation, scale: [0.9, p.length, 0.9], color: COLORS.wallDark, style: STYLE.SMOOTH })
      b.add(GEO.cylinderLow, { position: p.position, rotation: p.rotation, scale: [1.0, 1.2, 1.0], color: COLORS.trim, style: STYLE.GLOW })
    }
    // The antenna mast over the bay wall, and a dish.
    b.add(GEO.cylinderLow, { position: [0, 21, BAYS[0].z - 8], scale: [0.35, 18, 0.35], color: COLORS.wall, style: STYLE.SMOOTH })
    b.add(GEO.cone, { position: [-6, 15.4, BAYS[0].z - 6], rotation: [-0.6, 0, 0], scale: [3, 0.9, 3], color: COLORS.wall, style: STYLE.SMOOTH })
  }, unlockedKey)

  // A spaceplane parked in every bay on its gear, nose out to the deck.
  const parked = useMemo(() => BAYS.map((bay) => ({ x: bay.x, y: SPACEPLANE_GEAR * PARKED_SCALE, z: bay.z - 5.2, s: PARKED_SCALE, r: 0 })), [])
  const lite = useQuality((st) => st.level === 'LOW')
  const planes = useCraftScatter((c) => addSpaceplane(c, { gear: true, lite }), parked, lite ? 'lite' : '')
  const pod = useCraft((c) => addPod(c, 1), '')

  const lights = useMemo(
    () => [
      ...[minX - 2.6, maxX + 2.6].flatMap((x) => [
        { x, y: 1.5, z: maxZ + 2.6, color: '#ff3b3b' },
        { x, y: 1.5, z: minZ, color: '#3bff6a' },
      ]),
      { x: 0, y: 30.2, z: BAYS[0].z - 8, color: '#ff3b3b', size: 0.4 },
      { x: -(maxX + 63), y: -1.2, z: 0, color: '#ff3b3b', size: 0.5 },
      { x: maxX + 63, y: -1.2, z: 0, color: '#3bff6a', size: 0.5 },
      ...[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        return { x: Math.cos(a) * HALO.radius, y: HALO.y + 2.8, z: CZ + Math.sin(a) * HALO.radius, color: '#ff3b3b', size: 0.6 }
      }),
    ],
    [],
  )
  const pulses = useMemo(() => BAYS.map((bay) => ({ x: bay.x, y: 11.2, z: bay.z + 0.1, color: '#fff6d0', size: 0.22 })), [])

  return (
    <group>
      {deck && <primitive object={deck} />}
      <primitive object={blocks} />
      {props && <primitive object={props} />}
      <primitive object={planes} />
      <primitive object={pod} position={[POD.x, 0.32, POD.z - 3]} />
      <Orrery />
      <ParkedJets place="station" />
      <OxygenStore place="station" />
      <GlassDome />
      <HabitatWheel />
      <Blinkers lights={lights} period={1.8} duty={0.25} />
      <Blinkers lights={pulses} period={2.4} pulse />
      {/* Earth far below the orbit, low in the east; the Moon, the outer planets. */}
      <SkyBody body="earth" direction={[0.86, 0.17, -0.48]} size={0.17} spin={0.004} halo="#6fb7ff" />
      <SkyBody body="moon" direction={[-0.9, 0.25, -0.35]} size={0.06} spin={0} />
      <SkyBody body="mars" direction={[-0.35, 0.55, 0.75]} size={0.025} halo="#e8a070" />
      <SkyBody body="jupiter" direction={[0.8, 0.35, 0.6]} size={0.05} />
      <SkyBody body="saturn" direction={[-0.5, 0.5, -0.8]} size={0.035} ring />
      <Sun size={0.04} />
    </group>
  )
}

/** The garden dome's glass: one clear shell over the lawn and the trees. */
function GlassDome() {
  return (
    <mesh position={[GARDEN.x, 1.3, GARDEN.z]} scale={[GARDEN.w / 2 - 0.1, 6, GARDEN.d / 2 - 0.1]} renderOrder={2}>
      <sphereGeometry args={[1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshLambertMaterial color="#bfe8ff" emissive="#16303f" transparent opacity={0.26} depthWrite={false} />
    </mesh>
  )
}

/**
 * The station's habitat wheel, far behind the bays: a great lit ring on six spokes round
 * a hub, turning slowly (as it must, to make its gravity). One mesh, one draw call.
 */
function HabitatWheel() {
  const ref = useRef(null)
  const wheel = useProps((b) => {
    const r = WHEEL.radius
    b.add(GEO.ringThick, { position: [0, 0, 0], scale: [r, r, r], color: '#dfe4ea', style: STYLE.SMOOTH })
    // Lit windows round the rim, facing the station.
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2
      b.box(Math.cos(a) * r, Math.sin(a) * r, r * 0.07, 3.2, 1.2, 0.2, COLORS.window, STYLE.GLOW, [0, 0, a + Math.PI / 2])
    }
    // Spokes and the hub.
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2
      b.add(GEO.cylinderLow, { position: [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0], rotation: [0, 0, a - Math.PI / 2], scale: [1.3, r, 1.3], color: COLORS.wallDark, style: STYLE.SMOOTH })
    }
    b.add(GEO.sphere, { position: [0, 0, 0], scale: [8, 8, 7], color: COLORS.wall, style: STYLE.SMOOTH })
    b.add(GEO.cylinder, { position: [0, 0, 6.4], rotation: [Math.PI / 2, 0, 0], scale: [3.4, 1, 3.4], color: COLORS.trim, style: STYLE.GLOW })
  }, '')
  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.05
  })
  return (
    <group ref={ref} position={[WHEEL.x, WHEEL.y, WHEEL.z]}>
      {wheel && <primitive object={wheel} />}
    </group>
  )
}

export default Station
