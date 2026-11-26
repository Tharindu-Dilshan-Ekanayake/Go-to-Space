import { isUnlocked } from '@shared/logic'
import { zoneAt } from '@shared/world'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame } from '../store/game'
import { runtime } from './runtime'

const TICK_MS = 100
/** Least time between two asks of the authority for the same zone (it may be lagging). */
const RETRY_MS = 1500

/**
 * The 10 Hz bridge between the frame-rate world and the UI: works out which zone you
 * stand in and acts on walking into one - the Cargo Pad, a shuttle bay, the beacon, the
 * re-entry pod - and opens the Suit Shop and Star Map panels at their counters. This,
 * not the render loop, is what writes zone state into the store, and only when it
 * actually changed.
 *
 * @returns {() => void} stop
 */
export function startGameTicker() {
  let askedFor = null
  let askedAt = -Infinity

  /** Asks the authority for `key` once, then again only after RETRY_MS if still there. */
  const ask = (key, fn) => {
    const now = performance.now()
    if (askedFor === key && now - askedAt < RETRY_MS) return
    askedFor = key
    askedAt = now
    fn()
  }

  const tick = () => {
    const game = getGame()
    if (game.trip || runtime.player.frozen) {
      if (game.zone !== null) game.setZone(null)
      return
    }
    const { profile } = game
    const place = profile.location
    const p = runtime.player.position
    const zone = zoneAt(place, p.x, p.z)
    const entered = zone !== game.zone
    if (entered) game.setZone(zone)
    if (!zone) {
      askedFor = null
      return
    }

    if (zone === 'cargo') {
      // Only when there's something to do: no package, or this is where it's going.
      const pkg = profile.package
      if (!pkg || pkg.to === place) ask(`cargo:${pkg ? pkg.to : 'none'}:${profile.stats.deliveries}`, actions.cargo)
    } else if (zone.startsWith('bay:')) {
      const dest = zone.slice(4)
      if (isUnlocked(profile, dest)) ask(zone, () => actions.travel(dest, 'shuttle'))
      else if (entered && !game.panel) {
        sfx.error()
        game.openPanel('map', { focus: dest, auto: true })
      }
    } else if (zone === 'beacon') {
      ask(zone, () => actions.travel('station', 'shuttle'))
    } else if (zone === 'pod') {
      ask(zone, () => actions.travel('earth', 'pod'))
    } else if (entered && zone === 'safe') {
      game.showToast('SAFE ROOM: air to breathe - your oxygen refills here', 'info')
    } else if (entered && (zone === 'suits' || zone === 'map' || zone === 'o2') && !game.panel) {
      sfx.click()
      // Opened by walking onto the pad, not by the player's choice: never an ad screen.
      game.openPanel(zone === 'o2' ? 'oxygen' : zone, { auto: true })
    }
  }

  const id = setInterval(tick, TICK_MS)
  return () => clearInterval(id)
}
