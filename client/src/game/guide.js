import { EARTH, GUIDE_STEPS, STATION } from '@shared/balance'

/**
 * The first-time guide, step by step (balance GUIDE_STEPS; the server moves
 * `profile.guide` on as each is done): what to do, where, and the zone the arrows point
 * at there.
 */
export const GUIDE = [
  { text: 'Get your FREE space suit at the SUIT SHOP', place: EARTH, zone: 'suits' },
  { text: 'Pick up your first package at the CARGO PAD', place: EARTH, zone: 'cargo' },
  { text: "Stand on the ROCKET's boarding pad - you launch at zero!", place: EARTH, zone: 'boarding' },
  { text: 'Walk into the MOON shuttle bay', place: STATION, zone: 'bay:moon' },
  { text: "Deliver the package on the Moon's CARGO PAD", place: 'moon', zone: 'cargo' },
  { text: 'Take the SHUTTLE BEACON back up to Halo Station', place: 'moon', zone: 'beacon' },
  { text: 'Take the RE-ENTRY POD back down to Earth', place: STATION, zone: 'pod' },
]

/** The step `profile` is on, or null once the guide's done. */
export function guideStep(profile) {
  const i = profile?.guide ?? GUIDE_STEPS.length
  return i < GUIDE.length ? { ...GUIDE[i], index: i, count: GUIDE.length } : null
}
