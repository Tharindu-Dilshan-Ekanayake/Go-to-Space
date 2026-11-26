import { DESTINATIONS, EARTH, STATION } from './balance.js'
import { terrainHeight } from './terrain.js'

/**
 * Where everything is, in every place - shared by the server (it checks you're really
 * standing at a Cargo Pad or a shuttle bay before acting on it) and the client (which
 * builds the scenery around these numbers).
 *
 * Units are metres. +Y is up; each place's "north" is -Z. Every place is its own little
 * world on the same coordinates: what you see is only the place you're in.
 *
 * A layout:
 * - `spawn`       where you arrive, and `spawnYaw` the way you face (PI = north)
 * - `bounds`      the walkable rectangle
 * - `colliders`   rectangles you can't walk through
 * - `platforms`   raised floors: rectangles with a height, and ramps (`ramp` 'z+' rises
 *                 towards +Z, 'z-' towards -Z) that climb to it
 * - `zones`       named circles that do something when you stand in them
 */

const rect = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ })
const circle = (x, z, radius) => ({ x, z, radius })
/** A square pad zone: `radius` is its half-width (you're on it inside the square). */
const pad = (x, z, half) => ({ x, z, radius: half, square: true })
/** Whether (x, z) is in `zone` (a circle, or a square pad), with `margin` to spare. */
const within = (zone, x, z, margin) =>
  zone.square ? Math.max(Math.abs(x - zone.x), Math.abs(z - zone.z)) <= zone.radius + margin : Math.hypot(x - zone.x, z - zone.z) <= zone.radius + margin

// --- Parked spaceplanes you can sit in ------------------------------------------------

/** How far the spaceplane's landing gear reaches below its middle (scale 1). */
export const SPACEPLANE_GEAR = 1.55

/**
 * Spaceplanes parked about the places that you can sit in: step on the boarding pad by
 * one and you climb aboard into a free seat (jump to climb out). A jet is
 * `{ kind, x, z, y, yaw, scale }`: `y` the ground under its wheels, `yaw` the way its
 * nose points (0 = +Z). Each kind, in its own frame (nose along +Z, middle of the
 * fuselage at the origin, scale 1):
 *
 * - `fighter` the two-seat open-cockpit spaceplane
 * - `liner`   the Orbit Express spaceliner: 16 seats, two by two in eight rows, under a
 *             clear glass roof - a whole room's worth of players
 *
 * `gear` how high its middle stands on its wheels, `parts` the rectangles it blocks,
 * `seats` its seat cushions [x, y, z], `pad` the boarding pad, `door` where the boarding
 * stair meets it.
 */
export const LINER_GEAR = 2.1
const linerSeats = []
for (let row = 0; row < 8; row += 1) for (const x of [-0.62, 0.62]) linerSeats.push([x, 0.22, 4.4 - row * 1.15])

export const JET_KINDS = {
  fighter: {
    gear: SPACEPLANE_GEAR,
    parts: [rect(-1.15, 1.15, -3.5, 4.9), rect(-4.4, 4.4, -3, 1.6)],
    seats: [
      [0, 0.95, 2.05],
      [0, 0.95, 0.7],
    ],
    pad: { x: 2.7, z: 3.2, radius: 1.35 },
  },
  liner: {
    gear: LINER_GEAR,
    parts: [rect(-1.9, 1.9, -9.4, 8.8), rect(-6.6, 6.6, -3.4, 0.6), rect(-3.8, 3.8, -9.4, -6.8)],
    seats: linerSeats,
    pad: { x: -4.6, z: 5.6, radius: 1.8 },
    door: { x: -1.7, z: 5.6 },
  },
}

/** The pilot's seat of the fighter (scale 1): where you ride on a shuttle trip. */
export const JET_PILOT_SEAT = JET_KINDS.fighter.seats[0]

const kindOf = (jet) => JET_KINDS[jet.kind] || JET_KINDS.fighter

/** A point in `jet`'s frame, in the world. */
export const jetPoint = (jet, x, z) => {
  const c = Math.cos(jet.yaw)
  const s = Math.sin(jet.yaw)
  return { x: jet.x + (x * c + z * s) * jet.scale, z: jet.z + (-x * s + z * c) * jet.scale }
}

/** How high a jet's middle stands above the ground under it. */
export const jetGear = (jet) => (jet.y || 0) + kindOf(jet).gear * jet.scale

/** The rectangles a parked jet blocks (yaw in quarter turns). */
export function jetColliders(jet) {
  return kindOf(jet).parts.map((r) => {
    const a = jetPoint(jet, r.minX, r.minZ)
    const b = jetPoint(jet, r.maxX, r.maxZ)
    return rect(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z))
  })
}

/** A jet's seats in the world: where the sitter's seat is and the way they face. */
export const jetSeats = (jet) => kindOf(jet).seats.map(([x, y, z]) => ({ ...jetPoint(jet, x, z), y: jetGear(jet) + y * jet.scale, yaw: jet.yaw }))

/** A jet's boarding pad, in the world. */
export const jetPad = (jet) => {
  const pad = kindOf(jet).pad
  return { ...jetPoint(jet, pad.x, pad.z), radius: pad.radius }
}

/** The jets parked in each kind of place. */
export const EARTH_JET = { kind: 'liner', x: 31, z: 0, y: 0, yaw: 0, scale: 1 }
export const STATION_JETS = [
  { kind: 'fighter', x: 40, z: 0, y: 0, yaw: -Math.PI / 2, scale: 1 },
  { kind: 'fighter', x: 40, z: 22, y: 0, yaw: -Math.PI / 2, scale: 1 },
]
export const SURFACE_JET = { kind: 'fighter', x: 0, z: 31, y: 0.12, yaw: Math.PI, scale: 0.9 }

// --- Oxygen Stores ------------------------------------------------------------------

/**
 * An Oxygen Store in every kind of place (balance.js Oxygen): a booth with the tanks on
 * show and a ring in front of it - stand in the ring to refill and to buy bigger tanks.
 */
export const OXYGEN_STORES = {
  earth: { x: -24, z: 30 },
  station: { x: -24, z: 16 },
  surface: { x: 0, z: 6 },
}
/** The ring's radius, and the booth behind it (north of the ring), as a collider. */
export const OXYGEN_RING = 2.6
const oxygenBooth = ({ x, z }) => rect(x - 2.3, x + 2.3, z - 4.6, z - 2.2)

// --- Earth spaceport --------------------------------------------------------------

/** The launch pad: a raised concrete deck the rocket stands in the middle of. */
export const LAUNCH_PAD = { x: 0, z: -44, half: 11, height: 1.4 }
/** The rocket on it. */
export const ROCKET = { x: LAUNCH_PAD.x, z: LAUNCH_PAD.z - 2, radius: 3.4, height: 26 }
/** The ramp up from the plaza to the pad deck, on the pad's south side. */
const PAD_RAMP = { ...rect(-4, 4, LAUNCH_PAD.z + LAUNCH_PAD.half, LAUNCH_PAD.z + LAUNCH_PAD.half + 7), height: LAUNCH_PAD.height, ramp: 'z-' }

/**
 * The Suit Shop: a storefront on the plaza's south-east, facing north (its front at
 * z - d/2), with its mat in front and suits on pedestals either side.
 */
export const SUIT_SHOP = { x: 27, z: 35, w: 14, d: 9 }
const SHOP_FRONT = SUIT_SHOP.z - SUIT_SHOP.d / 2

const EARTH_LAYOUT = {
  spawn: { x: 0, z: 30 },
  spawnYaw: Math.PI,
  bounds: rect(-64, 64, -70, 56),
  zones: {
    /** Pick up / deliver packages. */
    cargo: pad(-20, 12, 4),
    /** Stand here when the rocket lifts off to ride it up to Halo Station. */
    boarding: pad(0, LAUNCH_PAD.z + 6.5, 3.4),
    /** The Suit Shop's mat, at its door. */
    suits: pad(SUIT_SHOP.x, SHOP_FRONT - 4, 3.2),
    /** The Star Map console. */
    map: pad(0, 14, 2.8),
    /** The Oxygen Store. */
    o2: pad(OXYGEN_STORES.earth.x, OXYGEN_STORES.earth.z, OXYGEN_RING),
  },
  colliders: [
    // Mission Control, west.
    rect(-46, -30, -14, 6),
    // The Suit Shop, and the pedestals out front.
    rect(SUIT_SHOP.x - SUIT_SHOP.w / 2, SUIT_SHOP.x + SUIT_SHOP.w / 2, SHOP_FRONT, SUIT_SHOP.z + SUIT_SHOP.d / 2),
    rect(SUIT_SHOP.x - 6.7, SUIT_SHOP.x - 3.2, SHOP_FRONT - 2.2, SHOP_FRONT),
    rect(SUIT_SHOP.x + 3.2, SUIT_SHOP.x + 6.7, SHOP_FRONT - 2.2, SHOP_FRONT),
    // The rocket and its gantry tower.
    rect(ROCKET.x - ROCKET.radius, ROCKET.x + ROCKET.radius, ROCKET.z - ROCKET.radius, ROCKET.z + ROCKET.radius),
    rect(LAUNCH_PAD.x + 5.6, LAUNCH_PAD.x + 9.6, ROCKET.z - 2, ROCKET.z + 2),
    // Crate stacks by the Cargo Pad.
    rect(-28.5, -25.5, 8, 11),
    rect(-27, -24, 15, 18),
    // Fuel tanks, east.
    rect(30, 38, -36, -28),
    // The hangar, east, and the spaceplane parked on its apron.
    rect(40, 60, -12, 16),
    ...jetColliders(EARTH_JET),
    // The Star Map console.
    rect(-0.9, 0.9, 11.6, 12.6),
    oxygenBooth(OXYGEN_STORES.earth),
  ],
  platforms: [
    { ...rect(LAUNCH_PAD.x - LAUNCH_PAD.half, LAUNCH_PAD.x + LAUNCH_PAD.half, LAUNCH_PAD.z - LAUNCH_PAD.half, LAUNCH_PAD.z + LAUNCH_PAD.half), height: LAUNCH_PAD.height },
    PAD_RAMP,
  ],
}

/** The leaderboards' sign, on Mission Control's east face. */
export const EARTH_BOARD = { x: -29.7, z: -4, yaw: Math.PI / 2 }

// --- Halo Station -----------------------------------------------------------------

/** The shuttle bays line the deck's north edge, one per destination, west to east. */
const BAY_SPACING = 10
const BAY_Z = -30
export const BAYS = DESTINATIONS.map((d, i) => ({ id: d.id, x: (i - (DESTINATIONS.length - 1) / 2) * BAY_SPACING, z: BAY_Z, radius: 3.2 }))

/** The solar system model in the middle of the deck: its round base. */
export const ORRERY = { x: 0, z: -2, radius: 6.8 }
/** The garden dome, west. */
export const GARDEN = { x: -38, z: 2, w: 14, d: 10 }

const STATION_LAYOUT = {
  spawn: { x: 0, z: 30 },
  spawnYaw: Math.PI,
  bounds: rect(-56, 56, -34, 40),
  zones: {
    /** The re-entry pod back down to Earth. */
    pod: pad(-40, 28, 3.6),
    o2: pad(OXYGEN_STORES.station.x, OXYGEN_STORES.station.z, OXYGEN_RING),
    ...Object.fromEntries(BAYS.map((b) => [`bay:${b.id}`, pad(b.x, b.z, b.radius)])),
  },
  colliders: [
    // The solar system model's base (a cross of two rects round the circle).
    rect(ORRERY.x - 6.6, ORRERY.x + 6.6, ORRERY.z - 3.6, ORRERY.z + 3.6),
    rect(ORRERY.x - 3.6, ORRERY.x + 3.6, ORRERY.z - 6.6, ORRERY.z + 6.6),
    // The garden dome's base.
    rect(GARDEN.x - GARDEN.w / 2, GARDEN.x + GARDEN.w / 2, GARDEN.z - GARDEN.d / 2, GARDEN.z + GARDEN.d / 2),
    // The lounge jets, east; the Oxygen Store.
    ...STATION_JETS.flatMap(jetColliders),
    oxygenBooth(OXYGEN_STORES.station),
  ],
  platforms: [],
}

// --- Destinations -----------------------------------------------------------------

/**
 * The safe room on every destination: the outpost's habitat dome, big enough to walk
 * into - a curved wall with a doorway (`door`, the angle it faces: towards the landing
 * pad) under a glass dome, with air inside (session.js: your oxygen refills there).
 */
export const SAFE_ROOM = { x: -29, z: -6, radius: 6.5, door: Math.atan2(0.9, 0.42) }
/** The wall's pieces, as many angles round as fit, leaving the doorway open. */
export const SAFE_ROOM_SEGMENTS = 26
export const SAFE_ROOM_DOOR_GAP = 0.5
const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
export function safeRoomWallAngles() {
  const out = []
  for (let i = 0; i < SAFE_ROOM_SEGMENTS; i += 1) {
    const a = (i / SAFE_ROOM_SEGMENTS) * Math.PI * 2
    if (angleGap(a, SAFE_ROOM.door) > SAFE_ROOM_DOOR_GAP) out.push(a)
  }
  return out
}
/** The wall as colliders: a small square block at each piece (close enough not to slip between). */
function safeRoomWalls() {
  return safeRoomWallAngles().map((a) => {
    const x = SAFE_ROOM.x + Math.cos(a) * SAFE_ROOM.radius
    const z = SAFE_ROOM.z + Math.sin(a) * SAFE_ROOM.radius
    return rect(x - 0.8, x + 0.8, z - 0.8, z + 0.8)
  })
}

/** Where the spaceplane sits on each destination's landing pad. */
export const SURFACE_LANDING = { x: 0, z: 31 }

/**
 * Every destination's surface shares one layout: the outpost (a module, a habitat dome,
 * a solar array, a parked rover) with its Cargo Pad, the shuttle beacon, and the landing
 * pad with your spaceplane on it. The ground round them rolls (terrain.js).
 */
const SURFACE_LAYOUT = {
  spawn: { x: 0, z: 18 },
  spawnYaw: Math.PI,
  bounds: rect(-58, 58, -58, 58),
  zones: {
    cargo: pad(-14, 2, 4),
    /** The shuttle back up to Halo Station. */
    beacon: pad(14, 2, 3.6),
    o2: pad(OXYGEN_STORES.surface.x, OXYGEN_STORES.surface.z, OXYGEN_RING),
    /** Inside the safe room: there's air in there. */
    safe: circle(SAFE_ROOM.x, SAFE_ROOM.z, SAFE_ROOM.radius - 1),
  },
  colliders: [
    // The outpost module behind the Cargo Pad, its habitat dome and solar array.
    rect(-20, -8, -12, -6),
    ...safeRoomWalls(),
    rect(-20, -8, -21, -15),
    // The rover, and the spaceplane on the landing pad.
    rect(6.2, 9.8, -10.4, -5.6),
    ...jetColliders(SURFACE_JET),
    oxygenBooth(OXYGEN_STORES.surface),
  ],
  platforms: [],
}

export const LAYOUTS = {
  [EARTH]: EARTH_LAYOUT,
  [STATION]: STATION_LAYOUT,
  ...Object.fromEntries(DESTINATIONS.map((d) => [d.id, SURFACE_LAYOUT])),
}

export const layoutOf = (place) => LAYOUTS[place] || EARTH_LAYOUT

/** Where `place`'s Oxygen Store stands. */
export const oxygenStoreOf = (place) => (place === EARTH ? OXYGEN_STORES.earth : place === STATION ? OXYGEN_STORES.station : OXYGEN_STORES.surface)

/** The jets parked in `place` you can sit in. */
export const jetsOf = (place) => (place === EARTH ? [EARTH_JET] : place === STATION ? STATION_JETS : DESTINATIONS.some((d) => d.id === place) ? [SURFACE_JET] : [])

// --- Queries ------------------------------------------------------------------------

export const inRect = (r, x, z, margin = 0) => x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin

/** Whether (x, z) is inside zone `name` of `place` (give or take `margin` metres). */
export function inZone(place, name, x, z, margin = 0) {
  const zone = layoutOf(place).zones[name]
  return Boolean(zone) && within(zone, x, z, margin)
}

/** The zone you're standing in at (x, z), or null. */
export function zoneAt(place, x, z, margin = 0) {
  const { zones } = layoutOf(place)
  for (const name in zones) {
    if (within(zones[name], x, z, margin)) return name
  }
  return null
}

/** Floor height at (x, z): the terrain (destinations), or a platform's top, or partway up a ramp. */
export function groundHeightAt(place, x, z) {
  let h = terrainHeight(place, x, z)
  for (const p of layoutOf(place).platforms) {
    if (!inRect(p, x, z)) continue
    let top = p.height
    if (p.ramp === 'z-') top = p.height * (1 - (z - p.minZ) / (p.maxZ - p.minZ))
    else if (p.ramp === 'z+') top = p.height * ((z - p.minZ) / (p.maxZ - p.minZ))
    if (top > h) h = top
  }
  return h
}

/** Clamps (x, z) into the place's walkable bounds. */
export function clampToWalkable(place, x, z, out = { x: 0, z: 0 }) {
  const b = layoutOf(place).bounds
  out.x = Math.min(b.maxX, Math.max(b.minX, x))
  out.z = Math.min(b.maxZ, Math.max(b.minZ, z))
  return out
}

/** Fastest anyone legitimately moves (the quickest suit, with a little room). */
export const MAX_MOVE_SPEED = 18
/** Highest anyone legitimately gets (a jetpack in Europa's gravity). */
export const MAX_HEIGHT = 60
