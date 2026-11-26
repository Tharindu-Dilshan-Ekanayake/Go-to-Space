import { create } from 'zustand'

import { createProfile, createSession } from '@shared/logic'

/**
 * Everything the UI renders from. Written by the network layer (profile, events) and
 * the 10 Hz game ticker (zones) - never from a frame loop.
 *
 * Components must select narrowly (`useGame((s) => s.profile.money)`), so a Money change
 * re-renders the Money counter and nothing else.
 */
export const useGame = create((set) => ({
  /** Authoritative copy of the player's save, as last sent by the server. */
  profile: createProfile('local', 'Player'),
  /** Per-connection state. */
  session: createSession(Date.now()),
  /** True once the first real profile has arrived. */
  profileLoaded: false,
  /** True once the game is on screen; non-essential start-up work waits for it. */
  playable: false,

  net: {
    /** 'connecting' | 'online' | 'offline' */
    mode: 'connecting',
    lobbyId: null,
    /** Short code friends join with, for private lobbies. */
    code: null,
    isPrivate: false,
    players: 1,
    maxPlayers: 16,
    message: null,
  },
  leaderboards: null,
  /**
   * Server clock minus ours, in ms. The rocket leaves on the server's clock; adding this
   * to Date.now() puts our countdown on it too.
   */
  clockOffset: 0,

  /**
   * The trip under way, or null: `{ from, to, via, duration, startedAt }` (`startedAt` is
   * performance.now()). While it's set the flight scene plays instead of a place.
   */
  trip: null,

  /** The zone of the current place you're standing in ('cargo', 'bay:mars', ...), or null. */
  zone: null,

  /** Which modal panel is open: 'map' | 'suits' | 'store' | 'settings' | 'leaderboards'. */
  panel: null,
  /** Extra data for the open panel (e.g. which destination the map should focus). */
  panelData: null,

  /** A short celebration banner: { text, id, tone } (tone: 'good' | 'info' | 'bad'). */
  toast: null,
  /** A suit too weak for where you are: `{ need, until }` (performance.now ms), or null. */
  hazard: null,

  // --- Actions -----------------------------------------------------------------

  /** `oxygenAt`: when the profile (and its oxygen reading) came in - the HUD counts down from there. */
  setProfile: (profile, session) => set((s) => ({ profile, session: session || s.session, profileLoaded: true, oxygenAt: performance.now() })),
  setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),
  setZone: (zone) => set({ zone }),
  setPlayable: () => set({ playable: true }),
  setLeaderboards: (leaderboards) => set({ leaderboards }),
  setClockOffset: (clockOffset) => set({ clockOffset }),
  setTrip: (trip) => set({ trip }),

  openPanel: (panel, panelData = null) => set({ panel, panelData }),
  closePanel: () => set({ panel: null, panelData: null }),
  togglePanel: (panel) => set((s) => (s.panel === panel ? { panel: null, panelData: null } : { panel, panelData: null })),

  showToast: (text, tone = 'good') => set({ toast: { text, tone, id: Date.now() } }),
}))

/** Non-reactive snapshot for timers and non-React code. */
export const getGame = () => useGame.getState()

/** The server's idea of now: what the rocket schedule runs on. */
export const serverNow = () => Date.now() + useGame.getState().clockOffset

/** The place whose scene is on screen: where you are, or 'transit' while you fly. */
export const useScenePlace = () => useGame((s) => (s.trip ? 'transit' : s.profile.location))
