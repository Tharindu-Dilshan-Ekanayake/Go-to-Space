import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

import { iconUrl } from './icons'
import StrokeText from './StrokeText'

const TIPS = [
  'Step on a Cargo Pad to pick up a package - the card at the bottom left says where it goes.',
  'Stand in the green ring on the launch pad when the countdown hits zero to ride the rocket to Halo Station.',
  'At Halo Station, walk into a shuttle bay to fly to that planet.',
  'Further destinations pay much more per delivery. Unlock them on the Star Map.',
  'Better suits pay more for every delivery - and the best ones have a jetpack!',
  'Gravity is weaker on the moons: jump and see how high you go.',
  'Once you have been somewhere, the Star Map can warp you straight back.',
  'Deliver a package and you are handed the next one right away.',
]

/**
 * The loading screen's backdrop, deep space in plain CSS (no image to download): a
 * scatter of stars, a soft nebula glow, and the curve of a blue planet rising along the
 * bottom. Layers, top first.
 */
const SPACE_BACKDROP = [
  'radial-gradient(1.5px 1.5px at 12% 18%, #fff 50%, transparent 51%)',
  'radial-gradient(1.5px 1.5px at 78% 12%, #fff 50%, transparent 51%)',
  'radial-gradient(2px 2px at 64% 34%, #fff 50%, transparent 51%)',
  'radial-gradient(1.5px 1.5px at 30% 42%, #cfe6ff 50%, transparent 51%)',
  'radial-gradient(2px 2px at 88% 48%, #fff 50%, transparent 51%)',
  'radial-gradient(1.5px 1.5px at 6% 60%, #fff 50%, transparent 51%)',
  'radial-gradient(ellipse 120% 60% at 50% 125%, #5fb4ff 0 48%, #2f7fe6 52%, rgba(47,127,230,0.35) 56%, transparent 62%)',
  'radial-gradient(ellipse 60% 40% at 70% 30%, rgba(140,90,255,0.35), transparent 70%)',
  'linear-gradient(180deg, #02030a 0%, #0a1030 60%, #12205a 100%)',
].join(', ')

/**
 * Full-screen loading overlay. Progress is drei's asset loader progress, blended with a
 * time-based creep so a single large download never looks frozen, and it only reaches
 * 100% when the game reports ready (avatar in place, first frame drawn).
 *
 * @param {{ done: boolean }} props
 */
export function LoadingScreen({ done }) {
  const { progress } = useProgress()
  const [creep, setCreep] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])

  useEffect(() => {
    if (done) return undefined
    const id = setInterval(() => setCreep((c) => Math.min(90, c + (90 - c) * 0.06)), 120)
    return () => clearInterval(id)
  }, [done])

  useEffect(() => {
    if (!done) return undefined
    const id = setTimeout(() => setHidden(true), 450)
    return () => clearTimeout(id)
  }, [done])

  if (hidden) return null
  const shown = done ? 100 : Math.max(creep, Math.min(95, progress * 0.95))

  return (
    <div
      className="pp-font absolute inset-0 z-[100] flex flex-col items-center justify-center gap-8 transition-opacity duration-500"
      style={{
        opacity: done ? 0 : 1,
        background: SPACE_BACKDROP,
      }}
    >
      <div className="pp-loading-disc" aria-hidden="true">
        <img src={iconUrl('rocket')} alt="" width="150" height="150" draggable={false} />
      </div>

      {/* The game's name: ORBIT over a big gold EXPRESS, tilted like a sticker. */}
      <h1 className="m-0 flex flex-col items-center text-center leading-none" style={{ transform: 'rotate(-3deg)' }}>
        <span style={{ fontSize: 'clamp(30px, 7vw, 72px)' }}>
          <StrokeText stroke="0.16em" gradient="linear-gradient(180deg, #ffffff 0%, #ffffff 55%, #bfe6ff 56%, #6fb7ff 100%)">
           Go to
          </StrokeText>
        </span>
        <span style={{ fontSize: 'clamp(44px, 10vw, 118px)', marginTop: '-0.08em' }}>
          <StrokeText stroke="0.15em" gradient="linear-gradient(180deg, #fffaa8 0%, #ffd52a 45%, #ff9c00 100%)">
            Space
          </StrokeText>
        </span>
        <span className="text-base md:text-xl" style={{ marginTop: '0.4em' }}>
          <StrokeText stroke={5}>PICK UP • LAUNCH • DELIVER • EXPLORE</StrokeText>
        </span>
      </h1>

      <div className="w-[min(560px,80vw)]">
        <div className="relative h-9 overflow-hidden rounded-xl border-4 border-black bg-black/40">
          <div
            // Scaled, not resized: it moves while the game is starting up, and a transform
            // never needs a layout.
            className="h-full origin-left rounded-md transition-transform duration-200"
            style={{ transform: `scaleX(${shown / 100})`, background: 'linear-gradient(180deg, #fff27a 0%, #ffc61e 50%, #ff9a12 100%)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-lg">
            <StrokeText stroke={5}>{done ? 'READY!' : `LOADING ${Math.round(shown)}%`}</StrokeText>
          </div>
        </div>
        <p className="mt-4 text-center text-base md:text-lg">
          <StrokeText stroke={4}>{tip}</StrokeText>
        </p>
      </div>
    </div>
  )
}

export default LoadingScreen
