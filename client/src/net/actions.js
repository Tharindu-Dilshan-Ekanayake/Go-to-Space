/**
 * Player intents. The UI never changes game state itself: it calls one of these, the
 * authority (the Colyseus room, or the offline stand-in) validates it, and the result
 * comes back as an updated profile or an event.
 */

let transport = null

/** Installs the active connection: `{ send(type, payload) }`. */
export function setTransport(next) {
  transport = next
}

export function send(type, payload) {
  if (!transport) return
  transport.send(type, payload)
}

export const actions = {
  /** At a Cargo Pad: deliver what you carry if it's for here, and take the next package. */
  cargo: () => send('cargo'),
  dropPackage: () => send('dropPackage'),
  /**
   * Sets off for `to`: `via` 'shuttle' (from a bay or the beacon), 'pod' (station down to
   * Earth) - there's no warping. The rocket isn't asked
   * for: it leaves on schedule with whoever stands in the boarding ring.
   */
  travel: (to, via) => send('travel', { to, via }),
  unlock: (id) => send('unlock', { id }),
  buySuit: (id) => send('buySuit', { id }),
  equipSuit: (id) => send('equipSuit', { id }),
  /** At an Oxygen Store: a bigger tank, or a refill. */
  buyTank: (id) => send('buyTank', { id }),
  refillOxygen: () => send('refillOxygen', {}),
  /** Turns the first-time guide off. */
  skipGuide: () => send('skipGuide', {}),
  /** A Store product (balance MONEY_PRODUCTS), for Money. */
  buyProduct: (id) => send('buyProduct', { id }),
  /** A rewarded ad Boxity says was watched; the server verifies the token. */
  adReward: (placement, rewardToken) => send('adReward', { placement, rewardToken }),
  /** Asks the server to apply any Gems purchases Boxity has confirmed. */
  gemsCheck: () => send('gemsCheck'),
}
