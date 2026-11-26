import { useMemo } from 'react'

import { SAFE_ROOM, SAFE_ROOM_SEGMENTS, safeRoomWallAngles } from '@shared/world'

import { STYLE } from '../materials'
import { GEO, useProps } from './kit'

const WALL = 2.4
const WHITE = '#eef1f5'
const TRIM = '#ff7a1a'

/**
 * The safe room every destination has (shared/world.js SAFE_ROOM): the outpost's habitat
 * dome, big enough to walk into, with air inside - your oxygen refills while you're in
 * it. A curved white wall with a lit window band and an orange cap, a wide airlock
 * doorway with lit jambs facing the landing pad, a clear glass dome over it all, and
 * inside: a floor with a rug, two bunks, a table and stools, potted plants, a glowing
 * oxygen generator, a wall screen, supply crates and a ring of light under the dome.
 * Two draw calls: the furnished room, and the glass.
 */
export function SafeRoom() {
  const room = useProps((b) => {
    const { x, z, radius: r, door } = SAFE_ROOM
    const at = (a, d) => [x + Math.cos(a) * d, z + Math.sin(a) * d]
    // Floor and rug.
    b.add(GEO.cylinder, { position: [x, 0.06, z], scale: [r + 0.3, 0.12, r + 0.3], color: '#c3c9d3', style: STYLE.SMOOTH })
    b.add(GEO.cylinder, { position: [x, 0.13, z], scale: [r * 0.45, 0.02, r * 0.45], color: '#3a7bd5', style: STYLE.SMOOTH })
    b.add(GEO.ring, { position: [x, 0.15, z], rotation: [Math.PI / 2, 0, 0], scale: [r * 0.45, r * 0.45, 0.8], color: '#9fe0ff', style: STYLE.GLOW })
    // The wall: a panel at each piece, turned along the curve, with the window band and cap.
    const width = ((Math.PI * 2 * r) / SAFE_ROOM_SEGMENTS) * 1.04
    for (const a of safeRoomWallAngles()) {
      const [wx, wz] = at(a, r)
      const turn = -a + Math.PI / 2
      b.box(wx, WALL / 2, wz, width, WALL, 0.3, WHITE, STYLE.SMOOTH, [0, turn, 0])
      b.box(wx, 1.55, wz, width, 0.45, 0.34, '#9fe0ff', STYLE.GLOW, [0, turn, 0])
      b.box(wx, WALL + 0.08, wz, width, 0.16, 0.42, TRIM, STYLE.SMOOTH, [0, turn, 0])
    }
    // The airlock doorway: lit jambs either side, a lintel, a step.
    for (const side of [-1, 1]) {
      const a = door + side * 0.42
      const [jx, jz] = at(a, r)
      b.box(jx, 1.4, jz, 0.5, 2.8, 0.6, WHITE, STYLE.SMOOTH, [0, -a + Math.PI / 2, 0])
      b.box(jx, 1.4, jz, 0.12, 2.6, 0.64, '#3aff8a', STYLE.GLOW, [0, -a + Math.PI / 2, 0])
    }
    {
      const [dx, dz] = at(door, r + 0.1)
      b.box(dx, 2.95, dz, 5.6, 0.3, 0.5, TRIM, STYLE.SMOOTH, [0, -door + Math.PI / 2, 0])
      const [sx, sz] = at(door, r + 0.9)
      b.box(sx, 0.06, sz, 4.4, 0.12, 1.2, '#9aa1ad', STYLE.SMOOTH, [0, -door + Math.PI / 2, 0])
    }
    // Two bunks against the back wall.
    for (const off of [-0.7, 0.7]) {
      const a = door + Math.PI + off
      const [bx, bz] = at(a, r - 1.3)
      const turn = -a + Math.PI / 2
      b.box(bx, 0.45, bz, 2.2, 0.5, 1.0, '#8d939c', STYLE.SMOOTH, [0, turn, 0])
      b.box(bx, 0.76, bz, 2.1, 0.14, 0.95, '#3a7bd5', STYLE.SMOOTH, [0, turn, 0])
      const [px, pz] = at(a, r - 1.3)
      b.box(px, 0.9, pz, 0.6, 0.14, 0.8, '#ffffff', STYLE.SMOOTH, [0, turn + 0.0, 0])
    }
    // A table with stools, a little off the middle.
    {
      const [tx, tz] = at(door + Math.PI * 0.55, 2.2)
      b.add(GEO.cylinder, { position: [tx, 0.95, tz], scale: [0.9, 0.08, 0.9], color: WHITE, style: STYLE.SMOOTH })
      b.add(GEO.cylinderLow, { position: [tx, 0.5, tz], scale: [0.12, 0.9, 0.12], color: '#8d939c', style: STYLE.SMOOTH })
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2
        b.add(GEO.cylinder, { position: [tx + Math.cos(a) * 1.25, 0.5, tz + Math.sin(a) * 1.25], scale: [0.32, 0.12, 0.32], color: TRIM, style: STYLE.SMOOTH })
        b.add(GEO.cylinderLow, { position: [tx + Math.cos(a) * 1.25, 0.25, tz + Math.sin(a) * 1.25], scale: [0.06, 0.5, 0.06], color: '#8d939c', style: STYLE.SMOOTH })
      }
    }
    // The oxygen generator: a tall tank with glowing bands.
    {
      const [gx, gz] = at(door - Math.PI * 0.62, r - 1.1)
      b.add(GEO.cylinder, { position: [gx, 1.1, gz], scale: [0.55, 2.2, 0.55], color: '#d7dce3', style: STYLE.SMOOTH })
      for (const y of [0.6, 1.2, 1.8]) b.add(GEO.cylinder, { position: [gx, y, gz], scale: [0.58, 0.08, 0.58], color: '#4fd2ff', style: STYLE.GLOW })
      b.add(GEO.sphere, { position: [gx, 2.3, gz], scale: [0.55, 0.3, 0.55], color: '#d7dce3', style: STYLE.SMOOTH })
    }
    // A wall screen, plants in pots, supply crates.
    {
      const a = door + Math.PI
      const [wx, wz] = at(a, r - 0.25)
      b.box(wx, 1.6, wz, 1.6, 0.9, 0.06, '#0d2a4a', STYLE.SMOOTH, [0, -a + Math.PI / 2, 0])
      const [ix, iz] = at(a, r - 0.3)
      b.box(ix, 1.6, iz, 1.4, 0.7, 0.04, '#3ad6ff', STYLE.GLOW, [0, -a + Math.PI / 2, 0])
    }
    for (const off of [0.75, -0.75]) {
      const [px, pz] = at(door + off, r - 0.9)
      b.add(GEO.cylinder, { position: [px, 0.35, pz], scale: [0.35, 0.5, 0.35], color: TRIM, style: STYLE.SMOOTH })
      b.add(GEO.sphere, { position: [px, 1.0, pz], scale: [0.55, 0.65, 0.55], color: '#3fae4a', style: STYLE.SMOOTH })
    }
    {
      const [cx, cz] = at(door - Math.PI * 0.35, r - 1.2)
      b.box(cx, 0.4, cz, 0.8, 0.8, 0.8, '#c8925a', STYLE.SMOOTH)
      b.box(cx + 0.5, 0.3, cz - 0.5, 0.6, 0.6, 0.6, '#c8925a', STYLE.SMOOTH)
    }
    // A ring of light high under the dome, and the beacon on top.
    b.add(GEO.ring, { position: [x, WALL + r * 0.42, z], rotation: [Math.PI / 2, 0, 0], scale: [r * 0.5, r * 0.5, 1], color: '#fff6d0', style: STYLE.GLOW })
    b.add(GEO.cylinder, { position: [x, WALL + r * 0.62 + 0.1, z], scale: [0.6, 0.2, 0.6], color: TRIM, style: STYLE.SMOOTH })
  }, '')

  const glassScale = useMemo(() => [SAFE_ROOM.radius + 0.1, SAFE_ROOM.radius * 0.62, SAFE_ROOM.radius + 0.1], [])
  return (
    <group>
      {room && <primitive object={room} />}
      <mesh position={[SAFE_ROOM.x, WALL + 0.12, SAFE_ROOM.z]} scale={glassScale} renderOrder={2}>
        <sphereGeometry args={[1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color="#cfeeff" emissive="#16303f" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default SafeRoom
