import { PLACE_NAMES } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { arrivalPoint } from '@shared/session'

import { sfx } from '../audio/sfx'
import { burst } from '../game/fx/fxQueue'
import { runtime } from '../game/runtime'
import { getGame } from '../store/game'
import { fadeThrough } from '../ui/fade'
import { refreshRemotePlaces } from './remotePlayers'

/** A point above you. */
const atPlayer = (dy = 1.2) => {
  const p = runtime.player.position
  return { x: p.x, y: p.y + dy, z: p.z }
}

/** Puts you at `place`'s arrival point, facing the way it says, the camera behind you. */
function placeAt(place) {
  const at = arrivalPoint(place)
  runtime.player.position.set(at.x, 0, at.z)
  runtime.player.yaw = at.yaw
  runtime.camera.yaw = 0
  runtime.camera.snap = true
}

/**
 * Applies one authority event to the client: updates the store and kicks off any
 * visual effect. The same handler serves the Colyseus connection and offline mode.
 */
export function handleServerEvent(type, payload) {
  const game = getGame()
  switch (type) {
    case 'profile': {
      const before = game.profile
      game.setProfile(payload.profile, payload.session)
      if (payload.profile.location !== before.location) refreshRemotePlaces()
      if (game.profileLoaded && payload.profile.suit !== before.suit) {
        sfx.buy()
        burst({ ...atPlayer(1.6), count: 50, palette: 'confetti', speed: 8 })
      }
      break
    }

    case 'trip': {
      // Off you go: the flight scene takes over until 'arrive'.
      runtime.player.frozen = true
      game.closePanel()
      game.setTrip({ ...payload, startedAt: performance.now() })
      refreshRemotePlaces()
      if (payload.via === 'rocket') sfx.liftoff()
      else if (payload.via === 'warp') sfx.warp()
      else sfx.shuttle()
      break
    }

    case 'arrive': {
      // A white flash covers the swap from the flight scene to the new place.
      fadeThrough(() => {
        placeAt(payload.place)
        runtime.player.frozen = false
        game.setTrip(null)
        refreshRemotePlaces()
      })
      sfx.arrive()
      const name = PLACE_NAMES[payload.place] || payload.place
      game.showToast(payload.first ? `WELCOME TO ${name.toUpperCase()}!` : name, payload.first ? 'good' : 'info')
      break
    }

    case 'delivered':
      sfx.cash()
      burst({ ...atPlayer(1.8), count: 60, palette: 'gold', speed: 9 })
      game.showToast(`DELIVERED! +$${formatNumber(payload.money)}`)
      break

    case 'picked':
      sfx.pickup()
      game.showToast(`New package for ${PLACE_NAMES[payload.to] || payload.to}  ($${formatNumber(payload.reward)})`, 'info')
      break

    case 'badge':
      setTimeout(() => {
        sfx.badge()
        game.showToast(`BADGE: ${payload.name}`)
      }, 1600)
      break

    case 'reward':
      sfx.cash()
      burst({ ...atPlayer(2), count: 40, palette: 'gold', speed: 8 })
      game.showToast(`${payload.label}${payload.money ? ` +$${formatNumber(payload.money)}` : ''}!`)
      break

    case 'oxygen':
      if (payload?.empty) {
        sfx.error()
        game.showToast('OUT OF OXYGEN! Rescue shuttle to Halo Station', 'bad')
      } else if (payload?.refilled) {
        sfx.buy()
        burst({ ...atPlayer(1.6), count: 30, palette: 'confetti', speed: 6 })
        game.showToast(payload.tank ? 'NEW OXYGEN TANK!' : 'OXYGEN REFILLED', 'info')
      }
      break

    case 'denied':
      sfx.error()
      if (payload?.reason) game.showToast(payload.reason, 'bad')
      break

    default:
      break
  }
}

/** Puts you where the authority says you are (join, reconnect). */
export function spawnAt(place, x, z) {
  placeAt(place)
  if (Number.isFinite(x) && Number.isFinite(z)) runtime.player.position.set(x, 0, z)
}
