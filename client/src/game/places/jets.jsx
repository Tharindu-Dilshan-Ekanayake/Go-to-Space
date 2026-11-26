import { useMemo } from 'react'

import { jetGear, jetPad, jetPoint, jetsOf } from '@shared/world'

import { useQuality } from '../../store/quality'
import { STYLE } from '../materials'
import { useCraftScatter } from './craft'
import { GEO, useProps } from './kit'
import { addSpaceliner } from './liner'
import { addSpaceplane } from './vehicles'

const spotOf = (j) => ({ x: j.x, y: jetGear(j), z: j.z, s: j.scale, r: j.yaw })

/**
 * The jets parked in `place` that you can sit in (shared/world.js jetsOf): two-seat
 * open-cockpit fighters and the sixteen-seat spaceliner, on their gear, each with a
 * boarding pad beside it - step on the pad and you climb aboard (Player.jsx). A pad is a
 * low round platform: a glowing rim and inner ring, a seat sign in the middle and
 * chevrons pointing to the jet. Every jet of a kind is one set of instanced meshes, all
 * the pads one more.
 */
export function ParkedJets({ place }) {
  const jets = useMemo(() => jetsOf(place), [place])
  const fighters = useMemo(() => jets.filter((j) => j.kind !== 'liner').map(spotOf), [jets])
  const liners = useMemo(() => jets.filter((j) => j.kind === 'liner').map(spotOf), [jets])
  const lite = useQuality((st) => st.level === 'LOW')
  const fighterMeshes = useCraftScatter((c) => addSpaceplane(c, { gear: true, open: true, lite }), fighters, `f:${place}:${lite}`)
  const linerMeshes = useCraftScatter((c) => addSpaceliner(c), liners, `l:${place}`)

  const pads = useProps((b) => {
    for (const jet of jets) {
      const pad = jetPad(jet)
      const r = pad.radius
      const y = (jet.y || 0) + 0.01
      // Which way the jet is from the pad: the chevrons and the seat sign face it.
      const centre = jetPoint(jet, 0, jet.kind === 'liner' ? 5.6 : 2)
      const toward = Math.atan2(centre.x - pad.x, centre.z - pad.z)
      b.add(GEO.cylinder, {
        position: [pad.x, y + 0.04, pad.z],
        scale: [r + 0.12, 0.08, r + 0.12],
        color: '#c3c9d3',
        style: STYLE.SMOOTH,
      })
      b.add(GEO.cylinder, {
        position: [pad.x, y + 0.085, pad.z],
        scale: [r, 0.02, r],
        color: '#16203a',
        style: STYLE.SMOOTH,
      })
      b.add(GEO.ring, {
        position: [pad.x, y + 0.1, pad.z],
        rotation: [Math.PI / 2, 0, 0],
        scale: [r - 0.05, r - 0.05, 1.4],
        color: '#7fe2ff',
        style: STYLE.GLOW,
      })
      b.add(GEO.ring, {
        position: [pad.x, y + 0.1, pad.z],
        rotation: [Math.PI / 2, 0, 0],
        scale: [r * 0.62, r * 0.62, 0.8],
        color: '#2f8fd0',
        style: STYLE.GLOW,
      })
      // A seat, drawn in light: cushion and back, facing the jet.
      const sx = Math.sin(toward)
      const sz = Math.cos(toward)
      b.box(pad.x, y + 0.11, pad.z, 0.62, 0.02, 0.5, '#7fe2ff', STYLE.GLOW, [0, toward, 0])
      b.box(pad.x - sx * 0.3, y + 0.11, pad.z - sz * 0.3, 0.62, 0.02, 0.14, '#7fe2ff', STYLE.GLOW, [0, toward, 0])
      // Three chevrons on the rim's jet side, pointing aboard.
      for (let i = 0; i < 3; i += 1) {
        const d = r * 0.7 + i * 0.32
        const cx = pad.x + sx * d
        const cz = pad.z + sz * d
        for (const side of [-1, 1]) {
          const a = toward + side * 0.75
          b.box(cx - Math.sin(a) * 0.14, y + 0.11, cz - Math.cos(a) * 0.14, 0.08, 0.02, 0.34, '#ffd23a', STYLE.GLOW, [0, a, 0])
        }
      }
    }
  }, place)

  return (
    <group>
      {fighters.length > 0 && <primitive object={fighterMeshes} />}
      {liners.length > 0 && <primitive object={linerMeshes} />}
      {pads && <primitive object={pads} />}
    </group>
  )
}

export default ParkedJets
