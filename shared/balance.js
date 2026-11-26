/**
 * Orbit Express - every number the game is balanced by, in one place.
 *
 * The loop: grab a package at a Cargo Pad, ride the rocket up to Halo Station, take a
 * shuttle to wherever the package is going, step on that world's Cargo Pad to deliver
 * it (Money!), and pick up the next one. Money unlocks further destinations - which pay
 * more per delivery - and better suits, which pay more and move faster.
 *
 * Shared by the server (authoritative) and the client (display, offline play).
 */

// --- Places -----------------------------------------------------------------------

/**
 * Where you can be. Earth's spaceport is the hub you start in; Halo Station orbits above
 * it, and every destination is reached from the station's shuttle bays.
 *
 * Destination fields:
 * - `cost`     Money to unlock (0 = open from the start)
 * - `reward`   what a delivery to or from it pays (before suit and pass bonuses)
 * - `gravity`  fraction of Earth's: jumps there are floatier
 * - `look`     colours for its surface scene (client only reads these)
 */
export const EARTH = 'earth'
export const STATION = 'station'

export const DESTINATIONS = [
  {
    id: 'moon',
    name: 'Moon',
    blurb: 'Grey dust and long, slow jumps.',
    cost: 0,
    reward: 40,
    gravity: 0.3,
    look: { ground: '#9a9ca3', rock: '#7c7f87', skyTop: '#000004', horizon: '#05060c', planet: '#b8bcc6', stars: 1, dust: '#c9ccd4' },
  },
  {
    id: 'mars',
    name: 'Mars',
    blurb: 'Rusty dunes under a butterscotch sky.',
    cost: 500,
    reward: 110,
    gravity: 0.4,
    look: { ground: '#c1622f', rock: '#8e3f1d', skyTop: '#c98a5e', horizon: '#e9b48a', planet: '#d06a35', stars: 0, dust: '#e08850' },
  },
  {
    id: 'venus',
    name: 'Venus',
    blurb: 'Thick yellow clouds and black basalt.',
    cost: 1500,
    reward: 220,
    gravity: 0.9,
    look: { ground: '#4a3f33', rock: '#2f2822', skyTop: '#a3803a', horizon: '#e0c070', planet: '#e3c27a', stars: 0, dust: '#c9a55a' },
  },
  {
    id: 'mercury',
    name: 'Mercury',
    blurb: 'Scorched craters, a giant Sun overhead.',
    cost: 4000,
    reward: 420,
    gravity: 0.38,
    look: { ground: '#8a6a50', rock: '#5c4433', skyTop: '#030202', horizon: '#2a160c', planet: '#9c8270', stars: 1, dust: '#b8977a' },
  },
  {
    id: 'europa',
    name: 'Europa',
    blurb: 'Cracked ice over a hidden ocean.',
    cost: 10000,
    reward: 800,
    gravity: 0.13,
    look: { ground: '#cdd7de', rock: '#b5784e', skyTop: '#000006', horizon: '#0b1020', planet: '#e9dcc4', stars: 1, dust: '#eef3f6' },
  },
  {
    id: 'io',
    name: 'Io',
    blurb: 'Sulphur fields and restless volcanoes.',
    cost: 20000,
    reward: 1400,
    gravity: 0.18,
    look: { ground: '#d9c24a', rock: '#9c4a1c', skyTop: '#05030a', horizon: '#1c1208', planet: '#e8d060', stars: 1, dust: '#f0e070' },
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    blurb: 'The biggest moon there is.',
    cost: 40000,
    reward: 2400,
    gravity: 0.15,
    look: { ground: '#7d8a9c', rock: '#4d5868', skyTop: '#000206', horizon: '#0a1222', planet: '#a8b4c4', stars: 1, dust: '#cfd9e6' },
  },
  {
    id: 'callisto',
    name: 'Callisto',
    blurb: 'Ancient, dark, and covered in craters.',
    cost: 75000,
    reward: 4000,
    gravity: 0.13,
    look: { ground: '#4a3a2e', rock: '#2a201a', skyTop: '#020101', horizon: '#120c08', planet: '#6e5a4a', stars: 1, dust: '#d8d2c8' },
  },
  {
    id: 'titan',
    name: 'Titan',
    blurb: 'Orange haze and methane lakes, out by Saturn.',
    cost: 150000,
    reward: 7500,
    gravity: 0.14,
    look: { ground: '#8a6234', rock: '#5a3e1e', skyTop: '#a8692a', horizon: '#e0a050', planet: '#d89a4a', stars: 0, dust: '#c08040' },
  },
]

export const DESTINATION_IDS = DESTINATIONS.map((d) => d.id)
export const destinationById = (id) => DESTINATIONS.find((d) => d.id === id) || null

/** Display names for every place, the hubs included. */
export const PLACE_NAMES = {
  [EARTH]: 'Earth',
  [STATION]: 'Halo Station',
  ...Object.fromEntries(DESTINATIONS.map((d) => [d.id, d.name])),
}

export const isPlace = (id) => id === EARTH || id === STATION || DESTINATION_IDS.includes(id)

/** Gravity in each place, as a fraction of Earth's. */
export const gravityOf = (place) => destinationById(place)?.gravity ?? 1

/** What a delivery to or from `place` pays (Earth and the station pay nothing on their own). */
export const placeReward = (place) => destinationById(place)?.reward ?? 0

// --- Travel -----------------------------------------------------------------------

/**
 * The Earth rocket leaves on a fixed schedule, the same moment for everyone: every
 * LAUNCH_CYCLE_MS of wall-clock time. Stand in the boarding ring when it lifts off and
 * you ride it up to Halo Station.
 */
export const LAUNCH_CYCLE_MS = 40_000
/** The countdown turns urgent (red, beeping) in its last stretch. */
export const LAUNCH_WARNING_MS = 10_000

/** Milliseconds until the next launch, at wall-clock time `now`. */
export const msToLaunch = (now) => {
  const left = LAUNCH_CYCLE_MS - (now % LAUNCH_CYCLE_MS)
  return left === LAUNCH_CYCLE_MS ? 0 : left
}
/** The most recent launch at or before `now`. */
export const lastLaunchAt = (now) => now - (now % LAUNCH_CYCLE_MS)

/**
 * How long each kind of trip takes (the flight scene plays meanwhile; you can't act
 * until you arrive). `rocket` Earth -> station, `pod` station -> Earth, `shuttle`
 * station <-> a destination, `warp` a Star Map jump to anywhere you've been before.
 */
export const TRIP_MS = {
  rocket: 9000,
  pod: 6000,
  shuttle: 6500,
  warp: 3500,
  /** Out of oxygen on a planet: the rescue shuttle back to Halo Station. */
  rescue: 5000,
}

// --- Oxygen -------------------------------------------------------------------------

/**
 * Oxygen: there's air on Earth and aboard Halo Station; everywhere else your tank runs
 * down a second a second. Run dry and a rescue shuttle takes you back to the station
 * (your package stays with you). Refill at any Oxygen Store - free where there's air,
 * for a little Money out on the planets - and buy bigger tanks there.
 *
 * Tanks, smallest first: `seconds` of air, `price` in Money.
 */
export const OXYGEN_TANKS = [
  { id: 'starter', name: 'Starter Tank', seconds: 90, price: 0, color: '#9fb4c8' },
  { id: 'standard', name: 'Standard Tank', seconds: 150, price: 400, color: '#3a7bd5' },
  { id: 'large', name: 'Large Tank', seconds: 240, price: 2000, color: '#2fbf9a' },
  { id: 'twin', name: 'Twin Tanks', seconds: 360, price: 8000, color: '#ff9a2e' },
  { id: 'cryo', name: 'Cryo Tank', seconds: 540, price: 30000, color: '#7fe2ff' },
  { id: 'fusion', name: 'Fusion Recycler', seconds: 900, price: 120000, color: '#c79bff' },
]
export const tankById = (id) => OXYGEN_TANKS.find((t) => t.id === id) || OXYGEN_TANKS[0]
/** Places with air to breathe: oxygen refills there by itself. */
export const breathable = (place) => place === EARTH || place === STATION
/** What a refill costs at `place`'s Oxygen Store (free where there's air). */
export const refillCost = (place) => (breathable(place) ? 0 : Math.max(15, Math.round(placeReward(place) * 0.2)))
/** Below this fraction of a full tank the warning shows. */
export const OXYGEN_LOW = 0.25

// --- Suits ------------------------------------------------------------------------

/**
 * Space suits: the helmet and pack you wear. Each pays more per delivery (`mult`), and
 * the better ones walk faster (`speed`), jump higher (`jump`) or carry a jetpack (hold
 * jump in the air to hover up). Bought with Money, except `solar`, which is a Gems
 * product. Colours are for the client: `main` shell, `accent` stripes, `visor` glass.
 */
export const SUITS = [
  { id: 'rookie', name: 'Rookie', price: 0, mult: 1, speed: 1, jump: 1, jetpack: false, colors: { main: '#f2f4f7', accent: '#3a7bd5', visor: '#7fd4ff' } },
  { id: 'cadet', name: 'Cadet', price: 120, mult: 1.08, speed: 1.02, jump: 1, jetpack: false, colors: { main: '#cfe3f7', accent: '#1f4f9a', visor: '#a8e6ff' } },
  { id: 'scout', name: 'Scout', price: 300, mult: 1.15, speed: 1.05, jump: 1, jetpack: false, colors: { main: '#ff9a2e', accent: '#2b2f3a', visor: '#ffe28a' } },
  { id: 'comet', name: 'Comet', price: 900, mult: 1.25, speed: 1.07, jump: 1.05, jetpack: false, colors: { main: '#e9fbff', accent: '#18c6e8', visor: '#bff6ff' } },
  { id: 'ranger', name: 'Ranger', price: 2500, mult: 1.35, speed: 1.1, jump: 1.1, jetpack: false, colors: { main: '#2fbf9a', accent: '#f4f7fb', visor: '#b5fff0' } },
  { id: 'meteor', name: 'Meteor', price: 5500, mult: 1.5, speed: 1.12, jump: 1.15, jetpack: false, colors: { main: '#8e1f1f', accent: '#ff8a2a', visor: '#ffc27a' } },
  { id: 'voyager', name: 'Voyager', price: 12000, mult: 1.7, speed: 1.15, jump: 1.2, jetpack: false, colors: { main: '#7a4dff', accent: '#ffd23a', visor: '#e0d0ff' } },
  { id: 'aurora', name: 'Aurora', price: 25000, mult: 1.95, speed: 1.18, jump: 1.22, jetpack: false, colors: { main: '#1f6b5a', accent: '#b06bff', visor: '#9dffcf' } },
  { id: 'nova', name: 'Nova', price: 45000, mult: 2.2, speed: 1.2, jump: 1.25, jetpack: true, colors: { main: '#e8323c', accent: '#ffcf3a', visor: '#ffb0a0' } },
  { id: 'nebula', name: 'Nebula', price: 90000, mult: 2.6, speed: 1.25, jump: 1.28, jetpack: true, colors: { main: '#c23f9a', accent: '#5fd8ff', visor: '#ffc2ef' } },
  { id: 'eclipse', name: 'Eclipse', price: 160000, mult: 3, speed: 1.3, jump: 1.3, jetpack: true, colors: { main: '#1d2030', accent: '#3ff0ff', visor: '#3ff0ff' } },
  { id: 'quasar', name: 'Quasar', price: 320000, mult: 3.6, speed: 1.35, jump: 1.35, jetpack: true, colors: { main: '#f7f3e8', accent: '#e8b021', visor: '#fff1b8' } },
  { id: 'galaxy', name: 'Galaxy', price: 750000, mult: 4.5, speed: 1.4, jump: 1.4, jetpack: true, colors: { main: '#141a4a', accent: '#c084ff', visor: '#8fb8ff' } },
  { id: 'solar', name: 'Solar Gold', price: null, gems: 'solar_suit', mult: 2.5, speed: 1.3, jump: 1.3, jetpack: true, colors: { main: '#ffcf3a', accent: '#ff7a1a', visor: '#fff3b0' } },
]

/**
 * Wearing no suit: how everyone arrives. Your own clothes, no bonuses - and no going to
 * space (the rocket won't take you). The Rookie suit is free at the Suit Shop.
 */
export const NO_SUIT = { id: 'none', name: 'No suit', price: null, mult: 1, speed: 1, jump: 1, jetpack: false, colors: { main: '#f2f4f7', accent: '#3a7bd5', visor: '#7fd4ff' } }

export const suitById = (id) => SUITS.find((s) => s.id === id) || NO_SUIT

// --- Store ------------------------------------------------------------------------

/**
 * Boxity Gems products, by sku. Prices live in Boxity's catalog, never here: the game
 * only names the sku and, once Boxity confirms the sale, grants what it says. Money
 * packs grow with you: `deliveries` deliveries' worth at the best place you've unlocked.
 */
export const GEM_PRODUCTS = {
  money_small: { name: 'Cargo Bonus', blurb: '10 top-route deliveries of Money', icon: 'trophy', grant: { deliveries: 10 } },
  money_big: { name: 'Freight Fortune', blurb: '60 top-route deliveries of Money', icon: 'trophy', grant: { deliveries: 60 } },
  money_x2: { name: 'x2 Money', blurb: 'Double the pay on every delivery, forever', icon: 'starGold', grant: { pass: 'moneyX2' } },
  solar_suit: { name: 'Solar Gold Suit', blurb: 'x2.5 pay, top speed and a jetpack', icon: 'star', grant: { suit: 'solar' } },
}

/** Permanent passes a profile can hold (from Gems products). */
export const PASSES = ['moneyX2']

/**
 * Rewarded ads (Boxity): watch one to earn this. Placement names are lowercase, digits
 * and hyphens. `cooldownMs` keeps a player from chaining them.
 */
export const AD_REWARDS = {
  'cargo-bonus': { label: 'Cargo Bonus', icon: 'trophy', grant: { deliveries: 3 }, cooldownMs: 3 * 60 * 1000 },
}

// --- Badges -----------------------------------------------------------------------

export const BADGES = {
  firstDelivery: { name: 'First Delivery' },
  orbit: { name: 'Reached Orbit' },
  moon: { name: 'Moonwalker' },
  mars: { name: 'Red Planet' },
  jupiter: { name: 'King of Moons' },
  titan: { name: 'Ringside' },
  grandTour: { name: 'Grand Tour' },
  tycoon: { name: 'Space Tycoon' },
}

/** Money earned in total that makes you a Space Tycoon. */
export const TYCOON_MONEY = 1_000_000
