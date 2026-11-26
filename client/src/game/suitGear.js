import { BoxGeometry, CylinderGeometry, DoubleSide, Euler, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three'

import { SUITS, suitById } from '@shared/balance'

import { getGame } from '../store/game'
import { PropBuilder } from './blocks'
import { BODY, pose, SUIT_HEAD, SUIT_PACK } from './playerPose'

/**
 * A space suit to wear over any avatar, better the better the suit:
 *
 * - the helmet: a glass dome tinted the suit's visor colour, a coloured band over the
 *   top, ear pieces (one with a status light), a neck ring; an antenna from Scout up, a
 *   headlamp from Ranger up
 * - the body: a chest plate with a stripe and a glowing control panel, shoulder armour,
 *   a utility belt with a lit buckle
 * - the pack: a sculpted oxygen pack with capped tanks, status lights, fins from Voyager
 *   up, and big glowing thrusters on the jetpack suits; glowing trim lines on the top
 *   suits, wings of light on Quasar, Galaxy and Solar Gold, and Galaxy's starfield
 * - a package crate strapped on top of the pack while you carry one
 *
 * Built in "upper body space" - origin at the body's pivot, turned with the spine - so
 * the whole suit rides on one transform from playerPose (`pose.suit.quat`, `pose.lift`).
 * Fitted to the 1.8 m character, measured on player.glb: torso 0.77 m wide, from 0.25 m
 * behind to 0.2 m in front of the middle, 0.69-1.39 m up; arms centred 0.58 m out.
 * Three draw calls an avatar: the painted parts (merged, vertex-coloured), the lights
 * (unlit) and the glass. Geometries are cached per suit and shared by every avatar
 * wearing it; the three materials are shared by all.
 */

const PACK = { w: 0.5, h: 0.6, d: 0.26 }
const HELMET_RADIUS = 0.42
/** The torso on the standing 1.8 m character: half-width, front and back, bottom and top. */
const TORSO = { x: 0.4, front: 0.235, back: -0.26, bottom: 0.69, top: 1.39 }
/** The suit's shell over the torso stands this far off it. */
const SHELL = 0.02

const box = new BoxGeometry(1, 1, 1)
const tank = new CylinderGeometry(0.09, 0.09, 1, 12)
const cap = new SphereGeometry(0.09, 10, 6)
const nozzle = new CylinderGeometry(0.075, 0.12, 0.2, 12)
const collar = new TorusGeometry(0.27, 0.06, 8, 24)
const band = new TorusGeometry(HELMET_RADIUS + 0.045, 0.03, 6, 28, Math.PI)
/**
 * The helmet's shell: a sphere round the glass, open at the front in a wide face window
 * (WINDOW radians across, centred on +Z), and open underneath where the neck ring is.
 */
const WINDOW = 2.3
const SHELL_PHI = Math.PI / 2 + WINDOW / 2
const helmetShell = new SphereGeometry(HELMET_RADIUS + 0.03, 22, 12, SHELL_PHI, Math.PI * 2 - WINDOW, 0, Math.PI * 0.8)
/** The face window's frame: an arc up each edge (rotated to its meridian), and a brow. */
const windowRim = new TorusGeometry(HELMET_RADIUS + 0.035, 0.035, 6, 24, Math.PI * 0.78)
windowRim.rotateZ(-Math.PI * 0.28)
const hose = new CylinderGeometry(0.035, 0.035, 1, 8)
const pad = new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)
const disc = new CylinderGeometry(1, 1, 1, 18)
const ear = new CylinderGeometry(0.1, 0.1, 0.08, 14)
const rod = new CylinderGeometry(0.012, 0.012, 1, 5)
const dot = new SphereGeometry(1, 8, 6)
const dome = new SphereGeometry(HELMET_RADIUS, 18, 12)

let materials = null
/** The three shared materials, made on first use. */
function suitMaterials() {
  if (!materials) {
    materials = {
      solid: new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }),
      glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glass: new MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        emissive: 0x0e1c26,
      }),
    }
  }
  return materials
}

/** How far up the range a suit is: 0 for Rookie, rising (Solar Gold counts as top). */
const tierOf = (suit) => (suit.id === 'solar' ? SUITS.length : SUITS.indexOf(suit))
const TRIMMED = new Set(['nebula', 'eclipse', 'quasar', 'galaxy', 'solar'])
const WINGED = new Set(['quasar', 'galaxy', 'solar'])
/** Where each extra starts, as a place in the range (SUITS order). */
const ANTENNA = 2
const HEADLAMP = 4
const FINS = 6

const _dir = new Vector3()
const _q = new Quaternion()
const _e = new Euler()
const _up = new Vector3(0, 1, 0)
/** A hose segment from `a` to `b` ([x, y, z], upper-body space): position, rotation, length. */
function between(a, b) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const length = _dir.length()
  _q.setFromUnitVectors(_up, _dir.normalize())
  _e.setFromQuaternion(_q)
  return { position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotation: [_e.x, _e.y, _e.z], scale: [1, length, 1] }
}

const cache = new Map()

/**
 * The suit's three geometries: `{ solid, glow, glass }` for `suitId`, with a crate on
 * the pack if `carrying`. Positions are upper-body space (absolute heights minus pivot).
 */
function suitGeometry(suitId, carrying) {
  const key = `${suitId}:${carrying ? 1 : 0}`
  let geometry = cache.get(key)
  if (geometry) return geometry
  const suit = suitById(suitId)
  const tier = tierOf(suit)
  const { main, accent, visor } = suit.colors
  const dark = '#2b2e36'
  const s = new PropBuilder()
  const g = new PropBuilder()
  const y = (h) => h - BODY.pivot

  // --- The pack: body, side rails, tanks with caps, a stripe and status lights -----
  const py = SUIT_PACK.y - BODY.pivot
  const pz = SUIT_PACK.z
  const back = pz - PACK.d / 2
  s.add(box, {
    position: [0, py, pz],
    scale: [PACK.w, PACK.h, PACK.d],
    color: main,
  })
  s.add(box, {
    position: [0, py + PACK.h / 2 + 0.02, pz],
    scale: [PACK.w - 0.06, 0.05, PACK.d - 0.04],
    color: accent,
  })
  for (const side of [-1, 1])
    s.add(box, {
      position: [side * (PACK.w / 2 + 0.015), py, pz],
      scale: [0.03, PACK.h - 0.04, PACK.d - 0.06],
      color: dark,
    })
  s.add(box, {
    position: [0, py + 0.13, back - 0.005],
    scale: [PACK.w * 0.86, 0.07, 0.02],
    color: accent,
  })
  for (const side of [-1, 1]) {
    const tx = side * 0.13
    const tz = back - 0.07
    s.add(tank, {
      position: [tx, py - 0.04, tz],
      scale: [1, PACK.h * 0.7, 1],
      color: accent,
    })
    s.add(cap, {
      position: [tx, py - 0.04 + PACK.h * 0.35, tz],
      color: '#c3c9d3',
    })
    s.add(cap, {
      position: [tx, py - 0.04 - PACK.h * 0.35, tz],
      color: '#c3c9d3',
    })
    if (suit.jetpack) {
      // Thrusters under the pack: a dark bell with a hot core.
      s.add(nozzle, {
        position: [tx, py - PACK.h / 2 - 0.1, tz + 0.02],
        color: '#3a3d46',
      })
      g.add(dot, {
        position: [tx, py - PACK.h / 2 - 0.2, tz + 0.02],
        scale: [0.06, 0.02, 0.06],
        color: '#ffb347',
      })
    }
    if (tier >= FINS) {
      // Swept fins off the pack's sides.
      s.add(box, {
        position: [side * (PACK.w / 2 + 0.07), py - 0.1, pz - 0.02],
        rotation: [0.5, 0, 0],
        scale: [0.03, 0.34, 0.16],
        color: accent,
      })
    }
  }
  for (let i = 0; i < 3; i += 1)
    g.add(box, {
      position: [-0.12 + i * 0.12, py + PACK.h / 2 - 0.025, back - 0.015],
      scale: [0.05, 0.03, 0.01],
      color: ['#3aff8a', '#3aff8a', visor][i],
    })

  // --- The body: chest plate, control panel, shoulder armour, belt. The fabric under
  // them - torso, arms, legs, gloves, boots - is suitSkin.js.
  const cz = (TORSO.front + TORSO.back) / 2
  const depth = TORSO.front - TORSO.back + SHELL * 2
  const front = TORSO.front + SHELL
  s.add(box, {
    position: [0, y(1.17), front + 0.02],
    scale: [0.6, 0.34, 0.04],
    color: lighten(main),
  })
  s.add(box, {
    position: [0, y(1.3), front + 0.042],
    scale: [0.6, 0.05, 0.01],
    color: accent,
  })
  // The emblem: a glowing disc in an accent ring, high on the left of the chest.
  s.add(disc, { position: [-0.17, y(1.2), front + 0.045], rotation: [Math.PI / 2, 0, 0], scale: [0.085, 0.012, 0.085], color: accent })
  g.add(disc, { position: [-0.17, y(1.2), front + 0.053], rotation: [Math.PI / 2, 0, 0], scale: [0.06, 0.006, 0.06], color: visor })
  s.add(box, {
    position: [0.13, y(1.12), front + 0.045],
    scale: [0.22, 0.13, 0.02],
    color: dark,
  })
  for (let i = 0; i < 3; i += 1)
    g.add(box, {
      position: [0.06 + i * 0.07, y(1.12), front + 0.057],
      scale: [0.04, 0.04, 0.01],
      color: ['#3aff8a', '#ffd23a', '#ff4a3b'][i],
    })
  g.add(box, {
    position: [-0.15, y(1.12), front + 0.045],
    scale: [0.12, 0.05, 0.01],
    color: visor,
  })
  // Side seams in the accent colour, down the shell.
  for (const side of [-1, 1])
    s.add(box, {
      position: [side * (TORSO.x + SHELL + 0.004), y(1.04), cz],
      scale: [0.01, 0.6, 0.06],
      color: accent,
    })
  for (const side of [-1, 1]) {
    s.add(pad, {
      position: [side * 0.58, y(TORSO.top - 0.02), cz],
      scale: [0.22, 0.14, 0.27],
      color: main,
    })
    s.add(box, {
      position: [side * 0.58, y(TORSO.top - 0.03), cz],
      scale: [0.45, 0.025, 0.55],
      color: accent,
    })
  }
  // The belt all round the waist, and its buckle.
  const by = y(TORSO.bottom + 0.06)
  const bw = TORSO.x * 2 + SHELL * 2 + 0.03
  s.add(box, {
    position: [0, by, front + 0.015],
    scale: [bw, 0.09, 0.03],
    color: accent,
  })
  s.add(box, {
    position: [0, by, TORSO.back - SHELL - 0.015],
    scale: [bw, 0.09, 0.03],
    color: accent,
  })
  for (const side of [-1, 1])
    s.add(box, {
      position: [side * (bw / 2 - 0.015), by, cz],
      scale: [0.03, 0.09, depth + 0.06],
      color: accent,
    })
  s.add(box, {
    position: [0, by, front + 0.035],
    scale: [0.12, 0.1, 0.02],
    color: '#c3c9d3',
  })
  g.add(box, {
    position: [0, by, front + 0.047],
    scale: [0.06, 0.04, 0.005],
    color: visor,
  })

  // --- The helmet: neck ring, band over the top, ear pieces, antenna, headlamp -----
  const hy = SUIT_HEAD.y - BODY.pivot
  const hz = SUIT_HEAD.z
  s.add(collar, {
    position: [0, y(TORSO.top + 0.02), cz],
    rotation: [Math.PI / 2, 0, 0],
    color: main,
  })
  s.add(helmetShell, { position: [0, hy, hz], color: main })
  for (const phi of [Math.PI / 2 - WINDOW / 2, Math.PI / 2 + WINDOW / 2]) {
    s.add(windowRim, { position: [0, hy, hz], rotation: [0, Math.PI + phi, 0], color: accent })
  }
  s.add(band, { position: [0, hy, hz], color: accent })
  // Two air hoses from the top of the pack to the back of the helmet.
  for (const side of [-1, 1]) {
    const start = [side * 0.17, py + PACK.h / 2 - 0.02, pz - 0.02]
    const bend = [side * 0.24, hy - 0.42, -0.34]
    const end = [side * 0.2, hy - 0.22, hz - 0.36]
    s.add(hose, { ...between(start, bend), color: '#3a3f4a' })
    s.add(hose, { ...between(bend, end), color: '#3a3f4a' })
  }
  for (const side of [-1, 1]) {
    s.add(ear, {
      position: [side * (HELMET_RADIUS + 0.05), hy, hz],
      rotation: [0, 0, Math.PI / 2],
      color: accent,
    })
  }
  g.add(dot, {
    position: [HELMET_RADIUS + 0.095, hy, hz],
    scale: 0.035,
    color: '#3aff8a',
  })
  if (tier >= ANTENNA) {
    s.add(rod, {
      position: [-(HELMET_RADIUS + 0.03), hy + 0.24, hz - 0.03],
      scale: [1, 0.42, 1],
      color: '#c3c9d3',
    })
    g.add(dot, {
      position: [-(HELMET_RADIUS + 0.03), hy + 0.46, hz - 0.03],
      scale: 0.03,
      color: '#ff4a3b',
    })
  }
  if (tier >= HEADLAMP) {
    // A headlamp on the band, just above the visor.
    s.add(box, {
      position: [0, hy + HELMET_RADIUS * 0.82, hz + 0.245],
      rotation: [-0.6, 0, 0],
      scale: [0.12, 0.06, 0.06],
      color: dark,
    })
    g.add(box, {
      position: [0, hy + HELMET_RADIUS * 0.82 + 0.015, hz + 0.277],
      rotation: [-0.6, 0, 0],
      scale: [0.09, 0.035, 0.01],
      color: '#fffbe0',
    })
  }
  if (TRIMMED.has(suit.id)) {
    // Glowing trim: round the chest plate, down the pack's edges, round the neck ring.
    g.add(box, {
      position: [0, y(1.0), front + 0.041],
      scale: [0.62, 0.015, 0.01],
      color: accent,
    })
    for (const side of [-1, 1]) {
      g.add(box, {
        position: [side * 0.31, y(1.17), front + 0.041],
        scale: [0.015, 0.36, 0.01],
        color: accent,
      })
      g.add(box, {
        position: [side * (PACK.w / 2 - 0.02), py, back - 0.006],
        scale: [0.015, PACK.h - 0.06, 0.01],
        color: accent,
      })
    }
    g.add(collar, {
      position: [0, y(TORSO.top + 0.07), cz],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1.02, 1.02, 0.25],
      color: accent,
    })
  }

  if (WINGED.has(suit.id)) {
    // Wings of light off the pack: two swept blades a side.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i += 1) {
        g.add(box, {
          position: [side * (PACK.w / 2 + 0.22 + i * 0.1), py + 0.12 - i * 0.16, pz - 0.06],
          rotation: [0, 0, side * (0.55 + i * 0.25)],
          scale: [0.5 - i * 0.12, 0.05, 0.03],
          color: accent,
        })
      }
    }
  }
  if (suit.id === 'galaxy') {
    // A scatter of stars over the shell.
    const stars = [
      [-0.25, 1.3],
      [0.22, 1.05],
      [-0.1, 0.92],
      [0.3, 1.32],
      [-0.32, 1.0],
      [0.05, 1.36],
      [0.15, 0.85],
    ]
    for (const [sx, sy] of stars)
      g.add(dot, {
        position: [sx, y(sy), front + 0.005],
        scale: 0.018,
        color: '#ffffff',
      })
    for (const [sx, sy] of stars)
      g.add(dot, {
        position: [sx * 0.9, y(sy), TORSO.back - SHELL - 0.005],
        scale: 0.016,
        color: '#e0d0ff',
      })
  }

  if (carrying) {
    // A cardboard crate strapped on top of the pack, taped in your suit's colour.
    const cy = py + PACK.h / 2 + 0.24
    s.add(box, {
      position: [0, cy, pz - 0.02],
      scale: [0.46, 0.38, 0.4],
      color: '#c8925a',
    })
    s.add(box, {
      position: [0, cy + 0.191, pz - 0.02],
      scale: [0.47, 0.012, 0.1],
      color: accent,
    })
    s.add(box, {
      position: [0, cy, pz - 0.02],
      scale: [0.47, 0.39, 0.03],
      color: '#a8743f',
    })
  }

  // The glass, tinted halfway between clear and the suit's visor colour.
  const glass = new PropBuilder()
  glass.add(dome, { position: [0, hy, hz], color: tint(visor) })

  geometry = { solid: s.build(), glow: g.build(), glass: glass.build() }
  cache.set(key, geometry)
  return geometry
}

/** `hex` a third of the way to white: the chest plate, a shade lighter than the shell. */
function lighten(hex) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c) => Math.round(c + (255 - c) * 0.3)
  return `#${((mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255)).toString(16).padStart(6, '0')}`
}

/** `hex` blended halfway to white: glass with a hint of the visor's colour. */
function tint(hex) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c) => Math.round(c + (255 - c) * 0.5)
  const r = mix((n >> 16) & 255)
  const gg = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * One avatar's suit: a Group to add beside the avatar (in its group, not scaled with
 * the model). Call `update(suitId, carrying, visible)` each frame; it follows the pose.
 */
export function createSuitGear() {
  const { solid, glow, glass } = suitMaterials()
  const group = new Group()
  const first = suitGeometry('rookie', false)
  const solidMesh = new Mesh(first.solid, solid)
  const glowMesh = new Mesh(first.glow, glow)
  const glassMesh = new Mesh(first.glass, glass)
  // Drawn after the opaque avatar so the face shows through it.
  glassMesh.renderOrder = 2
  group.add(solidMesh, glowMesh, glassMesh)
  let shownKey = 'rookie:0'

  group.userData.update = (suitId, carrying, visible = true) => {
    group.visible = visible
    if (!visible) return
    const key = `${suitId}:${carrying ? 1 : 0}`
    if (key !== shownKey) {
      shownKey = key
      const next = suitGeometry(suitId, carrying)
      solidMesh.geometry = next.solid
      glowMesh.geometry = next.glow
      glassMesh.geometry = next.glass
    }
    group.position.set(0, BODY.pivot + pose.lift, 0)
    group.quaternion.copy(pose.suit.quat)
  }
  return group
}

/** Your suit, and whether you carry a package: the `gear` your own avatar wears. */
export function yourGear() {
  const { profile } = getGame()
  return [profile.suit, Boolean(profile.package)]
}
