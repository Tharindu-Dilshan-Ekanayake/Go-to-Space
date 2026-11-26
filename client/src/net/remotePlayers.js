import { Vector3 } from 'three'

import { runtime } from '../game/runtime'
import { getGame } from '../store/game'

/**
 * Other players, as the network last described them. Network callbacks write here;
 * the renderer reads it each frame and interpolates between snapshots, drawing
 * everyone ~110 ms in the past so 10 Hz updates still move smoothly.
 */

/** sessionId -> remote player */
export const remotePlayers = new Map()

const MAX_SNAPSHOTS = 24

/** Everyone's synced state, wherever they are, so moving somewhere can redraw them. */
const latest = new Map()

/** Where we are, as far as seeing others goes: nowhere while flying. */
const myPlace = () => {
  const game = getGame()
  return game.trip ? 'transit' : game.profile.location
}

export function upsertRemotePlayer(sessionId, state) {
  latest.set(sessionId, state)
  // Only players in the same place are drawn (and nobody while you or they fly).
  const place = myPlace()
  if (state.place !== place || place === 'transit') {
    dropRemotePlayer(sessionId)
    return
  }
  let r = remotePlayers.get(sessionId)
  if (!r) {
    r = {
      sessionId,
      name: '',
      /** Their verified Boxity user id ('' for guests): matches Boxity chat to them. */
      uid: '',
      snaps: [],
      position: new Vector3(state.x, state.y, state.z),
      yaw: state.rotY,
      speed: 0,
      anim: 'idle',
      suit: 'rookie',
      carrying: false,
      /** Their avatar's outfit, parsed from `look`; `lookKey` is the raw string. */
      look: null,
      lookKey: '',
      walkPhase: 0,
    }
    // Its own point, following them about (RemotePlayers).
    r.shadow = { position: r.position.clone(), size: 1.1, visible: true }
    runtime.shadowCasters.add(r.shadow)
    remotePlayers.set(sessionId, r)
    // Fresh arrivals jump straight to where they are.
    r.snaps.length = 0
  }
  r.name = state.name
  r.uid = state.uid || ''
  r.anim = state.anim
  r.suit = state.suit || 'rookie'
  r.carrying = Boolean(state.carrying)
  if (state.look !== r.lookKey) {
    r.lookKey = state.look
    try {
      r.look = state.look ? JSON.parse(state.look) : null
    } catch {
      r.look = null
    }
  }
  const last = r.snaps[r.snaps.length - 1]
  if (!last || last.x !== state.x || last.y !== state.y || last.z !== state.z || last.r !== state.rotY) {
    r.snaps.push({ t: performance.now(), x: state.x, y: state.y, z: state.z, r: state.rotY })
    if (r.snaps.length > MAX_SNAPSHOTS) r.snaps.shift()
  }
}

/** You moved somewhere (or set off): shows the players there, hides the rest. */
export function refreshRemotePlaces() {
  for (const [sessionId, state] of latest) upsertRemotePlayer(sessionId, state)
}

export function removeRemotePlayer(sessionId) {
  latest.delete(sessionId)
  dropRemotePlayer(sessionId)
}

function dropRemotePlayer(sessionId) {
  const r = remotePlayers.get(sessionId)
  if (!r) return
  runtime.shadowCasters.delete(r.shadow)
  remotePlayers.delete(sessionId)
}

export function clearRemotePlayers() {
  for (const id of [...remotePlayers.keys()]) removeRemotePlayer(id)
  latest.clear()
}
