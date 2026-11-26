import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { ConeGeometry, MeshBasicMaterial, Shape, ShapeGeometry, TorusGeometry } from 'three'

import { groundHeightAt, layoutOf } from '@shared/world'

import { getGame } from '../store/game'
import { guideStep } from './guide'
import { runtime } from './runtime'

/** Shared shapes and materials (one each for every marker there is: one). */
const ARROW = new ConeGeometry(0.7, 1.6, 4)
ARROW.rotateX(Math.PI)
const RING = new TorusGeometry(1, 0.07, 6, 48)
RING.rotateX(Math.PI / 2)
/** A flat chevron pointing along +Z, lying on the ground. */
const CHEVRON = (() => {
  const s = new Shape()
  s.moveTo(0, 0.9)
  s.lineTo(0.75, -0.2)
  s.lineTo(0.42, -0.2)
  s.lineTo(0, 0.42)
  s.lineTo(-0.42, -0.2)
  s.lineTo(-0.75, -0.2)
  s.closePath()
  const g = new ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  g.rotateY(Math.PI)
  return g
})()
const GOLD = new MeshBasicMaterial({ color: '#ffd23a', toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false })
const GOLD_SOFT = new MeshBasicMaterial({ color: '#ffd23a', toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false })

/**
 * The first-time guide in the world (guide.js): a big gold arrow bobbing over where to
 * go next, a ring turning on the ground round it, and two chevrons at your feet pointing
 * the way there. Hidden mid-trip, when the next step is somewhere else, and once the
 * guide's done. Everything moves in the frame loop through refs: no React updates.
 */
export function GuideMarker() {
  const targetRef = useRef(null)
  const arrowRef = useRef(null)
  const ringRef = useRef(null)
  const pointerRef = useRef(null)

  useFrame((state) => {
    const target = targetRef.current
    const pointer = pointerRef.current
    if (!target || !pointer) return
    const game = getGame()
    const step = guideStep(game.profile)
    const place = game.profile.location
    const zone = step && !game.trip && step.place === place ? layoutOf(place).zones[step.zone] : null
    target.visible = Boolean(zone)
    pointer.visible = false
    if (!zone) return
    const t = state.clock.elapsedTime
    const y = groundHeightAt(place, zone.x, zone.z)
    target.position.set(zone.x, y, zone.z)
    if (arrowRef.current) arrowRef.current.position.y = 4.2 + Math.sin(t * 3) * 0.35
    if (ringRef.current) {
      ringRef.current.rotation.y = t * 0.8
      const r = zone.radius + 0.4 + Math.sin(t * 3) * 0.1
      ringRef.current.scale.set(r, 1, r)
    }
    // The chevrons at your feet, pointing at it, until you're nearly there.
    const p = runtime.player.position
    const dx = zone.x - p.x
    const dz = zone.z - p.z
    const far = Math.hypot(dx, dz)
    if (far > zone.radius + 2.5) {
      pointer.visible = true
      const yaw = Math.atan2(dx, dz)
      pointer.position.set(p.x + (dx / far) * 1.8, p.y + 0.08, p.z + (dz / far) * 1.8)
      pointer.rotation.set(0, yaw, 0)
      pointer.children[1].position.z = 0.9 + ((t * 1.5) % 1) * 0.3
    }
  })

  return (
    <>
      <group ref={targetRef} visible={false}>
        <mesh ref={arrowRef} geometry={ARROW} material={GOLD} />
        <mesh ref={ringRef} geometry={RING} material={GOLD_SOFT} position={[0, 0.25, 0]} />
      </group>
      <group ref={pointerRef} visible={false}>
        <mesh geometry={CHEVRON} material={GOLD} />
        <mesh geometry={CHEVRON} material={GOLD_SOFT} position={[0, 0, 0.9]} />
      </group>
    </>
  )
}

export default GuideMarker
