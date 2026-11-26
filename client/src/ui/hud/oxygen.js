import { breathable, tankById } from '@shared/balance'

import { getGame } from '../../store/game'

/**
 * Seconds of air left right now: the authority's last reading, counted down since it
 * came in (while you're somewhere without air and not flying). It corrects us every few
 * seconds, so the count never drifts far.
 */
export function oxygenLeft() {
  const { profile, oxygenAt, trip, zone } = getGame()
  const full = tankById(profile.tank).seconds
  const reading = Number.isFinite(profile.oxygen) ? profile.oxygen : full
  // Where there's air - Earth, the station, a planet's safe room - it's topped up.
  if (zone === 'safe') return full
  if (trip || breathable(profile.location) || !oxygenAt) return Math.min(full, reading)
  return Math.max(0, reading - (performance.now() - oxygenAt) / 1000)
}

/** 95 -> "1:35". */
export function formatAir(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
