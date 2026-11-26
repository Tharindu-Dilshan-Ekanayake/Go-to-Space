import { destinationById, DESTINATIONS, EARTH, STATION, suitById, suitSurvives } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isUnlocked } from '@shared/logic'
import { BAYS, EARTH_BOARD, groundHeightAt, jetPad, jetsOf, LAUNCH_PAD, layoutOf, ORRERY, SAFE_ROOM, SUIT_SHOP } from '@shared/world'

/** Text styles, as gradients top-to-bottom. */
export const TEXT = {
  gold: ['#fffaa8', '#ffd52a', '#ff9c00'],
  green: ['#e6ffb0', '#8dff4f', '#2fd12f'],
  white: ['#ffffff', '#ffffff', '#dfe7f0'],
  red: ['#ffb0a8', '#ff4a3b', '#d4142a'],
  blue: ['#e0faff', '#7fe2ff', '#2fa8ff'],
  purple: ['#f2e0ff', '#c79bff', '#8a4dff'],
}

const sign = (title, gradient, sub) => ({
  lines: [{ text: title, size: 58, gradient }, ...(sub ? [{ text: sub, size: 30, fill: '#ffffff' }] : [])],
  pxPerUnit: 64,
})

/** A floating label: `{ id, position, spec, ...options }` for LabelBatch.add. */
const label = (id, x, y, z, spec, options = {}) => ({ id, position: [x, y, z], spec, ...options })

/** The sign over `place`'s Oxygen Store. */
const oxygenLabel = (place, z) => label('o2', z.o2.x, groundHeightAt(place, z.o2.x, z.o2.z) + 5.2, z.o2.z - 2.4, sign('OXYGEN STORE', TEXT.blue, 'Refill · bigger tanks'))

/** A sign over every jet's boarding ring in `place`. */
const jetLabels = (place) =>
  jetsOf(place).map((jet, i) => {
    const pad = jetPad(jet)
    const liner = jet.kind === 'liner'
    return label(
      `jet:${i}`,
      pad.x,
      (jet.y || 0) + (liner ? 4.2 : 3.4),
      pad.z,
      sign(liner ? 'BOARD THE SPACELINER' : 'SIT IN THE JET', TEXT.blue, liner ? '16 seats · step on the pad · jump to get out' : 'Step on the pad · jump to get out'),
    )
  })

/**
 * Every floating sign in `place`, for WorldLabels: what each pad, bay and building is,
 * and for the station's bays whether they're open to you yet.
 */
export function placeLabels(place, profile) {
  const z = layoutOf(place).zones
  if (place === EARTH) {
    return [
      label('cargo', z.cargo.x, 4.6, z.cargo.z, sign('CARGO PAD', TEXT.gold, 'Pick up & deliver packages')),
      // Printed on the shop's rooftop board (suitShop.jsx), facing the plaza.
      label('suits', SUIT_SHOP.x, 7.7, SUIT_SHOP.z - SUIT_SHOP.d / 2 + 0.3, { ...sign('SUIT SHOP', TEXT.purple, 'Free Rookie suit inside'), pxPerUnit: 46 }, { facing: Math.PI }),
      label('map', z.map.x, 4.2, 12.1, sign('STAR MAP', TEXT.blue, 'Unlock planets & warp')),
      label('boarding', z.boarding.x, LAUNCH_PAD.height + 5.4, z.boarding.z, sign('ROCKET TO ORBIT', TEXT.green, 'Stand in the ring at liftoff')),
      label('hq', EARTH_BOARD.x - 0.1, 10.8, EARTH_BOARD.z, sign('MISSION CONTROL', TEXT.white), { facing: EARTH_BOARD.yaw }),
      ...jetLabels(place),
      oxygenLabel(place, z),
    ]
  }
  if (place === STATION) {
    return [
      label('pod', z.pod.x, 4.2, z.pod.z, sign('RE-ENTRY POD', TEXT.gold, 'Back down to Earth')),
      label('orrery', ORRERY.x, 11, ORRERY.z, sign('THE SOLAR SYSTEM', TEXT.gold, 'Every world you can deliver to')),
      ...jetLabels(place),
      oxygenLabel(place, z),
      ...BAYS.map((bay) => {
        const dest = destinationById(bay.id)
        const open = isUnlocked(profile, bay.id)
        const spec = {
          lines: [
            { text: dest.name.toUpperCase(), size: 54, gradient: open ? TEXT.green : TEXT.white },
            open
              ? { text: `$${formatNumber(dest.reward)} a delivery`, size: 30, fill: '#ffffff' }
              : { text: `LOCKED  $${formatNumber(dest.cost)}`, size: 34, gradient: TEXT.red },
            { text: `${suitById(dest.minSuit).name.toUpperCase()} SUIT OR BETTER`, size: 24, fill: suitSurvives(profile.suit, bay.id) ? '#bfffc4' : '#ffb0a8' },
          ],
          pxPerUnit: 92,
        }
        // Printed on the screen over the bay (Station.jsx), facing the deck.
        return label(`bay:${bay.id}`, bay.x, 9.8, bay.z - 0.3, spec, { facing: 0 })
      }),
    ]
  }
  if (DESTINATIONS.some((d) => d.id === place)) {
    const dest = destinationById(place)
    return [
      label('cargo', z.cargo.x, 4.6, z.cargo.z, sign('CARGO PAD', TEXT.gold, 'Pick up & deliver packages')),
      label('beacon', z.beacon.x, 4.4, z.beacon.z, sign('SHUTTLE BEACON', TEXT.blue, 'Back up to Halo Station')),
      label('name', -14, 6.4, -9, sign(dest.name.toUpperCase(), TEXT.white, dest.blurb)),
      ...jetLabels(place),
      oxygenLabel(place, z),
      label('safe', SAFE_ROOM.x + Math.cos(SAFE_ROOM.door) * (SAFE_ROOM.radius + 0.6), 4.2, SAFE_ROOM.z + Math.sin(SAFE_ROOM.door) * (SAFE_ROOM.radius + 0.6), sign('SAFE ROOM', TEXT.green, 'Air to breathe inside')),
    ]
  }
  return []
}
