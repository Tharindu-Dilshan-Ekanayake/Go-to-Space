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
`
/** Picks the fabric's colour for this point of the body. */
const FRAGMENT_COLOR = /* glsl */ `
float t = (vRest.y - uSpan.x) / uSpan.y;
if (t > ${BANDS.neck}) discard;
float side = abs(vRest.x) / uSpan.y;
bool arm = side > ${BANDS.arm} && t > ${BANDS.waist};
vec3 fabric = uMain;
if (t < ${BANDS.waist}) fabric = uMain * 0.86;
if (arm && t > ${BANDS.shoulder[0]} && t < ${BANDS.shoulder[1]}) fabric = uAccent;
if (arm && t < ${BANDS.glove}) fabric = uAccent;
if (!arm && t > ${BANDS.knee[0]} && t < ${BANDS.knee[1]}) fabric = uAccent;
if (t < ${BANDS.boot}) fabric = uAccent * 0.85;
if (t < ${BANDS.sole}) fabric = vec3(0.07, 0.075, 0.09);
diffuseColor.rgb *= fabric;
`

/** The fabric material: one shader program for every suit, the colours as uniforms. */
function suitMaterial(span) {
  const uniforms = { uMain: { value: new Color('#ffffff') }, uAccent: { value: new Color('#3a7bd5') }, uSpan: { value: span } }
  const m = new MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`)
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
  }
  m.customProgramCacheKey = () => 'suit-skin-v1'
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
}

/** Removes the fabric (its material; the geometry belongs to the body). */
export function disposeSuitSkin(skin) {
  if (!skin) return
  skin.parent?.remove(skin)
  skin.material.dispose()
}
