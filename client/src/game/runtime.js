import { Vector3 } from 'three'

import { layoutOf } from '@shared/world'

const EARTH_SPAWN = layoutOf('earth').spawn

/**
 * Per-frame mutable state shared between systems.
 *
 * Deliberately outside React and zustand: it changes every frame, nothing should
 * re-render because of it, and every reader lives in a `useFrame` or a timer. UI that
 * needs a slow-changing derivative of it (which zone the player is in, say) gets it
 * from the 10 Hz game ticker, which is the only thing that copies from here into the
 * store.
 */
export const runtime = {
  player: {
    position: new Vector3(EARTH_SPAWN.x, 0, EARTH_SPAWN.z),
    /** Facing, radians about +Y. PI faces north (-Z). */
    yaw: Math.PI,
    speed: 0,
    grounded: true,
    /** 'idle' | 'walk' | 'jump' | 'fly' | 'sit' (in a jet's seat) - what other players see. */
    anim: 'idle',
    /** Set when the controller should ignore input (mid-trip). */
    frozen: false,
  },

  /** Touch input, written by the on-screen joystick. -1..1, +y = forward. */
  input: {
    joyX: 0,
    joyY: 0,
    jump: false,
  },

  camera: {
    /** 'follow' orbits the player; 'flight' belongs to the trip scene. */
    mode: 'follow',
    yaw: 0,
    pitch: 0.32,
    distance: 12,
    /** Set to jump the follow camera straight to its target next frame. */
    snap: false,
  },

  /** A pose pinned over yours from the ?debug console (Player.jsx), or null. */
  debugPose: null,

  /**
   * The cockpit seat of the spaceplane you're riding (an Object3D the flight scene owns),
   * or null: while it's set, your character sits there instead of being hidden.
   */
  flightSeat: null,

  /**
   * Things that get a blob shadow on low presets. Each entry is
   * `{ position: Vector3, size: number, visible?: boolean }`.
   */
  shadowCasters: new Set(),
}

/** Puts the player back at `place`'s spawn (Boxity's respawn request). */
export function respawn(place) {
  const { spawn, spawnYaw } = layoutOf(place)
  runtime.player.position.set(spawn.x, 0, spawn.z)
  runtime.player.yaw = spawnYaw
}
