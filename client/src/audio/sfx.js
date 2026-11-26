import { useQuality } from '../store/quality'
import { createMusic } from './music'

/**
 * Sound effects and the background music, synthesised with WebAudio: no audio files to
 * download.
 *
 * Browsers only allow audio after a user gesture. The audio engine (AudioContext, echo,
 * noise, music) is built while the game loads (prepareAudio), where it costs nothing
 * anyone sees - built on the first tap instead, it froze whatever that tap did. It
 * starts suspended; the first tap/click/key resumes it and starts the music, and every
 * sound before that is silently skipped.
 */

const MUTE_KEY = 'pp.muted'
/** Master gain at full volume; everything is mixed to sit under this. */
const BASE_GAIN = 0.5

let ctx = null
let master = null
/** Input of the echo the chimes ring out into (see createEcho). */
let echo = null
let noiseBuffer = null
let music = null
/** The player's own mute button (persisted). */
let muted = readMuted()
/**
 * Muted for a Boxity ad break. Kept apart from `muted` so the break ending restores
 * whatever the player had chosen, never overwrites it.
 */
let adMuted = false
/** Boxity's master_volume / music_volume settings, 0..1 (not persisted: Boxity keeps them). */
let masterVolume = 1
let musicVolume = 1
const lastPlayed = new Map()
const muteListeners = new Set()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

const silent = () => muted || adMuted

function applyMaster() {
  if (master) master.gain.value = silent() ? 0 : BASE_GAIN * masterVolume
}

/**
 * Builds the audio engine, suspended: the context, the master gain, the echo, the noise
 * and the music. Call while loading (GameScene does); the first gesture then only has
 * to resume it. Safe to call again.
 */
export function prepareAudio() {
  if (ctx) return
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return
  ctx = new Ctor()
  // Created outside a gesture it starts suspended anyway; make sure of it until a tap.
  if (ctx.state === 'running') ctx.suspend()
  master = ctx.createGain()
  applyMaster()
  master.connect(ctx.destination)
  echo = createEcho()
  // One second of white noise, reused by every whoosh and crack.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  music = createMusic(ctx, master, noiseBuffer)
  music.setVolume(musicVolume)
}

/** Low-end devices (the LOW preset) get the lighter version of the busiest sounds. */
const lite = () => useQuality.getState().level === 'LOW'

let musicStarted = false
function unlock() {
  // Built already while loading, normally; on the spot if a tap beat it to it.
  prepareAudio()
  if (!ctx) return
  if (!musicStarted) {
    musicStarted = true
    music.start()
  }
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended') ctx.resume()
}

/**
 * A short, darkening echo for the chimes to ring out into, so they sparkle instead of
 * clicking off. Built once; every sound sent to it shares it.
 */
function createEcho() {
  const input = ctx.createGain()
  input.gain.value = 0.25
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.13
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3200
  const feedback = ctx.createGain()
  feedback.gain.value = 0.32
  input.connect(delay)
  delay.connect(damp).connect(feedback).connect(delay)
  damp.connect(master)
  return input
}

/** Installs the first-gesture unlock. Call once at startup. */
export function installAudioUnlock() {
  const events = ['pointerdown', 'keydown', 'touchend']
  const handler = () => {
    unlock()
    for (const e of events) window.removeEventListener(e, handler, true)
  }
  for (const e of events) window.addEventListener(e, handler, true)
  // Mobile browsers suspend audio in the background; resume on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended' && !adMuted) ctx.resume()
  })
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // Not persisted; fine.
  }
  applyMaster()
  for (const listener of muteListeners) listener(muted)
}

const clampVolume = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1)

/** Overall volume 0..1 (Boxity's master_volume setting). */
export function setMasterVolume(volume) {
  masterVolume = clampVolume(volume)
  applyMaster()
}

/** Music volume 0..1 (Boxity's music_volume setting), on top of the master volume. */
export function setMusicVolume(volume) {
  musicVolume = clampVolume(volume)
  music?.setVolume(musicVolume)
}

/**
 * Silences everything for a Boxity ad break, and suspends the audio clock so the music
 * scheduler doesn't pile notes up behind it. Ending the break restores the player's
 * own mute choice and volumes exactly as they were.
 */
export function setAdBreakMuted(on) {
  adMuted = Boolean(on)
  applyMaster()
  if (!ctx) return
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended' && document.visibilityState === 'visible') ctx.resume()
}

/** Calls `listener(muted)` on every change; returns the unsubscribe. */
export function onMutedChange(listener) {
  muteListeners.add(listener)
  return () => muteListeners.delete(listener)
}

function ready(name, minGapMs = 0) {
  if (!ctx || silent() || ctx.state !== 'running') return false
  const now = performance.now()
  if (minGapMs && now - (lastPlayed.get(name) || 0) < minGapMs) return false
  lastPlayed.set(name, now)
  return true
}

/**
 * Runs `build(t)` for a sound due `at` seconds from now: straight away when it's due
 * soon, otherwise just before it's due (`t` still lands it on time). So a chord, a run of
 * bells or a round of applause doesn't create dozens of audio nodes in the one frame that
 * asked for it - on a slow phone that frame stuck.
 */
export function whenDue(at, build) {
  const due = ctx.currentTime + at
  if (at <= LEAD) {
    build(due)
    return
  }
  setTimeout(() => {
    if (ctx) build(Math.max(ctx.currentTime, due))
  }, (at - LEAD) * 1000)
}
/** How early (s) a deferred sound is built before it's due. */
const LEAD = 0.06

/** A short enveloped oscillator note; `echo` also sends it into the echo. */
function tone(freq, opts = {}) {
  whenDue(opts.at ?? 0, (t) => toneAt(freq, t, opts))
}

function toneAt(freq, t, { type = 'sine', duration = 0.12, volume = 0.3, slideTo = null, attack = 0.01, echo: wet = false } = {}) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(gain).connect(master)
  if (wet) gain.connect(echo)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** A struck bell: the note, a quieter octave and a glassy strike, ringing into the echo. */
function bell(freq, { at = 0, volume = 0.1, decay = 0.4 } = {}) {
  tone(freq, { at, duration: decay, volume, echo: true })
  tone(freq * 2, { at, duration: decay * 0.6, volume: volume * 0.35, echo: true })
  tone(freq * 3.01, { type: 'triangle', at, duration: 0.05, volume: volume * 0.3 })
}

/** Filtered noise: whooshes and cracks. */
function noise(opts = {}) {
  whenDue(opts.at ?? 0, (t) => noiseAt(t, opts))
}

function noiseAt(t, { duration = 0.3, volume = 0.25, from = 400, to = 2400, q = 1.2 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + duration * 0.3)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(gain).connect(master)
  // Looped, so a long one from a random spot never runs off the end of the second.
  src.loop = true
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.02)
}

/** A low rumble that swells and fades: rocket engines, near or far. */
function rumble({ at = 0, duration = 3, volume = 0.2 } = {}) {
  noise({ at, duration, volume, from: 60, to: 180, q: 0.6 })
  tone(48, { at, duration, volume: volume * 0.6, slideTo: 36, attack: 0.4 })
}

export const sfx = {
  click() {
    if (ready('click', 40)) tone(660, { type: 'triangle', duration: 0.05, volume: 0.15 })
  },
  buy() {
    if (!ready('buy')) return
    tone(1047, { type: 'square', duration: 0.07, volume: 0.08 })
    tone(1568, { type: 'square', at: 0.08, duration: 0.16, volume: 0.08 })
  },
  error() {
    if (ready('error', 200)) tone(160, { type: 'sawtooth', duration: 0.18, volume: 0.07, slideTo: 110 })
  },
  /** A jump: a springy little boing. */
  jump() {
    if (ready('jump', 120)) tone(260, { type: 'triangle', duration: 0.18, volume: 0.1, slideTo: 620 })
  },
  /** Landing from a jump: a soft thump. */
  jumpLand() {
    if (!ready('jumpLand', 150)) return
    tone(140, { type: 'sine', duration: 0.12, volume: 0.12, slideTo: 70 })
    noise({ duration: 0.08, volume: 0.06, from: 900, to: 300, q: 0.7 })
  },
  /** Picking up a package: two quick rising blips and a scanner beep. */
  pickup() {
    if (!ready('pickup', 300)) return
    tone(523, { type: 'square', duration: 0.06, volume: 0.06 })
    tone(784, { type: 'square', at: 0.07, duration: 0.08, volume: 0.06 })
    tone(1568, { type: 'sine', at: 0.17, duration: 0.12, volume: 0.05 })
  },
  /** A delivery paid: a bright fanfare and a shower of coins. */
  cash() {
    if (!ready('cash', 300)) return
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.07, duration: 0.2, volume: 0.1, echo: true }))
    const coins = lite() ? 3 : 7
    for (let i = 0; i < coins; i += 1) bell(1900 + (i % 4) * 230, { at: 0.3 + i * 0.07, volume: 0.04, decay: 0.14 })
  },
  /** A badge earned: a little rising arpeggio. */
  badge() {
    if (!ready('badge')) return
    ;[392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', at: i * 0.06, duration: 0.22, volume: 0.1 }))
  },
  /** One second of the countdown: a tick, sharper in the last ten. */
  beep(urgent = false) {
    if (ready('beep', 500)) tone(urgent ? 1320 : 880, { type: 'sine', duration: urgent ? 0.12 : 0.06, volume: urgent ? 0.08 : 0.035 })
  },
  /** You're aboard and it's lighting: ignition, a roar, the climb. */
  liftoff() {
    if (!ready('liftoff')) return
    noise({ duration: 0.4, volume: 0.25, from: 2000, to: 300, q: 0.7 })
    rumble({ at: 0.1, duration: 6, volume: 0.32 })
    tone(90, { at: 0.2, duration: 5, volume: 0.1, slideTo: 220, attack: 1 })
  },
  /** Someone else's rocket lifting off, across the base. */
  rumble() {
    if (ready('rumble', 5000)) rumble({ duration: 5, volume: lite() ? 0.12 : 0.18 })
  },
  /** A shuttle's engines spooling up and away. */
  shuttle() {
    if (!ready('shuttle')) return
    tone(140, { type: 'sawtooth', duration: 1.6, volume: 0.05, slideTo: 420, attack: 0.3 })
    noise({ duration: 2.4, volume: 0.12, from: 300, to: 1400, q: 0.8 })
  },
  /** A Star Map warp: a rising sweep into hyperspace. */
  warp() {
    if (!ready('warp')) return
    tone(200, { type: 'sawtooth', duration: 1.2, volume: 0.06, slideTo: 2400, attack: 0.1 })
    noise({ duration: 1.4, volume: 0.1, from: 400, to: 6000, q: 1.5 })
  },
  /** Arriving: doors hiss open and a chime rings. */
  arrive() {
    if (!ready('arrive')) return
    noise({ duration: 0.5, volume: 0.08, from: 4000, to: 800, q: 0.6 })
    bell(1047, { at: 0.2, volume: 0.08, decay: 0.5 })
    bell(1568, { at: 0.32, volume: 0.06, decay: 0.6 })
  },
}
