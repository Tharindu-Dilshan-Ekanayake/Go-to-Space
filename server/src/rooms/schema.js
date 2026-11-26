import { schema, t } from '@colyseus/schema'

/**
 * Synced state, kept deliberately small: only what other players need to draw you.
 * Everything private (inventory, items, boosts...) goes to its owner alone as
 * 'profile' messages, never through the shared state.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    /** Their verified Boxity account id ('' for guests), so chat can be matched to them. */
    uid: t.string(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    rotY: t.float32(),
    /** 'idle' | 'walk' | 'jump' | 'fly' (jetpack) | 'emote:<Boxity emote id>' */
    anim: t.string(),
    /** What their Bloxity avatar wears, as JSON `{ equipped, proportions }` ('' = base). */
    look: t.string(),
    /** Their space suit (balance SUITS id). */
    suit: t.string(),
    /** Where they are: 'earth', 'station', a destination id, or 'transit' mid-trip. Players only see others in the same place. */
    place: t.string(),
    /** Whether they're carrying a package (drawn on their back). */
    carrying: t.boolean(),
    money: t.float64(),
    deliveries: t.uint32(),
  },
  'PlayerState',
)

export const GameState = schema(
  {
    /** sessionId -> player */
    players: t.map(PlayerState),
    /** Short code for private lobbies ('' for public ones). */
    code: t.string(),
    isPrivate: t.boolean(),
  },
  'GameState',
)
