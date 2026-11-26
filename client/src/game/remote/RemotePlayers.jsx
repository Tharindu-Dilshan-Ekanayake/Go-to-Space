import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { suitById } from '@shared/balance'

import { remotePlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { hideNameplatesFrom, NAMEPLATE_POOL_SIZE, placeNameplate } from './nameplates'

/** Remote players are drawn this far in the past, so 10 Hz updates interpolate. */
const INTERP_DELAY_MS = 110
/** Everyone else a full 16-player room can hold. */
const MAX_REMOTES = 15
/** Six blocks of body, the suit's pack and a package crate. */
const PARTS = 8
const S = 0.36

/** Classic blocky figure, in studs-scaled units: [x, y(pivot), size, hangs from pivot]. */
const PART_LAYOUT = [
  { key: 'head', pos: [0, 1.62, 0], size: [1.2 * S, 1 * S, 1 * S] },
  { key: 'torso', pos: [0, 1.08, 0], size: [2 * S, 2 * S, 1 * S] },
  { key: 'armL', pos: [-1.5 * S, 1.44, 0], size: [1 * S, 2 * S, 1 * S], swing: -1 },
  { key: 'armR', pos: [1.5 * S, 1.44, 0], size: [1 * S, 2 * S, 1 * S], swing: 1 },
  { key: 'legL', pos: [-0.5 * S, 0.72, 0], size: [1 * S, 2 * S, 1 * S], swing: 1 },
  { key: 'legR', pos: [0.5 * S, 0.72, 0], size: [1 * S, 2 * S, 1 * S], swing: -1 },
]

// Parsed once: setColorAt runs for every limb of every player, every frame.
const palette = (list) => list.map((c) => new Color(c))
const SKINS = palette(['#f5cd47', '#e8b48a', '#c98a5a', '#8a5a3a', '#ffd9b3'])

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const _m = new Matrix4()
const _base = new Matrix4()
const _local = new Matrix4()
const _rot = new Matrix4()
const _scale = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _v = new Vector3()
const _up = new Vector3(0, 1, 0)
const _prev = new Vector3()
/** The oxygen pack on a figure's back, and a crate strapped above it. */
const PACK = new Matrix4().compose(new Vector3(0, 1.1, -0.3), new Quaternion(), new Vector3(0.5, 0.6, 0.26))
const CRATE = new Matrix4().compose(new Vector3(0, 1.62, -0.32), new Quaternion(), new Vector3(0.46, 0.38, 0.4))
const CRATE_COLOR = new Color('#c8925a')
/** Suit colours, parsed once: `[main, accent]` by suit id. */
const suitColors = new Map()
function colorsOf(suitId) {
  let colors = suitColors.get(suitId)
  if (!colors) {
    const { main, accent } = suitById(suitId).colors
    colors = [new Color(main), new Color(accent)]
    suitColors.set(suitId, colors)
  }
  return colors
}
const _hidden = new Matrix4().makeScale(0, 0, 0)

function lerpAngle(a, b, t) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Interpolates a remote player to `renderTime`. */
function interpolate(r, renderTime) {
  const snaps = r.snaps
  if (snaps.length === 0) return
  let i = snaps.length - 1
  while (i > 0 && snaps[i - 1].t > renderTime) i -= 1
  const b = snaps[i]
  const a = snaps[Math.max(0, i - 1)]
  const span = b.t - a.t
  const t = span > 0 ? Math.min(1, Math.max(0, (renderTime - a.t) / span)) : 1
  _prev.copy(r.position)
  r.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)
  r.yaw = lerpAngle(a.r, b.r, t)
  // Drop snapshots we've moved past, keeping one to interpolate from.
  while (snaps.length > 2 && snaps[1].t < renderTime) snaps.shift()
}

/**
 * Writes one blocky figure's parts from `base` (its feet), limbs swung by `swing` (and
 * arms by `armSwing`, if given, stretched `armStretch` times their length): the body in
 * their suit's colours, its pack, and a crate if they carry a package. Returns the next
 * free instance.
 */
function writeFigure(body, instance, r, base, swing, armSwing, armStretch = 1, legAngle = null) {
  const h = hashString(r.sessionId)
  const [shirt, accent] = colorsOf(r.suit)
  const pants = accent
  const skin = SKINS[(h >>> 16) % SKINS.length]
  for (const part of PART_LAYOUT) {
    const hangs = part.swing !== undefined
    const isArm = part.key.startsWith('arm')
    const isLeg = part.key.startsWith('leg')
    const angle = !hangs ? 0 : isArm && armSwing !== null ? armSwing : isLeg && legAngle !== null ? legAngle : swing * part.swing
    const long = isArm ? armStretch : 1
    _local.makeTranslation(part.pos[0], part.pos[1], part.pos[2])
    _rot.makeRotationX(angle)
    _scale.makeScale(part.size[0], part.size[1] * long, part.size[2])
    // Limbs hang from their pivot; head and torso are centred on theirs.
    if (hangs) _scale.setPosition(0, (-part.size[1] * long) / 2, 0)
    _m.copy(base).multiply(_local).multiply(_rot).multiply(_scale)
    body.setMatrixAt(instance, _m)
    // Classic look: shirt on the torso, trousers on the legs, bare arms and head.
    body.setColorAt(instance, part.key === 'torso' ? shirt : part.key.startsWith('leg') ? pants : skin)
    instance += 1
  }
  body.setMatrixAt(instance, _m.copy(base).multiply(PACK))
  body.setColorAt(instance, shirt)
  instance += 1
  body.setMatrixAt(instance, r.carrying ? _m.copy(base).multiply(CRATE) : _hidden)
  body.setColorAt(instance, CRATE_COLOR)
  return instance + 1
}

/** Puts a name tag over `at`, if it's on screen; returns the next free tag. */
function writeNameplate(plate, name, at, distance, maxDistance, camera, size, uid) {
  if (plate >= NAMEPLATE_POOL_SIZE) return plate
  if (distance < maxDistance) {
    _v.copy(at).project(camera)
    if (_v.z < 1) {
      const fade = Math.min(1, (maxDistance - distance) / 6)
      placeNameplate(plate, name, (_v.x * 0.5 + 0.5) * size.width, (-_v.y * 0.5 + 0.5) * size.height, fade, uid)
      return plate + 1
    }
  }
  placeNameplate(plate, '', null)
  return plate + 1
}

/**
 * Everyone else in the same place: blocky figures in their suits (one InstancedMesh for
 * every part of every player) for anyone not drawn as their real avatar (RemoteAvatars),
 * and everyone's name tag. Hidden past the preset's draw distance.
 */
export function RemotePlayers() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const bodyRef = useRef(null)

  const assets = useMemo(() => {
    // Smooth toy boxes: the shared toy material, so no extra shader program.
    const body = createBoxInstances(MAX_REMOTES * PARTS, sharedMaterials().toy, STYLE.SMOOTH)
    body.castShadow = true
    return { body }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.body)
      hideNameplatesFrom(0)
    },
    [assets],
  )

  useFrame((state, rawDelta) => {
    const body = bodyRef.current
    if (!body) return
    const delta = Math.min(rawDelta, 0.05)
    const settings = getQuality()
    const now = performance.now()
    const renderTime = now - INTERP_DELAY_MS
    const t = state.clock.elapsedTime

    let instance = 0
    let plate = 0

    for (const r of remotePlayers.values()) {
      interpolate(r, renderTime)
      const moved = _prev.distanceTo(r.position)
      r.speed = r.speed * 0.8 + (moved / Math.max(delta, 1e-3)) * 0.2
      r.shadow.position.copy(r.position)

      const distance = camera.position.distanceTo(r.position)
      const visible = distance < settings.remoteDrawDistance
      r.shadow.visible = visible

      // Players drawn as their real avatar (RemoteAvatars) skip the blocky figure.
      if (visible && !r.fullAvatar && instance + PARTS <= MAX_REMOTES * PARTS) {
        const walking = r.speed > 0.6 && r.anim === 'walk'
        if (walking) r.walkPhase += delta * (6 + Math.min(r.speed, 10) * 0.5)
        const swing = walking ? Math.sin(r.walkPhase) * 0.9 : 0
        const airborne = r.anim === 'jump' || r.anim === 'fly'
        _q.setFromAxisAngle(_up, r.yaw)
        _base.compose(r.position, _q, _s.set(1, 1, 1))
        // Arms out for balance in the air; swinging against the legs walking.
        const arms = airborne ? -0.6 + Math.sin(t * 3) * 0.1 : walking ? null : 0.1
        if (r.anim === 'sit') {
          // In a jet's seat: thighs forward, hands on the controls, hips on the cushion
          // (the figure's hips are lower than a full avatar's, so it sits up a little).
          _base.compose(_v.copy(r.position).setY(r.position.y + 0.2), _q, _s.set(1, 1, 1))
          instance = writeFigure(body, instance, r, _base, 0, -0.9, 1, -1.5)
        } else {
          instance = writeFigure(body, instance, r, _base, airborne ? 0.35 : swing, arms)
        }
      }

      // Name tag, just above the helmet.
      if (visible) {
        _v.set(r.position.x, r.position.y + 2.15, r.position.z)
        plate = writeNameplate(plate, r.name, _v, distance, settings.remoteNameDistance, camera, size, r.uid)
      }
    }
    hideNameplatesFrom(plate)
    body.count = instance
    body.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
  })

  return (
    <>
      <primitive ref={bodyRef} object={assets.body} />
    </>
  )
}

export default RemotePlayers
