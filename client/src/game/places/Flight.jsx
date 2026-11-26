import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BoxGeometry, Color, ConeGeometry, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from 'three'

import { destinationById, EARTH, STATION } from '@shared/balance'
import { JET_PILOT_SEAT } from '@shared/world'
import { mulberry32 } from '@shared/rng'

import { useQuality } from '../../store/quality'
import { STYLE } from '../materials'
import { runtime } from '../runtime'
import { lookOf } from '../sceneStyle'
import { skyUniforms } from '../skyState'
import { glowTexture, puffTexture } from '../textures'
import { useCraft } from './craft'
import { GEO, useProps } from './kit'
import { Planet, Sun } from './SkyBody'
import { surfaceMaterial, surfaceMaterials, tiledBoxOn, tiledPlane, useSurface } from './surfaces'
import { addPod, addRocketBooster, addRocketCore, addSpaceplane, BOOSTER_X } from './vehicles'

const _cam = new Vector3()
const _look = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _x = new Vector3(1, 0, 0)
const _earthTop = new Color(lookOf(EARTH).sky.top)
const _earthHorizon = new Color(lookOf(EARTH).sky.horizon)
const _spaceTop = new Color(lookOf(STATION).sky.top)
const _spaceHorizon = new Color(lookOf(STATION).sky.horizon)

const clamp01 = (t) => Math.min(1, Math.max(0, t))
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const progress = (trip) => clamp01((performance.now() - trip.startedAt) / trip.duration)

/** Bodies with air, and the colour it glows at their edge. */
const AIR = { earth: '#6fb7ff', mars: '#e8a070', venus: '#f0d890', titan: '#e8a050' }

/** Blends the sky between Earth's blue day (`blue` 1) and black space (0). */
function setSky(blue) {
  skyUniforms.topColor.value.lerpColors(_spaceTop, _earthTop, blue)
  skyUniforms.horizonColor.value.lerpColors(_spaceHorizon, _earthHorizon, blue)
  skyUniforms.stars.value = 1 - blue
  skyUniforms.nebula.value = 1 - blue
  skyUniforms.clouds.value = blue * 0.5
  skyUniforms.cumulus.value = blue
}

/** Places the camera at `pos` looking at `look`, shaken by `shake` metres. */
function aim(camera, pos, look, shake = 0, time = 0) {
  camera.position.copy(pos)
  if (shake) camera.position.add(_a.set(Math.sin(time * 61) * shake, Math.sin(time * 47) * shake, Math.sin(time * 53) * shake))
  camera.lookAt(look)
  camera.updateMatrixWorld()
}

const _fwd = new Vector3()
/**
 * A direction ahead of the camera (towards `look` from `cam`, flattened) and `down` below
 * it: where to hang a planet so its limb shows in the lower part of the view.
 */
function belowAhead(look, cam, down) {
  _fwd.subVectors(look, cam).setY(0)
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1)
  _fwd.normalize()
  return _fwd.set(_fwd.x, -down, _fwd.z)
}

/**
 * A planet far off, as big on screen as a body `angularRadius` (radians) across would be:
 * drawn at a fixed distance inside the far plane (every preset) and scaled to match.
 */
function placeFar(group, camera, dir, angularRadius, distance) {
  _b.copy(dir).normalize()
  group.position.copy(camera.position).addScaledVector(_b, distance)
  group.scale.setScalar(distance * Math.sin(Math.min(1.45, angularRadius)))
}

/**
 * The trip in between places, played instead of any place while a trip is under way
 * (`trip` from the store: `{ from, to, via, duration, startedAt }`). It owns the camera
 * until it unmounts. Its own chunk, with the other away scenes.
 */
export function Flight({ trip }) {
  useEffect(() => {
    runtime.camera.mode = 'flight'
    return () => {
      runtime.camera.mode = 'follow'
      runtime.camera.snap = true
    }
  }, [])
  if (trip.via === 'rocket') return <RocketAscent trip={trip} />
  if (trip.via === 'pod') return <PodDescent trip={trip} />
  return <Cruise trip={trip} />
}

// --- Shared pieces --------------------------------------------------------------------------

/** A flickering flame: an additive cone (pointing down its local -Y), a white-hot core and a glow at its root. */
function Flame({ radius = 0.8, length = 4, color = '#ffb347', position = [0, 0, 0], rotation = [0, 0, 0], glow = 3, flameRef }) {
  const map = useMemo(() => glowTexture(), [])
  return (
    <group ref={flameRef} position={position} rotation={rotation}>
      <mesh position={[0, -length / 2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[radius, length, 14, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, -length * 0.28, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[radius * 0.45, length * 0.55, 10, 1, true]} />
        <meshBasicMaterial color="#fff6dc" transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite scale={radius * glow}>
        <spriteMaterial map={map} color={color} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

/**
 * Streaks rushing past (presets with speed lines only): along Z, or along Y (`dir` -1
 * pouring down past a climb, 1 streaming up past a fall). One draw call.
 */
function SpeedLines({ axis = 'z', dir = -1, speed = 60, length = 4, color = '#cfe8ff', count = 48 }) {
  const enabled = useQuality((s) => s.settings.speedLines)
  const ref = useRef(null)
  const mesh = useMemo(() => {
    if (!enabled) return null
    const m = new InstancedMesh(new BoxGeometry(0.05, 0.05, 1), new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }), count)
    m.frustumCulled = false
    const rand = mulberry32(42)
    m.userData.seeds = Array.from({ length: count }, () => ({ a: rand() * Math.PI * 2, r: 3 + rand() * 10, o: rand() }))
    return m
  }, [enabled, color, count])
  useEffect(
    () => () => {
      if (!mesh) return
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh],
  )
  useFrame((state) => {
    const m = ref.current
    if (!m) return
    const time = state.clock.elapsedTime
    m.userData.seeds.forEach((sd, i) => {
      const run = ((sd.o * 120 + time * speed) % 120) - 60
      if (axis === 'y') {
        _p.set(Math.cos(sd.a) * sd.r, dir * run, Math.sin(sd.a) * sd.r)
        _q.setFromAxisAngle(_x, Math.PI / 2)
      } else {
        _p.set(Math.cos(sd.a) * sd.r, Math.sin(sd.a) * sd.r, -run)
        _q.identity()
      }
      m.setMatrixAt(i, _m.compose(_p, _q, _s.set(1, 1, length)))
    })
    m.instanceMatrix.needsUpdate = true
  })
  return mesh ? <primitive ref={ref} object={mesh} /> : null
}

/** Halo Station seen from outside: its deck, bay wall, the habitat wheel and solar wings. */
function MiniStation({ stationRef }) {
  const station = useProps((b) => {
    const white = '#e3e8ee'
    const steel = '#aab3bf'
    // The hub along the approach, its glowing docking ring facing you.
    b.add(GEO.cylinder, { position: [0, 0, 0], rotation: [Math.PI / 2, 0, 0], scale: [3.4, 16, 3.4], color: white, style: STYLE.SMOOTH })
    b.add(GEO.cylinder, { position: [0, 0, -3], rotation: [Math.PI / 2, 0, 0], scale: [4.4, 4, 4.4], color: '#cfd5dd', style: STYLE.SMOOTH })
    b.add(GEO.ringThick, { position: [0, 0, -8.1], scale: 2.6, color: '#7fd4ff', style: STYLE.GLOW })
    b.add(GEO.sphere, { position: [0, 0, 8], scale: [3.6, 3.6, 3], color: white, style: STYLE.SMOOTH })
    // The habitat wheel, its windows lit, on four spokes.
    const r = 17
    b.add(GEO.ringThick, { position: [0, 0, 3], scale: [r, r, r * 2], color: '#dfe4ea', style: STYLE.SMOOTH })
    for (let i = 0; i < 28; i += 1) {
      const a = (i / 28) * Math.PI * 2
      b.box(Math.cos(a) * r, Math.sin(a) * r, 1.6, 1.8, 0.7, 0.2, '#ffe7a0', STYLE.GLOW, [0, 0, a + Math.PI / 2])
    }
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      b.add(GEO.cylinderLow, { position: [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 3], rotation: [0, 0, a - Math.PI / 2], scale: [0.5, r, 0.5], color: steel, style: STYLE.SMOOTH })
    }
    // The truss across the back, solar wings and radiators on it.
    b.box(0, 0, 6, 64, 0.8, 0.8, steel, STYLE.SMOOTH)
    for (const side of [-1, 1]) {
      for (const x of [22, 32]) b.box(side * x, 0, 6, 8, 0.12, 13, '#1d3a8a', STYLE.GALAXY)
      b.box(side * 13, 2.6, 6, 1.6, 5, 0.12, '#f4f6fa', STYLE.SMOOTH)
      b.add(GEO.sphere, { position: [side * 32, 0, 13], scale: 0.35, color: side < 0 ? '#ff3b3b' : '#3bff6a', style: STYLE.GLOW })
    }
  }, '')
  return station ? <primitive ref={stationRef} object={station} visible={false} /> : null
}

// --- The rocket ascent ----------------------------------------------------------------------

/** Altitude (scene metres) at progress `p` through the launch. */
const altitudeAt = (p) => (p < 0.1 ? 0 : 2600 * ((p - 0.1) / 0.9) ** 2.4)

/** The lawn material without its vertex colours (the flight's plain ground has none). */
let plainGrass = null
function plainGrassMaterial() {
  if (!plainGrass) {
    plainGrass = surfaceMaterial('grass', { bumpScale: 2 })
  }
  return plainGrass
}

/** The pad you leave: a field of grass, the concrete apron and deck, the gantry. */
function LaunchSite({ siteRef }) {
  const grass = useSurface((add) => add(tiledPlane(900, 900, 6)), plainGrassMaterial())
  const concrete = useSurface((add) => {
    add(tiledPlane(60, 60, 12, { y: 0.02 }))
    add(tiledBoxOn(22, 1.4, 22, 4, { x: 0, z: 0 }))
  }, surfaceMaterials().concrete)
  const gantry = useProps((b) => {
    for (const [dx, dz] of [
      [-1.8, -1.8],
      [1.8, -1.8],
      [-1.8, 1.8],
      [1.8, 1.8],
    ])
      b.box(7.6 + dx, 15.4, dz, 0.4, 28, 0.4, '#d8552c', STYLE.SMOOTH)
    for (let y = 4.4; y < 29; y += 3) {
      b.box(7.6, y, -1.8, 4, 0.3, 0.3, '#d8552c', STYLE.SMOOTH)
      b.box(7.6, y, 1.8, 4, 0.3, 0.3, '#d8552c', STYLE.SMOOTH)
    }
  }, '')
  return (
    <group ref={siteRef}>
      {grass && <primitive object={grass} />}
      {concrete && <primitive object={concrete} />}
      {gantry && <primitive object={gantry} />}
    </group>
  )
}

/** Billowing exhaust smoke round the pad at lift-off: a ring of soft grey puffs, growing. */
function PadSmoke({ smokeRef }) {
  const map = useMemo(() => puffTexture(), [])
  const puffs = useMemo(() => {
    const rand = mulberry32(7)
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + rand() * 0.4
      return { a, r: 3 + rand() * 3, s: 4 + rand() * 4, y: 2 + rand() * 3 }
    })
  }, [])
  return (
    <group ref={smokeRef}>
      {puffs.map((p) => (
        <sprite key={p.a} position={[Math.cos(p.a) * p.r, p.y, Math.sin(p.a) * p.r]} scale={p.s} userData={p}>
          <spriteMaterial alphaMap={map} color="#e2e2e2" transparent opacity={0.85} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

/** A deck of cloud the rocket climbs through: soft sheets at slightly different heights. One draw call. */
function CloudDeck({ deckRef }) {
  const level = useQuality((s) => s.level)
  const count = level === 'LOW' ? 16 : 30
  const mesh = useMemo(() => {
    const m = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#ffffff', alphaMap: puffTexture(), transparent: true, opacity: 0.78, depthWrite: false, side: DoubleSide, fog: false }), count)
    const rand = mulberry32(11)
    const flat = new Quaternion().setFromAxisAngle(_x, -Math.PI / 2)
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2
      const r = 10 + rand() * 140
      _p.set(Math.cos(a) * r, 95 + rand() * 18, Math.sin(a) * r)
      const s = 40 + rand() * 50
      m.setMatrixAt(i, _m.compose(_p, flat, _s.set(s, s * (0.6 + rand() * 0.4), 1)))
    }
    m.instanceMatrix.needsUpdate = true
    m.frustumCulled = false
    return m
  }, [count])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh.dispose()
    },
    [mesh],
  )
  return <primitive ref={deckRef} object={mesh} />
}

/**
 * Earth -> Halo Station: ignition on the pad in a billow of smoke, the climb (the camera
 * watching from the ground, then chasing), through a deck of cloud as the sky turns black
 * and the stars come out, the boosters parting and tumbling away, the curve of the Earth
 * below - and the station coming down to meet the nose.
 */
function RocketAscent({ trip }) {
  const camera = useThree((s) => s.camera)
  const far = useQuality((s) => s.settings.viewDistance)
  const SCALE = 0.5
  const core = useCraft((c) => addRocketCore(c, SCALE), '')
  const boosterL = useCraft((c) => addRocketBooster(c, -1, SCALE), 'l')
  const boosterR = useCraft((c) => addRocketBooster(c, 1, SCALE), 'r')
  const siteRef = useRef(null)
  const smokeRef = useRef(null)
  const deckRef = useRef(null)
  const earthRef = useRef(null)
  const stationRef = useRef(null)
  const coreFlame = useRef(null)
  const leftRef = useRef(null)
  const rightRef = useRef(null)
  const trailRef = useRef(null)

  useFrame((state) => {
    const p = progress(trip)
    const time = state.clock.elapsedTime
    const alt = altitudeAt(p)
    setSky(1 - smooth(60, 700, alt))

    // The ground, its smoke and the cloud deck fall away beneath the rocket.
    if (siteRef.current) {
      siteRef.current.position.y = -alt
      siteRef.current.visible = alt < 600
    }
    if (smokeRef.current) {
      smokeRef.current.position.y = -alt
      const grow = smooth(0, 0.3, p)
      for (const s of smokeRef.current.children) {
        const d = s.userData
        s.position.set(Math.cos(d.a) * (d.r + grow * 14), d.y + grow * 3, Math.sin(d.a) * (d.r + grow * 14))
        s.scale.setScalar(d.s * (0.3 + grow * 1.6))
        s.material.opacity = 0.85 * smooth(0, 0.04, p) * (1 - smooth(0.3, 0.45, p))
      }
    }
    if (deckRef.current) {
      deckRef.current.position.y = -alt
      deckRef.current.visible = alt > 20 && alt < 400
    }

    // Engines: all three burning, then the boosters part and tumble away.
    const sep = smooth(0.42, 0.62, p)
    const flicker = 1 + Math.sin(time * 47) * 0.1
    if (coreFlame.current) {
      coreFlame.current.visible = p > 0.02
      coreFlame.current.scale.set(1, flicker * (0.4 + smooth(0.02, 0.15, p) * (1 + sep * 0.6)), 1)
    }
    for (const [ref, side] of [
      [leftRef, -1],
      [rightRef, 1],
    ]) {
      const g = ref.current
      if (!g) continue
      g.position.set(side * sep * 14, -sep * sep * 40, sep * 3)
      g.rotation.set(sep * 0.4, 0, side * sep * 1.4)
      g.visible = sep < 0.98
      const flame = g.children[1]
      if (flame) {
        flame.visible = p > 0.02 && sep < 0.05
        flame.scale.set(1, flicker * smooth(0.02, 0.15, p), 1)
      }
    }
    if (trailRef.current) {
      // A long glowing exhaust trail behind the climb, fading out above the air.
      const len = smooth(0.1, 0.35, p) * 60 * (1 - smooth(500, 1200, alt))
      trailRef.current.visible = len > 0.5
      trailRef.current.scale.set(1, Math.max(0.01, len), 1)
      trailRef.current.position.y = -4 - len / 2
    }

    // Halo Station sliding down to meet the nose.
    if (stationRef.current) {
      stationRef.current.visible = p > 0.62
      stationRef.current.position.set(0, 190 - 168 * smooth(0.62, 1, p), -10)
      // Docking ring facing down at the climbing rocket, the wheel turning overhead.
      stationRef.current.rotation.set(-Math.PI / 2, 0, state.clock.elapsedTime * 0.04)
    }

    // The camera: by the pad at ignition, watching the climb from the ground, then
    // chasing from below, round to the side over the curve of the Earth, and finally up
    // past the nose to the station.
    const shake = p < 0.3 ? 0.18 * (1 - smooth(0.12, 0.3, p)) : 0
    if (p < 0.3) {
      const ground = -alt + 3
      const chase = smooth(0.22, 0.3, p)
      _cam.set(9 - chase * 3, ground + (-9 - ground) * chase, 15 - chase * 3)
      _look.set(0, 7 + chase * 3, 0)
    } else if (p < 0.62) {
      const k = smooth(0.3, 0.6, p)
      _cam.set(6 + k * 10, -9 + k * 13, 12 - k * 2)
      _look.set(0, 10 - k * 6, 0)
    } else {
      const k = smooth(0.62, 0.95, p)
      _cam.set(16 - k * 6, 4 - k * 8, 10 + k * 4)
      _look.set(0, 4 + k * 12, -k * 4)
    }
    aim(camera, _cam, _look, shake, time)

    // Earth below, once the field has fallen away: curving more the higher you climb, and
    // always placed ahead of and below the camera so its glowing limb is in view.
    if (earthRef.current) {
      earthRef.current.visible = alt > 90
      placeFar(earthRef.current, camera, belowAhead(_look, _cam, 0.75), Math.asin(6000 / (6000 + alt * 1.2)), far * 0.7)
      earthRef.current.rotation.set(0.6, time * 0.01 + 1.8, 0)
    }
  })

  return (
    <group>
      <primitive object={core} />
      <Flame flameRef={coreFlame} radius={0.9} length={7} glow={6} />
      <group ref={leftRef}>
        <primitive object={boosterL} />
        <Flame radius={0.45} length={4.5} position={[-BOOSTER_X * SCALE, 0, 0]} glow={4} />
      </group>
      <group ref={rightRef}>
        <primitive object={boosterR} />
        <Flame radius={0.45} length={4.5} position={[BOOSTER_X * SCALE, 0, 0]} glow={4} />
      </group>
      <mesh ref={trailRef} position={[0, -6, 0]} visible={false}>
        <cylinderGeometry args={[1.6, 0.6, 1, 12, 1, true]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0.28} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      <LaunchSite siteRef={siteRef} />
      <PadSmoke smokeRef={smokeRef} />
      <CloudDeck deckRef={deckRef} />
      <group ref={earthRef} visible={false}>
        <Planet body="earth" halo={AIR.earth} />
      </group>
      <MiniStation stationRef={stationRef} />
      <Sun size={0.03} />
      <SpeedLines axis="y" dir={-1} speed={70} length={5} />
    </group>
  )
}

// --- Spaceplane cruise and warps ----------------------------------------------------------------

/**
 * The spaceplane between the station and a destination (or a Star Map warp): engines
 * glowing, the place you're heading for growing ahead with its glow of air, where you
 * left falling behind, the Sun's glare - or the station coming to meet you.
 */
function Cruise({ trip }) {
  const camera = useThree((s) => s.camera)
  const far = useQuality((s) => s.settings.viewDistance)
  const { to, from, via } = trip
  const warp = via === 'warp'
  const plane = useCraft((c) => addSpaceplane(c, { scale: 1, open: true }), '')
  const target = to === STATION ? null : to === EARTH ? 'earth' : destinationById(to) ? to : null
  const source = from === STATION || warp ? null : from === EARTH ? 'earth' : from
  // Trips to or from the station have Earth below - huge, filling the bottom of the view.
  const home = !warp && (to === STATION || from === STATION) ? (to === STATION ? 'arrive' : 'leave') : null
  const homeRef = useRef(null)
  const planeRef = useRef(null)
  const targetRef = useRef(null)
  const sourceRef = useRef(null)
  const stationRef = useRef(null)
  const flamesRef = useRef(null)
  const seatRef = useRef(null)

  // You ride in the cockpit: your character sits on this seat for the whole trip.
  useEffect(() => {
    runtime.flightSeat = seatRef.current
    return () => {
      runtime.flightSeat = null
    }
  }, [])

  useFrame((state) => {
    const t = progress(trip)
    const time = state.clock.elapsedTime
    setSky(0)
    const g = planeRef.current
    if (g) {
      g.position.set(Math.sin(time * 1.3) * 0.25, Math.sin(time * 1.9) * 0.18, 0)
      g.rotation.set(Math.sin(time * 0.9) * 0.03, 0, Math.sin(time * 1.1) * 0.12)
    }
    if (flamesRef.current) flamesRef.current.scale.set(1, 1, 1 + Math.sin(time * 40) * 0.12)

    // Where you're going grows ahead; where you left falls behind.
    const k = smooth(0, 1, t)
    if (targetRef.current) {
      placeFar(targetRef.current, camera, _a.set(0.25, -0.12, 1), 0.05 + k * (warp ? 0.5 : 0.62), far * 0.72)
      targetRef.current.rotation.y = time * 0.03
    }
    if (sourceRef.current) placeFar(sourceRef.current, camera, _a.set(-0.3, -0.25, -1), 0.5 - k * 0.42, far * 0.72)
    if (homeRef.current) {
      const leaving = home === 'leave'
      placeFar(homeRef.current, camera, _a.set(0.15, -0.8, leaving ? -0.3 - k * 0.6 : 1), leaving ? 0.7 - k * 0.35 : 0.68, far * 0.72)
      homeRef.current.rotation.y = 0.6 + time * 0.01
    }
    // The station grows ahead (always inside the far plane, so never cut off).
    if (stationRef.current) {
      const s = stationRef.current
      s.visible = to === STATION && t > 0.2
      s.position.set(7, -3, far * 0.8 - (far * 0.8 - 48) * smooth(0.2, 1, t))
      s.rotation.set(0.12, -0.25, time * 0.04)
    }

    // A slow orbit round the plane, from behind and above.
    const a = 2.6 + t * 0.9 + Math.sin(time * 0.3) * 0.05
    _cam.set(Math.sin(a) * 13, 3.6 + Math.sin(time * 0.5) * 0.4, Math.cos(a) * 13)
    _look.set(0, 0, 6)
    aim(camera, _cam, _look)
  })

  return (
    <group>
      <group ref={planeRef}>
        <primitive object={plane} />
        {/* The pilot's seat cushion (shared/world.js JET_SEATS), facing the nose. */}
        <object3D ref={seatRef} position={JET_PILOT_SEAT} />
        <group ref={flamesRef}>
          {[-0.78, 0.78].map((x) => (
            <Flame key={x} radius={0.3} length={warp ? 7 : 3.2} color={warp ? '#9fd8ff' : '#ffb347'} position={[x, -0.2, -4.1]} rotation={[-Math.PI / 2, 0, 0]} glow={5} />
          ))}
        </group>
      </group>
      {target && (
        <group ref={targetRef}>
          <Planet body={target} ring={target === 'titan'} halo={AIR[target]} />
        </group>
      )}
      {source && (
        <group ref={sourceRef}>
          <Planet body={source} halo={AIR[source]} />
        </group>
      )}
      {home && (
        <group ref={homeRef}>
          <Planet body="earth" halo={AIR.earth} />
        </group>
      )}
      <MiniStation stationRef={stationRef} />
      <Sun size={0.03} />
      <SpeedLines axis="z" speed={warp ? 170 : 60} length={warp ? 16 : 4} color={warp ? '#9fd8ff' : '#cfe8ff'} />
    </group>
  )
}

// --- The pod's descent ---------------------------------------------------------------------------

const FLAME_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
/**
 * Re-entry fire on an open cone: hottest at its wide base (the heat shield), licking up
 * into tongues that stream away - two layers of scrolling noise cut against a fade along
 * the cone. Additive: it only ever brightens.
 */
const FLAME_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uHeat;
uniform float uSpeed;
uniform vec3 uHot;
uniform vec3 uEdge;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float along = vUv.y;
  float around = vUv.x * 10.0;
  float n = noise(vec2(around, along * 4.0 - uTime * uSpeed)) * 0.65 + noise(vec2(around * 2.3, along * 9.0 - uTime * uSpeed * 1.7)) * 0.35;
  float base = pow(1.0 - along, 1.6);
  float flame = smoothstep(0.2, 0.75, base * 1.25 + (n - 0.5) * 0.85);
  vec3 color = mix(uEdge, uHot, clamp(base * 1.4 + n * 0.25, 0.0, 1.0));
  gl_FragColor = vec4(color * flame * uHeat, 1.0);
}
`

/** One layer of re-entry fire: an open cone `radius` wide at its base, `height` tall. */
function flameMaterial(hot, edge, speed) {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0 }, uSpeed: { value: speed }, uHot: { value: new Color(hot) }, uEdge: { value: new Color(edge) } },
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    // Only the cone's far side: the fire shows round and behind the capsule, which
    // stays in plain view in front of it.
    side: BackSide,
    toneMapped: false,
  })
}

/** The fire's layers: inner white-yellow, middle orange, outer red and longest. */
const FLAME_LAYERS = [
  { radius: 2.35, height: 6.5, hot: '#fff6d0', edge: '#ffb347', speed: 5.5 },
  { radius: 2.75, height: 9.5, hot: '#ffcf6a', edge: '#ff6a1a', speed: 4.2 },
  { radius: 3.2, height: 14, hot: '#ff8a2a', edge: '#b3200a', speed: 3.2 },
]

/**
 * Re-entry: the air ahead of the heat shield squeezed white-hot, and the fire it makes
 * wrapping the capsule and streaming away above it in layers of flickering tongues.
 * `heatRef.current` (0-1) sets how fierce. Meshes and one shader, no particles: it
 * shows on every preset.
 */
function ReentryFire({ heatRef }) {
  const layers = useMemo(
    () =>
      FLAME_LAYERS.map((l) => ({
        ...l,
        geometry: new ConeGeometry(l.radius, l.height, 32, 8, true),
        material: flameMaterial(l.hot, l.edge, l.speed),
      })),
    [],
  )
  const shockMaterial = useMemo(() => new MeshBasicMaterial({ color: '#ffe2b0', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  const groupRef = useRef(null)
  const shockRef = useRef(null)
  /** The flame meshes, by layer (their materials' uniforms are set each frame). */
  const flameRefs = useRef([])
  useEffect(
    () => () => {
      for (const l of layers) {
        l.geometry.dispose()
        l.material.dispose()
      }
      shockMaterial.dispose()
    },
    [layers, shockMaterial],
  )
  useFrame((state) => {
    const heat = heatRef.current
    const time = state.clock.elapsedTime
    if (groupRef.current) groupRef.current.visible = heat > 0.02
    for (const mesh of flameRefs.current) {
      if (!mesh) continue
      mesh.material.uniforms.uTime.value = time
      mesh.material.uniforms.uHeat.value = heat
    }
    if (shockRef.current) {
      shockRef.current.material.opacity = heat * (0.5 + Math.sin(time * 40) * 0.06)
      shockRef.current.scale.set(2.2 + heat * 0.3, 0.35 + heat * 0.15, 2.2 + heat * 0.3)
    }
    // The flames breathe: a quick flicker in width, a slow sway.
    if (groupRef.current) {
      groupRef.current.scale.set(1 + Math.sin(time * 23) * 0.03, 0.85 + heat * 0.25, 1 + Math.cos(time * 19) * 0.03)
      groupRef.current.rotation.set(Math.sin(time * 1.3) * 0.04, time * 0.6, Math.cos(time * 1.1) * 0.04)
    }
  })
  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={shockRef} position={[0, -0.62, 0]} material={shockMaterial}>
        <sphereGeometry args={[1, 24, 12]} />
      </mesh>
      {layers.map((l, i) => (
        <mesh
          key={l.radius}
          ref={(el) => {
            flameRefs.current[i] = el
          }}
          geometry={l.geometry}
          material={l.material}
          position={[0, -0.5 + l.height / 2, 0]}
        />
      ))}
    </group>
  )
}

/** Halo Station -> Earth: the pod falling towards the planet, wrapped in re-entry plasma, the sky turning blue at the end. */
function PodDescent({ trip }) {
  const camera = useThree((s) => s.camera)
  const far = useQuality((s) => s.settings.viewDistance)
  const pod = useCraft((c) => addPod(c, 1.2), '')
  const podRef = useRef(null)
  const plasmaRef = useRef(null)
  const earthRef = useRef(null)
  const heatRef = useRef(0)
  const glow = useMemo(() => glowTexture(), [])

  useFrame((state) => {
    const t = progress(trip)
    const time = state.clock.elapsedTime
    setSky(smooth(0.72, 1, t))
    // Re-entry heat: the fire and a plasma glow round the shield, fiercest mid-fall.
    const heat = Math.sin(clamp01((t - 0.15) / 0.65) * Math.PI)
    heatRef.current = heat
    // The capsule wobbles, and buffets hard in the fire.
    const buffet = 0.05 + heat * 0.06
    if (podRef.current) podRef.current.rotation.set(Math.sin(time * 3) * buffet + Math.sin(time * 31) * heat * 0.015, time * 0.4, Math.sin(time * 2.3) * buffet + Math.cos(time * 27) * heat * 0.015)
    if (plasmaRef.current) {
      plasmaRef.current.visible = heat > 0.02
      plasmaRef.current.scale.setScalar(6 + heat * 4 + Math.sin(time * 30) * 0.3)
      plasmaRef.current.material.opacity = heat * 0.9
    }
    _cam.set(7, 5 + Math.sin(time * 0.7) * 0.4, 9)
    _look.set(0, -1, 0)
    aim(camera, _cam, _look, 0.1 * heat, time)
    if (earthRef.current) {
      const h = 9000 * (1 - smooth(0, 1, t)) + 300
      earthRef.current.visible = t < 0.85
      placeFar(earthRef.current, camera, belowAhead(_look, _cam, 1.3), Math.asin(6000 / (6000 + h)), far * 0.7)
      earthRef.current.rotation.set(0.5, time * 0.02 + 0.6, 0)
    }
  })

  return (
    <group>
      <group ref={podRef}>
        <primitive object={pod} />
      </group>
      <ReentryFire heatRef={heatRef} />
      <sprite ref={plasmaRef} position={[0, -0.6, 0]} visible={false}>
        <spriteMaterial map={glow} color="#ff7a2e" transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <group ref={earthRef}>
        <Planet body="earth" halo={AIR.earth} />
      </group>
      <Sun size={0.03} />
      <SpeedLines axis="y" dir={1} speed={60} length={5} color="#ffd0a0" />
    </group>
  )
}

export default Flight
