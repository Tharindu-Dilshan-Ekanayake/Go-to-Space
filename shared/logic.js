import {
  AD_REWARDS,
  BADGES,
  DESTINATIONS,
  destinationById,
  EARTH,
  GEM_PRODUCTS,
  isPlace,
  PASSES,
  OXYGEN_TANKS,
  placeReward,
  refillCost,
  STATION,
  suitById,
  SUITS,
  tankById,
  TYCOON_MONEY,
} from './balance.js'

/**
 * Game rules as pure functions over a plain profile object.
 *
 * The server runs these authoritatively; the client runs the very same functions for
 * offline play and for display (prices, what a delivery would pay). Mutating functions
 * change the profile in place and return a small result describing what happened,
 * which is what gets sent to the client as an event.
 */

export const PROFILE_VERSION = 2

export function createProfile(id, name) {
  return {
    v: PROFILE_VERSION,
    id,
    name,
    money: 0,
    /** Where you are: 'earth', 'station' or a destination id. Saved, so you come back there. */
    location: EARTH,
    /** Destinations you've bought (the free ones are always open, listed or not). */
    unlocked: ['moon'],
    /** Places you've set foot on: the Star Map can warp you to any of them. */
    visited: [EARTH],
    /** The package you're carrying, or null: `{ from, to, reward }`. */
    package: null,
    /** The suit you wear ('none' at first: the Rookie suit is free at the Suit Shop). */
    suit: 'none',
    ownedSuits: [],
    /** Your oxygen tank (balance OXYGEN_TANKS), and the seconds of air left in it. */
    tank: 'starter',
    oxygen: OXYGEN_TANKS[0].seconds,
    passes: {},
    badges: [],
    stats: {
      deliveries: 0,
      totalEarned: 0,
      /** Seconds played. */
      playtime: 0,
      launches: 0,
    },
    lastSeen: 0,
  }
}

const isString = (v) => typeof v === 'string'

/** Fills in anything missing from an older or partial save. Never throws. */
export function normalizeProfile(raw, id, name) {
  const base = createProfile(id, name)
  if (!raw || typeof raw !== 'object' || raw.v !== PROFILE_VERSION) return base
  const p = { ...base, id, name: name || (isString(raw.name) ? raw.name : base.name) }
  p.money = Number.isFinite(raw.money) ? Math.max(0, raw.money) : 0
  p.lastSeen = Number.isFinite(raw.lastSeen) ? raw.lastSeen : 0
  p.unlocked = [...new Set(['moon', ...(Array.isArray(raw.unlocked) ? raw.unlocked.filter((d) => destinationById(d)) : [])])]
  p.visited = [...new Set([EARTH, ...(Array.isArray(raw.visited) ? raw.visited.filter(isPlace) : [])])]
  p.ownedSuits = [...new Set(Array.isArray(raw.ownedSuits) ? raw.ownedSuits.filter((s) => SUITS.some((x) => x.id === s)) : [])]
  p.suit = p.ownedSuits.includes(raw.suit) ? raw.suit : 'none'
  p.tank = OXYGEN_TANKS.some((t) => t.id === raw.tank) ? raw.tank : 'starter'
  p.oxygen = Number.isFinite(raw.oxygen) ? Math.min(oxygenCapacity(p), Math.max(0, raw.oxygen)) : oxygenCapacity(p)
  p.passes = Object.fromEntries(PASSES.filter((pass) => raw.passes?.[pass] === true).map((pass) => [pass, true]))
  p.badges = Array.isArray(raw.badges) ? raw.badges.filter((b) => BADGES[b]) : []
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {}
  for (const key of Object.keys(base.stats)) p.stats[key] = Number.isFinite(stats[key]) ? Math.max(0, stats[key]) : 0
  const pkg = raw.package
  p.package = pkg && isPlace(pkg.from) && isPlace(pkg.to) && Number.isFinite(pkg.reward) ? { from: pkg.from, to: pkg.to, reward: Math.max(0, pkg.reward) } : null
  // You come back where you left - unless that's somewhere you can no longer go.
  p.location = isPlace(raw.location) && canBeAt(p, raw.location) ? raw.location : EARTH
  p.v = PROFILE_VERSION
  return p
}

/** Per-connection state that is never saved. */
export function createSession(now) {
  return { start: now, adAt: {} }
}

// --- Places -----------------------------------------------------------------------

export const isUnlocked = (profile, destId) => {
  const dest = destinationById(destId)
  return Boolean(dest) && (dest.cost === 0 || profile.unlocked.includes(destId))
}

/** Whether you're allowed to be at `place` at all. */
export const canBeAt = (profile, place) => place === EARTH || place === STATION || isUnlocked(profile, place)

/** Every place a package can go to or come from: Earth and each destination you've unlocked. */
export const cargoPlaces = (profile) => [EARTH, ...DESTINATIONS.filter((d) => isUnlocked(profile, d.id)).map((d) => d.id)]

/** The best per-delivery reward among places you've unlocked (packs and ads are paid in it). */
export const bestReward = (profile) => Math.max(...cargoPlaces(profile).map(placeReward), DESTINATIONS[0].reward)

/** Total multiplier on a delivery's pay: your suit, and the x2 Money pass. */
export function payMultiplier(profile) {
  return suitById(profile.suit).mult * (profile.passes.moneyX2 ? 2 : 1)
}

/** What a package between `from` and `to` is worth before multipliers: the further end's rate. */
export const routeReward = (from, to) => Math.max(placeReward(from), placeReward(to))

/** Marks `place` visited; returns true the first time. */
export function visit(profile, place) {
  if (profile.visited.includes(place)) return false
  profile.visited.push(place)
  return true
}

// --- Cargo ------------------------------------------------------------------------

/**
 * Hands you a new package at `place`'s Cargo Pad, bound for a random other place you've
 * unlocked. Returns `{ ok, package }`.
 */
export function pickUpPackage(profile, place, rand = Math.random) {
  if (profile.package) return { ok: false, error: 'Already carrying a package' }
  const options = cargoPlaces(profile).filter((p) => p !== place)
  if (options.length === 0) return { ok: false, error: 'Nowhere to send it' }
  // Newer, further places come up a little more often: they pay best.
  const weights = options.map((_, i) => 1 + i * 0.35)
  let roll = rand() * weights.reduce((a, b) => a + b, 0)
  let to = options[options.length - 1]
  for (let i = 0; i < options.length; i += 1) {
    roll -= weights[i]
    if (roll < 0) {
      to = options[i]
      break
    }
  }
  profile.package = { from: place, to, reward: routeReward(place, to) }
  return { ok: true, package: { ...profile.package } }
}

/** Delivers the package you carry, if it's for `place`. Returns `{ ok, money, to }`. */
export function deliverPackage(profile, place) {
  const pkg = profile.package
  if (!pkg) return { ok: false, error: 'No package' }
  if (pkg.to !== place) return { ok: false, error: `This package goes to ${pkg.to}` }
  const money = Math.round(pkg.reward * payMultiplier(profile))
  profile.package = null
  earn(profile, money)
  profile.stats.deliveries += 1
  return { ok: true, money, to: place, from: pkg.from }
}

/** Throws away the package you carry. */
export function dropPackage(profile) {
  if (!profile.package) return { ok: false }
  profile.package = null
  return { ok: true }
}

function earn(profile, money) {
  profile.money += money
  profile.stats.totalEarned += money
}

// --- Shopping ---------------------------------------------------------------------

/** Unlocks destination `destId` for Money. */
export function unlockDestination(profile, destId) {
  const dest = destinationById(destId)
  if (!dest) return { ok: false, error: 'Unknown destination' }
  if (isUnlocked(profile, destId)) return { ok: false, error: 'Already unlocked' }
  if (profile.money < dest.cost) return { ok: false, error: 'Not enough Money' }
  profile.money -= dest.cost
  profile.unlocked.push(destId)
  return { ok: true, id: destId, cost: dest.cost }
}

/** Buys suit `suitId` for Money and puts it on. */
export function buySuit(profile, suitId) {
  const suit = SUITS.find((s) => s.id === suitId)
  if (!suit || suit.price === null) return { ok: false, error: 'Not for sale' }
  if (profile.ownedSuits.includes(suitId)) return { ok: false, error: 'Already owned' }
  if (profile.money < suit.price) return { ok: false, error: 'Not enough Money' }
  profile.money -= suit.price
  profile.ownedSuits.push(suitId)
  profile.suit = suitId
  return { ok: true, id: suitId }
}

// --- Oxygen -----------------------------------------------------------------------------

/** Seconds of air a full tank holds. */
export const oxygenCapacity = (profile) => tankById(profile.tank).seconds

/** Buys tank `tankId` (any bigger than yours) for Money, full. */
export function buyTank(profile, tankId) {
  const tank = OXYGEN_TANKS.find((t) => t.id === tankId)
  if (!tank) return { ok: false, error: 'No such tank' }
  if (tank.seconds <= oxygenCapacity(profile)) return { ok: false, error: 'Your tank is already that big' }
  if (profile.money < tank.price) return { ok: false, error: 'Not enough Money' }
  profile.money -= tank.price
  profile.tank = tank.id
  profile.oxygen = tank.seconds
  return { ok: true, id: tank.id }
}

/** Fills your tank at `place`'s Oxygen Store (for Money out on the planets). */
export function refillOxygen(profile, place) {
  const capacity = oxygenCapacity(profile)
  if (profile.oxygen >= capacity - 0.5) return { ok: false, error: 'Your tank is full' }
  const cost = refillCost(place)
  if (profile.money < cost) return { ok: false, error: 'Not enough Money' }
  profile.money -= cost
  profile.oxygen = capacity
  return { ok: true, cost }
}

export function equipSuit(profile, suitId) {
  if (!profile.ownedSuits.includes(suitId)) return { ok: false, error: 'Not owned' }
  profile.suit = suitId
  return { ok: true, id: suitId }
}

// --- Boxity Gems and rewarded ads ------------------------------------------------

/** Pays out a grant: `{ deliveries?, pass?, suit? }`. Returns what landed. */
export function applyGrant(profile, grant) {
  const result = { ok: true }
  let deliveries = grant.deliveries || 0
  if (grant.pass) {
    // A pass you already hold turns into Money of the same worth: nothing bought is wasted.
    if (profile.passes[grant.pass]) deliveries += 40
    else {
      profile.passes[grant.pass] = true
      result.pass = grant.pass
    }
  }
  if (grant.suit) {
    if (profile.ownedSuits.includes(grant.suit)) deliveries += 40
    else {
      profile.ownedSuits.push(grant.suit)
      profile.suit = grant.suit
      result.suit = grant.suit
    }
  }
  if (deliveries > 0) {
    result.money = Math.round(bestReward(profile) * deliveries)
    earn(profile, result.money)
  }
  return result
}

/** Grants Gems product `sku`, already paid for in Boxity. */
export function applyGemProduct(profile, sku) {
  const product = GEM_PRODUCTS[sku]
  if (!product) return { ok: false, error: 'Unknown product' }
  return { ...applyGrant(profile, product.grant), sku, name: product.name }
}

/** A rewarded ad's prize for `placement`, if it's off cooldown (`session.adAt`). */
export function applyAdReward(profile, session, placement, now) {
  const reward = AD_REWARDS[placement]
  if (!reward) return { ok: false, error: 'Unknown reward' }
  session.adAt = session.adAt || {}
  if (now - (session.adAt[placement] || 0) < reward.cooldownMs) return { ok: false, error: 'Not ready yet' }
  session.adAt[placement] = now
  return { ...applyGrant(profile, reward.grant), placement, label: reward.label }
}

// --- Badges -----------------------------------------------------------------------

export function awardBadge(profile, id) {
  if (!BADGES[id] || profile.badges.includes(id)) return null
  profile.badges.push(id)
  return { id, name: BADGES[id].name }
}

/** Badges a profile has just qualified for (not yet awarded). */
export function earnedBadges(profile) {
  const out = []
  const has = (place) => profile.visited.includes(place)
  if (profile.stats.deliveries > 0) out.push('firstDelivery')
  if (has(STATION)) out.push('orbit')
  if (has('moon')) out.push('moon')
  if (has('mars')) out.push('mars')
  if (['europa', 'io', 'ganymede', 'callisto'].every(has)) out.push('jupiter')
  if (has('titan')) out.push('titan')
  if (DESTINATIONS.every((d) => has(d.id))) out.push('grandTour')
  if (profile.stats.totalEarned >= TYCOON_MONEY) out.push('tycoon')
  return out.filter((id) => !profile.badges.includes(id))
}
