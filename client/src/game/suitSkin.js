import { Color, MeshLambertMaterial, SkinnedMesh } from 'three'

import { suitById } from '@shared/balance'

/**
 * The suit's fabric: a second skin over the whole avatar - torso, arms, hands, legs and
 * feet - so a suited player is a spaceman from boots to collar, not someone in a T-shirt
 * with a backpack. It's the avatar's own skinned body (same geometry, same skeleton, same
 * bind), drawn again a hair in front (polygon offset), so it follows every pose, emote
 * and proportion exactly and costs one draw call.
 *
 * What's painted where comes from each point's place on the body at rest (its bind
 * position, measured against the body's height), in the shader: the suit's colour over
 * torso, arms and legs (the legs a shade darker), gloves and boots in the accent colour
 * with dark soles, a band round each shoulder and knee. The head isn't covered - the
 * helmet's glass shows your face (suitGear.js).
 */

/** The suits whose stripes glow. */
const GLOWING = new Set(['nebula', 'eclipse', 'quasar', 'galaxy', 'solar'])

/** Fractions of the body's height (feet 0, crown 1), measured on player.glb. */
const BANDS = {
  /** Above this is the head: left uncovered. */
  neck: 0.772,
  /** Shoulder band on the arms. */
  shoulder: [0.7, 0.735],
  /** Gloves: the bottom of the arms. */
  glove: 0.455,
  /** Knee band. */
  knee: [0.205, 0.235],
  /** Boots, and their soles. */
  boot: 0.09,
  sole: 0.022,
  /** Waist: legs below, torso above. */
  waist: 0.385,
  /** Arms are this far out from the middle (fraction of height) - beyond the torso. */
  arm: 0.218,
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vRest;
`
const VERTEX_BODY = /* glsl */ `
vRest = position;
`
const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vRest;
uniform vec3 uMain;
uniform vec3 uAccent;
uniform vec2 uSpan;
uniform float uGlow;
uniform float uStars;
float suitHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
`
/**
 * Picks the fabric's colour for this point of the body: the suit's colour (legs a shade
 * darker, a faint quilting), accent stripes down the outside of the arms and legs and
 * the body's sides, seams, darker elbow pads, the shoulder and knee bands, gloves and
 * boots with a pale cuff, dark soles. `suitStripe` (the stripes) is kept for the glow.
 */
const FRAGMENT_COLOR = /* glsl */ `
float t = (vRest.y - uSpan.x) / uSpan.y;
if (t > ${BANDS.neck}) discard;
float side = abs(vRest.x) / uSpan.y;
float depth = vRest.z / uSpan.y;
bool arm = side > ${BANDS.arm} && t > ${BANDS.waist};
bool leg = t < ${BANDS.waist};
vec3 fabric = leg ? uMain * 0.86 : uMain;
// Quilting: a faint diamond weave.
vec3 q = vRest / uSpan.y * 38.0;
fabric *= 0.965 + 0.035 * sin(q.x + q.y) * sin(q.z - q.y);
// Stripes down the outside: arms, legs and the torso's sides.
float suitStripe = 0.0;
if (arm && side > 0.415 && abs(depth + 0.012) < 0.028) suitStripe = 1.0;
if (leg && side > 0.198 && side < 0.2165 && abs(depth + 0.012) < 0.026 && t > ${BANDS.boot}) suitStripe = 1.0;
if (!arm && !leg && side > 0.2 && side < 0.2165 && abs(depth + 0.012) < 0.03) suitStripe = 1.0;
fabric = mix(fabric, uAccent, suitStripe);
// Seams round the waist and chest, and across the thighs (not over the sleeves).
float seam = 0.0;
seam += 1.0 - smoothstep(0.0, 0.004, abs(t - 0.5));
seam += 1.0 - smoothstep(0.0, 0.004, abs(t - 0.62));
seam += 1.0 - smoothstep(0.0, 0.004, abs(t - 0.3));
if (!arm) fabric *= 1.0 - 0.28 * clamp(seam, 0.0, 1.0);
// Elbow pads: a darker panel halfway down the arms.
if (arm && t > 0.565 && t < 0.6) fabric = mix(fabric, uAccent * 0.55, 0.7);
if (arm && t > ${BANDS.shoulder[0]} && t < ${BANDS.shoulder[1]}) fabric = uAccent;
if (!arm && leg && t > ${BANDS.knee[0]} && t < ${BANDS.knee[1]}) fabric = uAccent;
// Gloves and boots, with a pale cuff where they start.
if (arm && t < ${BANDS.glove}) fabric = t > ${BANDS.glove} - 0.014 ? vec3(0.86, 0.88, 0.9) : uAccent;
if (t < ${BANDS.boot}) fabric = t > ${BANDS.boot} - 0.014 ? vec3(0.86, 0.88, 0.9) : uAccent * 0.85;
if (t < ${BANDS.sole}) fabric = vec3(0.07, 0.075, 0.09);
diffuseColor.rgb *= fabric;
`

/**
 * The top suits glow: their stripes (uGlow), and Galaxy's fabric is scattered with
 * twinkling stars (uStars).
 */
const FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += uAccent * suitStripe * uGlow * 0.9;
if (uStars > 0.5) {
  vec3 cell = floor(vRest / uSpan.y * 60.0);
  float h = suitHash(cell);
  vec3 f = fract(vRest / uSpan.y * 60.0) - 0.5;
  if (h > 0.93 && length(f) < 0.22) totalEmissiveRadiance += vec3(1.0, 0.96, 1.0) * (h - 0.9) * 9.0;
}
`

/** The fabric material: one shader program for every suit, the colours as uniforms. */
function suitMaterial(span) {
  const uniforms = { uMain: { value: new Color('#ffffff') }, uAccent: { value: new Color('#3a7bd5') }, uSpan: { value: span }, uGlow: { value: 0 }, uStars: { value: 0 } }
  const m = new MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`)
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT_EMISSIVE}`)
  }
  m.customProgramCacheKey = () => 'suit-skin-v2'
  m.userData.uniforms = uniforms
  return m
}

/**
 * The fabric over `body` (a SkinnedMesh of the avatar): shares its geometry, skeleton and
 * bind, sits beside it. Free it with disposeSuitSkin (the geometry stays the body's).
 */
export function createSuitSkin(body) {
  const geometry = body.geometry
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const span = { x: box.min.y, y: Math.max(1e-6, box.max.y - box.min.y) }
  const skin = new SkinnedMesh(geometry, suitMaterial(span))
  skin.name = 'suit_skin'
  skin.frustumCulled = false
  skin.castShadow = false
  skin.visible = false
  body.parent.add(skin)
  skin.bind(body.skeleton, body.bindMatrix)
  skin.userData.shownSuit = null
  return skin
}

/** Dresses `skin` in suit `suitId` (hidden for 'none'). Cheap to call every frame. */
export function updateSuitSkin(skin, suitId) {
  if (!skin) return
  const wearing = Boolean(suitId) && suitId !== 'none'
  skin.visible = wearing
  if (!wearing || skin.userData.shownSuit === suitId) return
  skin.userData.shownSuit = suitId
  const { main, accent } = suitById(suitId).colors
  const u = skin.material.userData.uniforms
  u.uMain.value.set(main)
  u.uAccent.value.set(accent)
  u.uGlow.value = GLOWING.has(suitId) ? 1 : 0
  u.uStars.value = suitId === 'galaxy' ? 1 : 0
}

/** Removes the fabric (its material; the geometry belongs to the body). */
export function disposeSuitSkin(skin) {
  if (!skin) return
  skin.parent?.remove(skin)
  skin.material.dispose()
}
