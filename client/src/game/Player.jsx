import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'

import { gravityOf, suitById } from '@shared/balance'
import { clampToWalkable, groundHeightAt, jetPad, jetSeats, jetsOf, layoutOf, MAX_HEIGHT } from '@shared/world'

import { remotePlayers } from '../net/remotePlayers'
import { sfx } from '../audio/sfx'
import { getGame } from '../store/game'
import ErrorBoundary from '../ui/ErrorBoundary'
import FallbackAvatar from './FallbackAvatar'
import PlayerAvatar from './PlayerAvatar'
import { SIT_HIP } from './playerPose'
import { runtime } from './runtime'
import { yourGear } from './suitGear'
import useKeyboard from './useKeyboard'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45

const WALK_SPEED = 10
const ACCELERATION = 16
/** Earth's gravity, in game units; other places scale it (balance gravity). */
const GRAVITY = 32
const JUMP_SPEED = 10.5
/** Low gravity lets jumps go very high; this keeps them fun rather than endless. */
const MIN_GRAVITY = 0.22
/** Jetpack: upward push while jump is held in the air, and the top speed it reaches. */
const JET_THRUST = 22
const JET_MAX_UP = 7
/** How long one burn lasts before it has to touch down and recharge (seconds). */
const JET_FUEL = 2.2
/** Ledges up to this high are walked straight onto (the launch pad's deck edge isn't). */
const STEP_UP = 0.6

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _clamped = { x: 0, z: 0 }
const _seatPos = new Vector3()
const _seatQuat = new Quaternion()

/**
 * Climbing into a seat takes at least this long (seconds), longer for seats further from
 * the pad (the liner's back rows): never faster than a brisk walk, so the server sees an
 * ordinary move.
 */
const CLIMB_S = 0.5
const CLIMB_SPEED = 7

/** Is someone else already sitting in `seat`? */
function seatTaken(seat) {
  for (const r of remotePlayers.values()) {
    if (r.anim === 'sit' && Math.abs(r.position.x - seat.x) < 0.7 && Math.abs(r.position.z - seat.z) < 0.7) return true
  }
  return false
}

/** The free seat of the jet whose boarding ring you're standing on, if any (and its ring). */
function seatAt(place, x, z) {
  for (const jet of jetsOf(place)) {
    const pad = jetPad(jet)
    if (Math.hypot(x - pad.x, z - pad.z) > pad.radius) continue
    const seat = jetSeats(jet).find((s) => !seatTaken(s))
    return seat ? { seat, pad } : null
  }
  return null
}

/** Pushes a circle out of an axis-aligned rect. Returns true on contact. */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= RADIUS * RADIUS) return false

  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const push = (RADIUS - d) / d
    pos.x += dx * push
    pos.z += dz * push
    return true
  }

  // Centre inside the rect: leave by the nearest side.
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - RADIUS
  else if (m === right) pos.x = rect.maxX + RADIUS
  else if (m === near) pos.z = rect.minZ - RADIUS
  else pos.z = rect.maxZ + RADIUS
  return true
}

/**
 * The local player: a kinematic character controller.
 *
 * No physics engine: every place is flat ground, a few raised floors and a list of
 * rectangular walls (shared/world.js layouts), which a circle-vs-rect push-out handles
 * exactly. That saves the ~2 MB Rapier WASM download and keeps the active rigid body
 * count at zero.
 *
 * Gravity is the place's (long floaty jumps on the Moon), and your suit sets how fast
 * you walk and how high you jump - the best ones carry a jetpack: hold jump in the air
 * to fly up for a couple of seconds. Mid-trip you're frozen and hidden: the flight
 * scene is on screen instead.
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 *
 * @param {{ onAvatarReady?: () => void }} props
 */
export function Player({ onAvatarReady }) {
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)
  const jumpHeld = useRef(false)
  /** Jetpack burn left (seconds), refilled on landing. */
  const fuel = useRef(JET_FUEL)
  /**
   * The seat you're in: `{ seat, pad, place, from, t }` (`from` where you climbed in from,
   * `t` 0-1 through the climb), or null. `padLock` is the ring you just climbed out
   * onto: it won't seat you again until you've stepped off it.
   */
  const sitting = useRef(null)
  const padLock = useRef(null)

  /** Handed to the avatar so it can pose itself. A ref: written every frame. */
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: WALK_SPEED, vy: 0, stride: 0, swordLen: 1.4 })

  // The blob shadow follows the character.
  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  const casterRef = useRef(null)
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1, visible: true }
    casterRef.current = caster
    runtime.shadowCasters.add(caster)
    return () => runtime.shadowCasters.delete(caster)
  }, [shownAt])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const player = runtime.player
    const pos = player.position
    const k = keys.current
    const joy = runtime.input
    const motion = motionRef.current
    const game = getGame()
    const { profile } = game
    const place = profile.location
    const layout = layoutOf(place)
    const suit = suitById(profile.suit)
    const flying = Boolean(game.trip)
    motion.time += delta

    const group = groupRef.current
    const visual = visualRef.current
    const cockpit = flying ? runtime.flightSeat : null
    if (group) group.visible = !flying || Boolean(cockpit)
    if (casterRef.current) casterRef.current.visible = !flying && !sitting.current
    if (flying) {
      velocity.current.set(0, 0, 0)
      vy.current = 0
      sitting.current = null
      motion.sit = Boolean(cockpit)
      // Riding a spaceplane: sat in its cockpit (the flight scene's seat anchor).
      if (cockpit && group && visual) {
        cockpit.updateWorldMatrix(true, false)
        cockpit.matrixWorld.decompose(_seatPos, _seatQuat, _move)
        group.position.copy(_seatPos)
        group.position.y -= SIT_HIP
        visual.quaternion.copy(_seatQuat)
      }
      return
    }

    // --- In a seat --------------------------------------------------------------
    const jumpNow = !player.frozen && game.panel === null && (k.jump || joy.jump)
    const seated = sitting.current
    if (seated && seated.place !== place) sitting.current = null
    if (sitting.current) {
      const { seat, pad, from } = seated
      if (jumpNow && !jumpHeld.current && seated.t >= 1) {
        // Climb out onto the boarding ring, with a little hop.
        jumpHeld.current = true
        sitting.current = null
        padLock.current = pad
        pos.set(pad.x, groundHeightAt(place, pad.x, pad.z), pad.z)
        vy.current = 5
        player.grounded = false
        sfx.jump()
      } else {
        jumpHeld.current = jumpNow
        seated.t = Math.min(1, seated.t + delta / seated.duration)
        const t = seated.t * seated.t * (3 - 2 * seated.t)
        const y = seat.y - SIT_HIP
        // A hop up and over the cockpit rim.
        pos.set(from.x + (seat.x - from.x) * t, from.y + (y - from.y) * t + Math.sin(t * Math.PI) * 0.8, from.z + (seat.z - from.z) * t)
        player.yaw = seat.yaw
        player.grounded = true
        player.speed = 0
        player.anim = 'sit'
        player.jetting = false
        velocity.current.set(0, 0, 0)
        vy.current = 0
        motion.sit = true
        motion.speed = 0
        motion.grounded = true
        if (visual) {
          _targetQuat.setFromAxisAngle(_up, seat.yaw)
          visual.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0005, delta))
        }
        if (group) group.position.copy(pos)
        shownAt.copy(pos)
        return
      }
    }
    motion.sit = false

    // --- Input, relative to the camera ----------------------------------------
    _input.set(0, 0, 0)
    const still = player.frozen || game.panel !== null
    if (!still) {
      _input.set((k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX, 0, (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - joy.joyY)
    }
    const inputLength = Math.min(1, _input.length())
    const topSpeed = WALK_SPEED * suit.speed

    if (inputLength > 0.02) {
      _input.normalize()
      // Flatten the camera's forward onto the ground plane so "up" always means
      // "away from the camera".
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
        .multiplyScalar(topSpeed * inputLength)
    } else {
      _move.set(0, 0, 0)
    }

    // Ease towards the target velocity: crisp, but no instant 0->max snaps. A little
    // less grip in the air, more so in low gravity.
    const gravityScale = Math.max(MIN_GRAVITY, gravityOf(place))
    const grip = player.grounded ? ACCELERATION : ACCELERATION * (0.35 + 0.4 * gravityScale)
    velocity.current.lerp(_move, 1 - Math.exp(-grip * delta))

    // --- Horizontal move + collision --------------------------------------------
    const prevX = pos.x
    const prevZ = pos.z
    pos.x += velocity.current.x * delta
    pos.z += velocity.current.z * delta
    for (const rect of layout.colliders) pushOut(pos, rect)
    clampToWalkable(place, pos.x, pos.z, _clamped)
    pos.x = _clamped.x
    pos.z = _clamped.z

    // A ledge too tall to step onto acts as a wall (unless you jumped up to it).
    let floor = groundHeightAt(place, pos.x, pos.z)
    if (floor - pos.y > STEP_UP) {
      pos.x = prevX
      pos.z = prevZ
      floor = groundHeightAt(place, pos.x, pos.z)
    }

    // --- Vertical ---------------------------------------------------------------
    const jumpInput = !still && (k.jump || joy.jump)
    const pressed = jumpInput && !jumpHeld.current
    jumpHeld.current = jumpInput
    const gravity = GRAVITY * gravityScale
    let jetting = false
    if (pressed && player.grounded) {
      vy.current = JUMP_SPEED * suit.jump
      player.grounded = false
      sfx.jump()
    } else if (jumpInput && !player.grounded && suit.jetpack && fuel.current > 0 && vy.current < JET_MAX_UP) {
      // Holding jump in the air on a jetpack suit: burn upwards.
      jetting = true
      fuel.current = Math.max(0, fuel.current - delta)
      vy.current = Math.min(JET_MAX_UP, vy.current + (JET_THRUST + gravity) * delta)
    }
    vy.current -= gravity * delta
    pos.y = Math.min(MAX_HEIGHT - 1, pos.y + vy.current * delta)

    if (pos.y <= floor) {
      // Coming down from a jump (not just stepping off a kerb) lands with a thump.
      if (!player.grounded && vy.current < -5) sfx.jumpLand()
      pos.y = floor
      vy.current = 0
      player.grounded = true
      fuel.current = JET_FUEL
    } else if (player.grounded && vy.current <= 0 && pos.y - floor < 0.5) {
      // Walking downhill: keep your feet on the slope instead of floating off it.
      pos.y = floor
      vy.current = 0
    } else if (pos.y - floor > 0.05) {
      player.grounded = false
    }

    // --- Boarding rings: step on one (on your feet) and you climb into the jet ----
    if (padLock.current && Math.hypot(pos.x - padLock.current.x, pos.z - padLock.current.z) > padLock.current.radius + 0.4) padLock.current = null
    if (!padLock.current && player.grounded && !still) {
      const found = seatAt(place, pos.x, pos.z)
      if (found) {
        const far = Math.hypot(found.seat.x - pos.x, found.seat.y - pos.y, found.seat.z - pos.z)
        sitting.current = { ...found, place, from: { x: pos.x, y: pos.y, z: pos.z }, t: 0, duration: Math.max(CLIMB_S, far / CLIMB_SPEED) }
        velocity.current.set(0, 0, 0)
      }
    }

    // --- Facing -----------------------------------------------------------------
    const speed = Math.hypot(velocity.current.x, velocity.current.z)
    if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)

    // A pose pinned from the ?debug console (window.__pp.runtime.debugPose). Never set in normal play.
    if (runtime.debugPose) Object.assign(motion, runtime.debugPose)

    // --- Where the body is ------------------------------------------------------
    // Step-ups ease in over a few frames on the visual only; the logical position snaps
    // so collision and triggers stay exact.
    const shownY = group ? group.position.y : pos.y
    const steppingUp = player.grounded && pos.y > shownY
    const y = steppingUp ? shownY + (pos.y - shownY) * Math.min(1, delta * 18) : pos.y
    if (visual) {
      _targetQuat.setFromAxisAngle(_up, player.yaw)
      visual.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0005, delta))
    }
    if (group) group.position.set(pos.x, y, pos.z)
    shownAt.set(pos.x, pos.y, pos.z)

    // --- Publish motion ---------------------------------------------------------
    player.speed = speed
    player.anim = jetting ? 'fly' : !player.grounded ? 'jump' : speed > 0.5 ? 'walk' : 'idle'
    runtime.player.jetting = jetting
    motion.speed = speed
    motion.maxSpeed = topSpeed
    motion.grounded = player.grounded
    // Low gravity: legs tuck up for longer (the pose reads vy).
    motion.vy = vy.current / Math.sqrt(gravityScale)
    motion.stride += delta * (5 + 6 * Math.min(1, speed / topSpeed)) * (player.grounded ? 1 : 0.4)
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef} position={[0, 0, 0]}>
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} gear={yourGear} onReady={onAvatarReady} />}>
          <Suspense fallback={<FallbackAvatar motionRef={motionRef} gear={yourGear} />}>
            <PlayerAvatar onReady={onAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} />
          </Suspense>
        </ErrorBoundary>
      </group>
      <JetFlame />
    </group>
  )
}

/**
 * The jetpack's two flames, shown while you burn: two small cones under the pack. One
 * draw call (merged), hidden the rest of the time.
 */
function JetFlame() {
  const ref = useRef(null)
  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return
    const on = Boolean(runtime.player.jetting) && !getGame().trip
    mesh.visible = on
    if (!on) return
    mesh.rotation.y = runtime.player.yaw
    const flicker = 0.85 + Math.sin(state.clock.elapsedTime * 60) * 0.15
    mesh.scale.set(1, flicker, 1)
  })
  return (
    <group ref={ref} visible={false}>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 0.53, -0.55]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.09, 0.45, 8]} />
          <meshBasicMaterial color="#ffb347" toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export default Player
