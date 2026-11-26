import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DESTINATIONS, GEM_PRODUCTS, LAUNCH_CYCLE_MS, msToLaunch, refillCost, SUIT_FAIL_MS, suitById, tankById, TRIP_MS } from '../../shared/balance.js'
import { formatNumber } from '../../shared/format.js'
import {
  applyAdReward,
  applyGemProduct,
  bestReward,
  buySuit,
  cargoPlaces,
  buyProduct,
  createProfile,
  createSession,
  deliverPackage,
  normalizeProfile,
  pickUpPackage,
  routeReward,
  unlockDestination,
} from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { BAYS, groundHeightAt, inZone, jetPad, jetSeats, jetsOf, layoutOf, LAUNCH_PAD, OXYGEN_STORES, SAFE_ROOM } from '../../shared/world.js'

/** A session for `profile` standing at `pos` (a mutable { x, z }), recording its events. */
function sessionAt(profile, pos, now = 1_000) {
  const events = []
  const session = new PlayerSession(profile, { now, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos, rand: () => 0 })
  return { session, events, types: () => events.map((e) => e.type) }
}

/** Where zone `name` of `place` is. */
const zone = (place, name) => {
  const z = layoutOf(place).zones[name]
  return { x: z.x, z: z.z }
}

test('numbers format like the HUD', () => {
  assert.equal(formatNumber(950), '950')
  assert.equal(formatNumber(1234), '1.2K')
  assert.equal(formatNumber(2_500_000), '2.5M')
})

test('destinations get dearer and pay more the further out they are', () => {
  for (let i = 1; i < DESTINATIONS.length; i += 1) {
    assert.ok(DESTINATIONS[i].cost > DESTINATIONS[i - 1].cost, DESTINATIONS[i].id)
    assert.ok(DESTINATIONS[i].reward > DESTINATIONS[i - 1].reward, DESTINATIONS[i].id)
  }
  assert.equal(DESTINATIONS[0].cost, 0, 'the Moon is open from the start')
})

test('a new player can send packages between Earth and the Moon only', () => {
  const p = createProfile('a', 'A')
  assert.deepEqual(cargoPlaces(p), ['earth', 'moon'])
  const picked = pickUpPackage(p, 'earth', () => 0.5)
  assert.equal(picked.ok, true)
  assert.deepEqual(p.package, { from: 'earth', to: 'moon', reward: 40 })
  assert.equal(pickUpPackage(p, 'earth').ok, false, 'one package at a time')
})

test('a package pays at its destination only, times your suit', () => {
  const p = createProfile('a', 'A')
  pickUpPackage(p, 'earth', () => 0)
  assert.equal(deliverPackage(p, 'mars').ok, false)
  assert.equal(deliverPackage(p, 'moon').money, 40)
  assert.equal(p.money, 40)
  assert.equal(p.stats.deliveries, 1)
  assert.equal(p.package, null)

  p.ownedSuits.push('scout')
  p.suit = 'scout'
  pickUpPackage(p, 'moon', () => 0)
  assert.equal(p.package.to, 'earth')
  assert.equal(deliverPackage(p, 'earth').money, Math.round(40 * suitById('scout').mult))
})

test('a route pays the rate of its further end', () => {
  assert.equal(routeReward('earth', 'moon'), 40)
  assert.equal(routeReward('mars', 'moon'), 110)
  assert.equal(routeReward('titan', 'earth'), 7500)
})

test('unlocking a destination costs Money and opens new routes', () => {
  const p = createProfile('a', 'A')
  assert.equal(unlockDestination(p, 'mars').ok, false, 'too poor')
  p.money = 600
  assert.equal(unlockDestination(p, 'mars').ok, true)
  assert.equal(p.money, 100)
  assert.deepEqual(cargoPlaces(p), ['earth', 'moon', 'mars'])
  assert.equal(bestReward(p), 110)
  assert.equal(unlockDestination(p, 'mars').ok, false, 'only once')
})

test('suits are bought with Money and put straight on - Solar Gold too, when you can afford it', () => {
  const p = createProfile('a', 'A')
  p.money = 300
  assert.equal(buySuit(p, 'scout').ok, true)
  assert.equal(p.suit, 'scout')
  assert.equal(p.money, 0)
  assert.equal(buySuit(p, 'solar').ok, false)
})

test('nothing is sold for Gems: x2 Money and Solar Gold are bought with Money', () => {
  const p = createProfile('a', 'A')
  assert.equal(Object.keys(GEM_PRODUCTS).length, 0)
  assert.equal(applyGemProduct(p, 'money_x2').ok, false, 'an old Gems sku grants nothing')
  p.money = 250000
  assert.equal(buyProduct(p, 'money_x2').ok, true)
  assert.equal(p.money, 0)
  assert.equal(p.passes.moneyX2, true)
  assert.equal(buyProduct(p, 'money_x2').ok, false, 'once is enough')
  pickUpPackage(p, 'earth', () => 0)
  assert.equal(deliverPackage(p, 'moon').money, 80, 'x2 Money doubles pay')
  p.money = suitById('solar').price
  assert.equal(buySuit(p, 'solar').ok, true)
  assert.equal(p.suit, 'solar')
})

test('ad rewards have a cooldown per placement', () => {
  const p = createProfile('a', 'A')
  const t = 1_700_000_000_000
  const s = createSession(t)
  assert.equal(applyAdReward(p, s, 'cargo-bonus', t).ok, true)
  assert.equal(applyAdReward(p, s, 'cargo-bonus', t + 1000).ok, false)
  assert.equal(applyAdReward(p, s, 'cargo-bonus', t + 3 * 60 * 1000).ok, true)
})

test('old, corrupt or foreign saves load as a fresh profile; bad fields are dropped', () => {
  assert.equal(normalizeProfile({ wins: 99, rebirths: 4 }, 'a', 'A').money, 0, 'a save from another game version')
  assert.equal(normalizeProfile('junk', 'a', 'A').location, 'earth')
  const fresh = createProfile('a', 'A')
  const raw = { ...fresh, money: -5, location: 'titan', suit: 'eclipse', unlocked: ['moon', 'pluto'], package: { from: 'earth', to: 'moon', reward: 'lots' } }
  const p = normalizeProfile(raw, 'a', 'A')
  assert.equal(p.money, 0)
  assert.equal(p.location, 'earth', 'Titan is locked, so you start back on Earth')
  assert.equal(p.suit, 'none', 'a suit you do not own')
  assert.deepEqual(p.unlocked, ['moon'])
  assert.equal(p.package, null)
})

test('the rocket leaves on a fixed schedule', () => {
  assert.equal(msToLaunch(0), 0)
  assert.equal(msToLaunch(1000), LAUNCH_CYCLE_MS - 1000)
  assert.equal(msToLaunch(LAUNCH_CYCLE_MS - 1), 1)
})

test('the Cargo Pad only works when you really stand on it', () => {
  const p = createProfile('a', 'A')
  const pos = { x: 0, z: 30 }
  const { session, types } = sessionAt(p, pos)
  session.handle('cargo', {}, 1_000)
  assert.equal(p.package, null, 'far from the pad')
  Object.assign(pos, zone('earth', 'cargo'))
  session.handle('cargo', {}, 1_100)
  assert.equal(p.package.to, 'moon')
  assert.ok(types().includes('picked'))
})

test('stepping on the destination pad delivers and hands you the next package', () => {
  const p = createProfile('a', 'A')
  p.location = 'moon'
  p.package = { from: 'earth', to: 'moon', reward: 40 }
  const { session, types } = sessionAt(p, zone('moon', 'cargo'))
  session.handle('cargo', {}, 1_000)
  assert.equal(p.money, 40)
  assert.deepEqual(p.package, { from: 'moon', to: 'earth', reward: 40 })
  assert.deepEqual(types().slice(0, 2), ['delivered', 'picked'])
  assert.ok(p.badges.includes('firstDelivery'))
})

test('whoever stands in the boarding ring at launch rides the rocket to Halo Station', () => {
  const p = createProfile('a', 'A')
  p.ownedSuits = ['rookie']
  p.suit = 'rookie'
  const pos = zone('earth', 'boarding')
  const { session, types } = sessionAt(p, pos, LAUNCH_CYCLE_MS - 500)
  assert.ok(groundHeightAt('earth', pos.x, pos.z) > 1, 'the ring is up on the pad deck')
  session.tick(0.1, LAUNCH_CYCLE_MS - 100)
  assert.equal(p.location, 'earth', 'not yet')
  session.tick(0.1, LAUNCH_CYCLE_MS + 50)
  assert.equal(p.location, 'station')
  assert.equal(session.place, 'transit')
  assert.ok(types().includes('trip'))
  session.tick(0.1, LAUNCH_CYCLE_MS + 50 + TRIP_MS.rocket)
  assert.equal(session.place, 'station')
  assert.ok(p.visited.includes('station'))
  assert.ok(p.badges.includes('orbit'))
})

test('missing the ring at launch leaves you on the ground', () => {
  const p = createProfile('a', 'A')
  const { session } = sessionAt(p, { x: 0, z: 30 }, LAUNCH_CYCLE_MS - 500)
  session.tick(0.1, LAUNCH_CYCLE_MS + 50)
  assert.equal(p.location, 'earth')
})

test('shuttles leave from their bay, and only to unlocked destinations', () => {
  const p = createProfile('a', 'A')
  p.location = 'station'
  const mars = BAYS.find((b) => b.id === 'mars')
  const moon = BAYS.find((b) => b.id === 'moon')
  const pos = { x: mars.x, z: mars.z }
  const { session, events } = sessionAt(p, pos)
  session.handle('travel', { to: 'mars', via: 'shuttle' }, 1_000)
  assert.equal(p.location, 'station', 'Mars is locked')
  assert.equal(events.at(-1).type, 'denied')
  session.handle('travel', { to: 'moon', via: 'shuttle' }, 1_100)
  assert.equal(p.location, 'station', 'standing at the wrong bay')
  Object.assign(pos, { x: moon.x, z: moon.z })
  session.handle('travel', { to: 'moon', via: 'shuttle' }, 1_200)
  assert.equal(p.location, 'moon')
  session.handle('travel', { to: 'earth', via: 'warp' }, 1_300)
  assert.equal(p.location, 'moon', 'no new trip mid-flight')
})

test('the beacon flies you back up, the pod takes you home', () => {
  const p = createProfile('a', 'A')
  p.location = 'moon'
  const pos = zone('moon', 'beacon')
  const { session } = sessionAt(p, pos)
  session.handle('travel', { to: 'station', via: 'shuttle' }, 1_000)
  assert.equal(p.location, 'station')
  session.tick(0.1, 1_000 + TRIP_MS.shuttle)
  Object.assign(pos, zone('station', 'pod'))
  session.handle('travel', { to: 'earth', via: 'pod' }, 9_000)
  assert.equal(p.location, 'earth')
})

test('there is no warping: even to a place you have been, every trip is flown', () => {
  const p = createProfile('a', 'A')
  const { session, events } = sessionAt(p, { x: 0, z: 30 })
  session.handle('travel', { to: 'moon', via: 'warp' }, 1_000)
  assert.equal(p.location, 'earth')
  assert.equal(events.at(-1).type, 'denied')
  p.visited.push('moon', 'station')
  session.handle('travel', { to: 'moon', via: 'warp' }, 1_100)
  session.handle('travel', { to: 'station', via: 'warp' }, 1_200)
  assert.equal(p.location, 'earth')
})

test('suits can only be bought at the Suit Shop', () => {
  const p = createProfile('a', 'A')
  p.money = 1000
  const pos = { x: 0, z: 30 }
  const { session } = sessionAt(p, pos)
  session.handle('buySuit', { id: 'scout' }, 1_000)
  assert.equal(p.suit, 'none')
  Object.assign(pos, zone('earth', 'suits'))
  session.handle('buySuit', { id: 'scout' }, 1_100)
  assert.equal(p.suit, 'scout')
})

test('ads and Gems are granted by the host only, never by a client message', () => {
  const p = createProfile('a', 'A')
  const { session } = sessionAt(p, { x: 0, z: 30 })
  session.handle('adReward', { placement: 'cargo-bonus' }, 1_000)
  session.handle('gemsLocal', { sku: 'money_big' }, 1_000)
  session.handle('grantGemProduct', { sku: 'money_big' }, 1_000)
  assert.equal(p.money, 0)
})

test('a flood of messages is cut off', () => {
  const p = createProfile('a', 'A')
  p.money = 1_000_000
  const { session } = sessionAt(p, { x: 0, z: 30 })
  for (let i = 0; i < 100; i += 1) session.handle('unlock', { id: DESTINATIONS[1 + (i % 8)].id }, 5_000)
  assert.ok(p.unlocked.length <= 21)
})

test('zones are where the layout says', () => {
  assert.ok(inZone('station', 'pod', -40, 28))
  assert.equal(BAYS.length, DESTINATIONS.length)
  assert.ok(LAUNCH_PAD.height > 0)
})

test('every parked jet can be boarded: its ring is on open, walkable deck', () => {
  for (const place of ['earth', 'station', 'moon']) {
    const layout = layoutOf(place)
    for (const jet of jetsOf(place)) {
      const pad = jetPad(jet)
      const blocked = layout.colliders.some((r) => pad.x > r.minX && pad.x < r.maxX && pad.z > r.minZ && pad.z < r.maxZ)
      assert.ok(!blocked, `${place} jet ring at ${pad.x},${pad.z} is inside a collider`)
      const b = layout.bounds
      assert.ok(pad.x > b.minX && pad.x < b.maxX && pad.z > b.minZ && pad.z < b.maxZ, `${place} jet ring is off the walkable area`)
      assert.equal(jetSeats(jet).length, jet.kind === 'liner' ? 16 : 2)
    }
  }
})

test('oxygen runs down on a planet, refills where there is air, and runs out into a rescue', () => {
  const profile = createProfile('o2', 'Breather')
  profile.location = 'moon'
  const { session, events } = sessionAt(profile, OXYGEN_STORES.surface)
  const full = tankById('starter').seconds
  session.tick(10, 2_000)
  assert.ok(Math.abs(profile.oxygen - (full - 10)) < 1e-6)
  // Out of air: the rescue shuttle to Halo Station, package kept.
  profile.package = { from: 'earth', to: 'moon', reward: 40 }
  session.tick(full, 3_000)
  assert.equal(session.trip?.via, 'rescue')
  assert.equal(session.trip?.to, 'station')
  assert.ok(events.some((e) => e.type === 'oxygen' && e.payload.empty))
  session.tick(0.1, 3_000 + TRIP_MS.rescue + 1)
  assert.equal(profile.location, 'station')
  session.tick(0.1, 3_000 + TRIP_MS.rescue + 2)
  assert.equal(profile.oxygen, full)
  assert.ok(profile.package)
})

test('oxygen tanks are bought bigger at an Oxygen Store, and planet refills cost Money', () => {
  const profile = createProfile('o2b', 'Buyer')
  profile.location = 'moon'
  profile.money = 1000
  const { session } = sessionAt(profile, OXYGEN_STORES.surface)
  session.handle('buyTank', { id: 'standard' }, 5_000)
  assert.equal(profile.tank, 'standard')
  assert.equal(profile.money, 600)
  assert.equal(profile.oxygen, 150)
  session.handle('buyTank', { id: 'starter' }, 6_000)
  assert.equal(profile.tank, 'standard')
  profile.oxygen = 20
  session.handle('refillOxygen', {}, 7_000)
  assert.equal(profile.oxygen, 150)
  assert.equal(profile.money, 600 - refillCost('moon'))
  // Away from the store: no sale.
  const away = sessionAt(profile, { x: 30, y: 0, z: 30 })
  profile.oxygen = 10
  away.session.handle('refillOxygen', {}, 8_000)
  assert.equal(profile.oxygen, 10)
})

test('everyone starts without a suit: the Rookie suit is free at the shop, and the rocket needs one', () => {
  const p = createProfile('ns', 'NoSuit')
  assert.equal(p.suit, 'none')
  assert.deepEqual(p.ownedSuits, [])
  // In the boarding ring at liftoff without a suit: left behind, and told why.
  const ring = zone('earth', 'boarding')
  const { session, events } = sessionAt(p, ring, LAUNCH_CYCLE_MS - 50)
  session.tick(0.1, LAUNCH_CYCLE_MS + 50)
  assert.equal(session.trip, null)
  assert.ok(events.some((e) => e.type === 'denied'))
  // The free suit, at the Suit Shop.
  const shop = sessionAt(p, zone('earth', 'suits'))
  shop.session.handle('buySuit', { id: 'rookie' }, 2_000)
  assert.equal(p.suit, 'rookie')
  assert.equal(p.money, 0)
  // Now the rocket takes you.
  const again = sessionAt(p, ring, 2 * LAUNCH_CYCLE_MS - 50)
  again.session.tick(0.1, 2 * LAUNCH_CYCLE_MS + 50)
  assert.equal(again.session.trip?.via, 'rocket')
})

test('a planet safe room has air: oxygen refills inside it', () => {
  const profile = createProfile('safe', 'Safe')
  profile.location = 'mars'
  profile.oxygen = 10
  const { session } = sessionAt(profile, { x: SAFE_ROOM.x, y: 0, z: SAFE_ROOM.z })
  session.tick(1, 2_000)
  assert.equal(profile.oxygen, tankById('starter').seconds)
  // Step outside and it runs down again.
  const out = sessionAt(profile, { x: 0, y: 0, z: 18 })
  out.session.tick(5, 3_000)
  assert.ok(profile.oxygen < tankById('starter').seconds)
})

test('a planet kills a suit too weak for it: back to the Earth lobby, package kept', () => {
  const profile = createProfile('weak', 'Weak')
  profile.ownedSuits = ['rookie', 'scout']
  profile.suit = 'rookie'
  profile.unlocked = ['moon', 'mars', 'venus']
  profile.location = 'station'
  profile.package = { from: 'earth', to: 'venus', reward: 220 }
  const pos = { ...zone('station', 'bay:venus') }
  const { session, events } = sessionAt(profile, pos)
  session.handle('travel', { to: 'venus', via: 'shuttle' }, 1_000)
  assert.equal(session.trip?.to, 'venus')
  assert.ok(events.some((e) => e.type === 'suitWarning' && e.payload.need === 'Scout'))
  session.tick(0.1, 1_000 + TRIP_MS.shuttle + 1)
  assert.equal(profile.location, 'venus')
  assert.ok(events.some((e) => e.type === 'suitFailing'))
  session.tick(0.1, 1_000 + TRIP_MS.shuttle + SUIT_FAIL_MS + 10)
  assert.equal(profile.location, 'earth')
  assert.ok(events.some((e) => e.type === 'died'))
  assert.ok(profile.package, 'the package survives')
})

test('putting on a good enough suit in time saves you', () => {
  const profile = createProfile('swap', 'Swap')
  profile.ownedSuits = ['rookie', 'scout']
  profile.suit = 'rookie'
  profile.unlocked = ['moon', 'venus']
  profile.location = 'station'
  const { session, events } = sessionAt(profile, { ...zone('station', 'bay:venus') })
  session.handle('travel', { to: 'venus', via: 'shuttle' }, 1_000)
  session.tick(0.1, 1_000 + TRIP_MS.shuttle + 1)
  session.handle('equipSuit', { id: 'scout' }, 1_000 + TRIP_MS.shuttle + 100)
  session.tick(0.1, 1_000 + TRIP_MS.shuttle + SUIT_FAIL_MS + 10)
  assert.equal(profile.location, 'venus')
  assert.ok(events.some((e) => e.type === 'suitOk'))
})

test('the first-time guide follows the first round trip, step by step', () => {
  const p = createProfile('new', 'New')
  assert.equal(p.guide, 0)
  const pos = { ...zone('earth', 'suits') }
  const { session } = sessionAt(p, pos, LAUNCH_CYCLE_MS - 50)
  session.handle('buySuit', { id: 'rookie' }, LAUNCH_CYCLE_MS - 40)
  assert.equal(p.guide, 1)
  Object.assign(pos, zone('earth', 'cargo'))
  session.handle('cargo', {}, LAUNCH_CYCLE_MS - 30)
  assert.equal(p.guide, 2)
  Object.assign(pos, zone('earth', 'boarding'))
  session.tick(0.1, LAUNCH_CYCLE_MS + 10)
  assert.equal(p.guide, 3)
  let t = LAUNCH_CYCLE_MS + TRIP_MS.rocket + 20
  session.tick(0.1, t)
  Object.assign(pos, zone('station', 'bay:moon'))
  session.handle('travel', { to: 'moon', via: 'shuttle' }, t + 1)
  assert.equal(p.guide, 4)
  t += TRIP_MS.shuttle + 10
  session.tick(0.1, t)
  Object.assign(pos, zone('moon', 'cargo'))
  session.handle('cargo', {}, t + 1)
  assert.equal(p.guide, 5)
  Object.assign(pos, zone('moon', 'beacon'))
  session.handle('travel', { to: 'station', via: 'shuttle' }, t + 2)
  assert.equal(p.guide, 6)
  t += TRIP_MS.shuttle + 10
  session.tick(0.1, t)
  Object.assign(pos, zone('station', 'pod'))
  session.handle('travel', { to: 'earth', via: 'pod' }, t + 1)
  assert.equal(p.guide, 7)
})
