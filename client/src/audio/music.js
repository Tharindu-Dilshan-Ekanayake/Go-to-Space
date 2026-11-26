/**
 * Background music, made live with WebAudio like the sound effects: an easy-going space
 * cruise - a slow, warm synth pad over Am - F - C - G, a soft pulsing bass, and a
 * twinkling arpeggio drifting above it - kept quiet under the game.
 *
 * Notes are scheduled a little ahead on the audio clock by a timer (the usual
 * look-ahead scheduler), never from the render loop. A handful of oscillators at a time.
 */

const BPM = 92
const EIGHTH = 60 / BPM / 2
const LOOKAHEAD_S = 0.35
const TICK_MS = 100

/** One chord per bar, as MIDI notes: bass root, then the pad's three voices. */
const BARS = [
  { root: 45, chord: [57, 60, 64] }, // Am
  { root: 41, chord: [57, 60, 65] }, // F
  { root: 48, chord: [55, 60, 64] }, // C
  { root: 43, chord: [55, 59, 62] }, // G
]
/** The arpeggio climbs the chord an octave up, in this order of its voices. */
const ARP = [0, 1, 2, 1, 2, 0, 1, 2]

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12)

export function createMusic(ctx, destination) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(destination)
  // A low-pass over everything keeps it soft and out of the effects' way.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2600
  tone.connect(out)

  let step = 0
  let nextAt = 0
  let timer = null
  const level = { base: 0.5, ducked: 1, volume: 1 }

  function note(midi, t, { type = 'sine', length = 0.3, volume = 0.05, attack = 0.01, detune = 0 } = {}) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq(midi)
    osc.detune.value = detune
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(tone)
    osc.start(t)
    osc.stop(t + length + 0.05)
  }

  /** Everything that sounds on eighth `step` (of a 4-bar, 32-eighth loop) at time t. */
  function play(t) {
    const inBar = step % 8
    const bar = BARS[Math.floor(step / 8) % BARS.length]
    // The pad: the whole chord, slow in and out, two voices a hair apart so it shimmers.
    if (inBar === 0) {
      for (const n of bar.chord) {
        note(n, t, { type: 'triangle', length: EIGHTH * 8.5, volume: 0.016, attack: 0.9, detune: 6 })
        note(n, t, { type: 'triangle', length: EIGHTH * 8.5, volume: 0.016, attack: 0.9, detune: -6 })
      }
    }
    // Bass: a soft pulse on the beats.
    if (inBar % 2 === 0) note(bar.root - 12, t, { type: 'sine', length: EIGHTH * 1.6, volume: 0.06, attack: 0.02 })
    // The arpeggio, every other time round the loop so it comes and goes.
    if (Math.floor(step / 32) % 2 === 1) note(bar.chord[ARP[inBar]] + 12, t, { type: 'sine', length: EIGHTH * 1.8, volume: 0.022, attack: 0.01 })
  }

  function schedule() {
    // After the page was hidden (the context suspended), pick up from now.
    nextAt = Math.max(nextAt, ctx.currentTime + 0.05)
    while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
      play(nextAt)
      nextAt += EIGHTH
      step = (step + 1) % 64
    }
  }

  const applyLevel = (seconds) => out.gain.setTargetAtTime(level.base * level.ducked * level.volume, ctx.currentTime, seconds)

  return {
    start() {
      if (timer) return
      nextAt = ctx.currentTime + 0.1
      timer = setInterval(schedule, TICK_MS)
      schedule()
      // Fade in.
      applyLevel(1.5)
    },
    /** Quieter while something else should be heard (a launch). */
    duck(on) {
      level.ducked = on ? 0.45 : 1
      applyLevel(0.4)
    },
    /** The player's music volume, 0..1 (Boxity's music_volume setting). */
    setVolume(volume) {
      level.volume = Math.min(1, Math.max(0, Number(volume) || 0))
      // Before start() the fade-in will pick it up.
      if (timer) applyLevel(0.15)
    },
  }
}
