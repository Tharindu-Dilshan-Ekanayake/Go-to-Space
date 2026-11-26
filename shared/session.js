import { breathable, destinationById, EARTH, lastLaunchAt, PLACE_NAMES, STATION, TRIP_MS } from './balance.js'
import {
  applyAdReward,
  applyGemProduct,
  awardBadge,
  buySuit,
  canBeAt,
  createSession,
  deliverPackage,
  dropPackage,
  earnedBadges,
  equipSuit,
  pickUpPackage,
  unlockDestination,
  visit,
  buyTank,
  oxygenCapacity,
  refillOxygen,
} from './logic.js'
import { inZone, layoutOf } from './world.js'

/** How far outside a zone still counts as in it (network lag). */
const ZONE_SLACK = 1.5
/** Messages a player may send per second before the rest are ignored. */
const MAX_MESSAGES_PER_SECOND = 20

/**
 * One player's authoritative session: validates intents against where they really are,
 * runs the rocket schedule and their trips, and reports what happened through `emit`.
 *
 * Transport-agnostic on purpose. The Colyseus room wraps one of these per client; the
 * offline mode wraps one for the local player. Either way the rules that run are the
 * same.
 *
 * Events emitted (type, payload):
 * - 'profile'   { profile, session }  full state, after anything changes
 * - 'trip'      { from, to, via, duration }  you've left; arrive in `duration` ms
 * - 'arrive'    { place, first }  you're there
 * - 'delivered' { money, to, from }  a package delivered (the next one follows in 'profile')
 * - 'picked'    { to, reward }  a package picked up
 * - 'badge'     { id, name }
 * - 'reward'    { label, money? }  an ad reward or Gems purchase landed
 * - 'denied'    { reason }  an intent that was refused, worth telling the player about
 *
 * Host hooks: `onTrip(place)` when the player leaves for `place` (the room stops
 * validating their walk), `onArrive(place)` when they get there.
 */
export class PlayerSession {
  /**
   * @param {object} profile normalized profile (see logic.normalizeProfile)
   * @param {{ now: number, emit: (type: string, payload?: object) => void,
   *           getPosition: () => {x: number, y: number, z: number},
   *           onTrip?: (place: string) => void, onArrive?: (place: string) => void,
   *           rand?: () => number }} options
   */
  constructor(profile, { now, emit, getPosition, onTrip, onArrive, rand = Math.random }) {
    this.profile = profile
    this.session = createSession(now)
    this.emit = emit
    this.getPosition = getPosition
    this.onTrip = onTrip
    this.onArrive = onArrive
    this.rand = rand
    /** The trip under way: `{ from, to, via, arriveAt }`, or null. */
    this.trip = null
    /** When the last tick ran (rocket launches between two ticks are caught). */
    this.lastTickAt = now
    this.dirty = false
    this.budget = { second: Math.floor(now / 1000), count: 0 }
    visit(profile, profile.location)
  }

  // --- Plumbing --------------------------------------------------------------------

  sendProfile() {
    this.dirty = false
    this.emit('profile', { profile: this.profile, session: this.session })
  }

  /** Where the player is now; 'transit' while a trip is under way. */
  get place() {
    return this.trip ? 'transit' : this.profile.location
  }

  /** Whether the player stands in zone `name` of the place they're in. */
  at(name) {
    if (this.trip) return false
    const p = this.getPosition()
    return Boolean(p) && inZone(this.profile.location, name, p.x, p.z, ZONE_SLACK)
  }

  deny(reason) {
    this.emit('denied', { reason })
  }

  checkBadges() {
    for (const id of earnedBadges(this.profile)) {
      const badge = awardBadge(this.profile, id)
      if (badge) this.emit('badge', badge)
    }
  }

  /** Too many messages this second: drop the rest (a stuck key, or someone scripting). */
  overBudget(now) {
    const second = Math.floor(now / 1000)
    if (second !== this.budget.second) this.budget = { second, count: 0 }
    this.budget.count += 1
    return this.budget.count > MAX_MESSAGES_PER_SECOND
  }

  // --- Intents ---------------------------------------------------------------------

  /** Handles one message from the player. Unknown or malformed ones are ignored. */
  handle(type, payload = {}, now) {
    if (this.overBudget(now)) return
    const profile = this.profile
    const data = payload && typeof payload === 'object' ? payload : {}
    switch (type) {
      case 'cargo':
        return this.cargo()
      case 'dropPackage':
        if (dropPackage(profile).ok) this.sendProfile()
        return
      case 'travel':
        return this.travel(String(data.to || ''), String(data.via || ''), now)
      case 'unlock': {
        const result = unlockDestination(profile, String(data.id || ''))
        if (!result.ok) return this.deny(result.error)
        this.sendProfile()
        return
      }
      case 'buySuit': {
        // Only at the suit shop (it's on Earth).
        if (!this.at('suits')) return this.deny('Visit the Suit Shop on Earth')
        const result = buySuit(profile, String(data.id || ''))
        if (!result.ok) return this.deny(result.error)
        this.sendProfile()
        return
      }
      case 'buyTank': {
        // At any Oxygen Store.
        if (!this.at('o2')) return this.deny('Visit an Oxygen Store')
        const result = buyTank(profile, String(data.id || ''))
        if (!result.ok) return this.deny(result.error)
        this.emit('oxygen', { refilled: true, tank: result.id })
        this.sendProfile()
        return
      }
      case 'refillOxygen': {
        if (!this.at('o2')) return this.deny('Visit an Oxygen Store')
        const result = refillOxygen(profile, profile.location)
        if (!result.ok) return this.deny(result.error)
        this.emit('oxygen', { refilled: true, cost: result.cost })
        this.sendProfile()
        return
      }
      case 'equipSuit': {
        if (equipSuit(profile, String(data.id || '')).ok) this.sendProfile()
        return
      }
      default:
    }
  }

  /** At a Cargo Pad: deliver the package if it's for here, then take the next one. */
  cargo() {
    if (!this.at('cargo')) return
    const profile = this.profile
    const place = profile.location
    if (profile.package) {
      if (profile.package.to !== place) return
      const delivered = deliverPackage(profile, place)
      if (!delivered.ok) return
      this.emit('delivered', delivered)
    }
    const picked = pickUpPackage(profile, place, this.rand)
    if (picked.ok) this.emit('picked', picked.package)
    this.checkBadges()
    this.sendProfile()
  }

  /**
   * Sets off for `to` by `via`, if that's a trip you can make from where you're
   * standing: a shuttle bay or the beacon for a shuttle, the re-entry pod down to Earth,
   * or a Star Map warp to anywhere you've been. (The rocket isn't asked for: it leaves
   * on its schedule, with whoever's aboard - see tick.)
   */
  travel(to, via, now) {
    if (this.trip) return
    const profile = this.profile
    const from = profile.location
    if (to === from) return
    if (!canBeAt(profile, to)) return this.deny('Unlock it on the Star Map first')
    let ok = false
    if (via === 'warp') {
      ok = profile.visited.includes(to)
      if (!ok) return this.deny(`Visit ${PLACE_NAMES[to] || to} once first, then you can warp there`)
    } else if (via === 'shuttle') {
      if (from === STATION && destinationById(to)) {
        ok = this.at(`bay:${to}`)
      } else if (to === STATION && destinationById(from)) {
        ok = this.at('beacon')
      }
    } else if (via === 'pod') {
      ok = from === STATION && to === EARTH && this.at('pod')
    }
    if (ok) this.startTrip(to, via, now)
  }

  startTrip(to, via, now) {
    const from = this.profile.location
    const duration = TRIP_MS[via] ?? TRIP_MS.warp
    this.trip = { from, to, via, arriveAt: now + duration }
    this.profile.location = to
    if (via === 'rocket') this.profile.stats.launches += 1
    this.onTrip?.(to)
    this.emit('trip', { from, to, via, duration })
    this.sendProfile()
  }

  arrive() {
    const place = this.trip.to
    this.trip = null
    const first = visit(this.profile, place)
    this.onArrive?.(place)
    this.emit('arrive', { place, first })
    this.checkBadges()
    this.sendProfile()
  }

  // --- Boxity grants (verified by the host first) ------------------------------------

  /** Pays a rewarded ad Boxity confirmed. Returns the result (`ok` false when on cooldown). */
  grantAdReward(placement, now) {
    const result = applyAdReward(this.profile, this.session, placement, now)
    if (!result.ok) return result
    this.emit('reward', { label: result.label, money: result.money })
    this.sendProfile()
    return result
  }

  /** Grants a Gems purchase Boxity confirmed. Returns the result. */
  grantGemProduct(sku) {
    const result = applyGemProduct(this.profile, sku)
    if (!result.ok) return result
    this.emit('reward', { label: result.name, money: result.money })
    this.checkBadges()
    this.sendProfile()
    return result
  }

  // --- Time --------------------------------------------------------------------------

  /** Runs ~10 times a second: playtime, arrivals, and the Earth rocket's launches. */
  tick(dt, now) {
    const profile = this.profile
    profile.stats.playtime += dt
    if (this.trip && now >= this.trip.arriveAt) this.arrive()

    // A launch since the last tick: everyone in the boarding ring rides it up.
    const launch = lastLaunchAt(now)
    if (launch > this.lastTickAt && !this.trip && profile.location === EARTH && this.at('boarding')) {
      // No suit, no space: there's nothing to breathe up there.
      if (profile.suit === 'none') this.deny('Put on a space suit first - a free one waits at the Suit Shop')
      else this.startTrip(STATION, 'rocket', now)
    }
    this.lastTickAt = now
    this.breathe(dt, now)
    if (this.dirty) this.sendProfile()
  }

  /**
   * Oxygen: full where there's air, running down a second a second everywhere else
   * (not while flying: the craft has air). Run dry and the rescue shuttle takes you up
   * to Halo Station. The client counts down between updates; it's told every few
   * seconds, and at once when something changes.
   */
  breathe(dt, now) {
    const profile = this.profile
    if (this.trip) return
    const capacity = oxygenCapacity(profile)
    // Air on Earth and the station, and in a planet's safe room.
    if (breathable(profile.location) || this.at('safe')) {
      if (profile.oxygen < capacity) {
        profile.oxygen = capacity
        this.dirty = true
      }
      return
    }
    const before = profile.oxygen
    profile.oxygen = Math.max(0, profile.oxygen - dt)
    if (Math.floor(before / 5) !== Math.floor(profile.oxygen / 5)) this.dirty = true
    if (profile.oxygen <= 0) {
      this.emit('oxygen', { empty: true })
      this.startTrip(STATION, 'rescue', now)
    }
  }
}

/** Where a player arriving at `place` appears. */
export function arrivalPoint(place) {
  const { spawn, spawnYaw } = layoutOf(place)
  return { x: spawn.x, z: spawn.z, yaw: spawnYaw }
}
