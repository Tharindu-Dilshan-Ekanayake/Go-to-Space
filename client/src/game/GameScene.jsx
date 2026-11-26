import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebGLRenderer } from 'three'

import { DESTINATION_IDS, EARTH, STATION } from '@shared/balance'

import { prepareAudio } from '../audio/sfx'
import { useBloxity } from '../bloxity/BloxityContext'
import { useBloxityStore } from '../bloxity/store'
import { useGame, useScenePlace } from '../store/game'
import { RENDER_SCALES, useQuality } from '../store/quality'
import ErrorBoundary from '../ui/ErrorBoundary'
import BlobShadows from './BlobShadows'
import FollowCamera from './FollowCamera'
import Particles from './fx/Particles'
import WorldLabels from './labels/WorldLabels'
import Lighting from './Lighting'
import PerfProbe from './PerfProbe'
import { CraftEnvironment } from './places/craft'
import EarthBase from './places/EarthBase'
import { warmPlanets } from './places/planets'
import Player from './Player'
import RemoteAvatars from './remote/RemoteAvatars'
import RemotePlayers from './remote/RemotePlayers'
import { lookOf } from './sceneStyle'
import ShaderWarmup from './ShaderWarmup'
import Sky from './Sky'
import { showSky } from './skyState'
import { setTextureAnisotropy, lobbyTexturesReady } from './textures'

// r3f-perf is a dev-only overlay (?perf in the URL). The DEV check is static, so the
// import and the package are dropped from production builds entirely.
const DevPerf = import.meta.env.DEV
  ? lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })))
  : null
const showDevPerf = import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')

// Everywhere but Earth is its own chunk, fetched once the lobby is on screen (and
// before you could possibly need it) so it never delays time-to-playable.
const loadStation = () => import('./places/Station')
const loadSurface = () => import('./places/Surface')
const loadFlight = () => import('./places/Flight')
const Station = lazy(loadStation)
const Surface = lazy(loadSurface)
const Flight = lazy(loadFlight)
const preloadPlaces = () => Promise.all([loadStation(), loadSurface(), loadFlight()]).catch(() => null)

/**
 * Fires `onFirstFrame` after the renderer has actually drawn once.
 * "Ready" should mean "the player can see the game", not "React mounted".
 */
function FirstFrameSignal({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    performance.mark('pp:first-frame')
    // Deferred: never update React state from inside the frame loop.
    setTimeout(onFirstFrame, 0)
  })
  return null
}

/** The sky and fog of the place on screen, set whenever it changes (or the view distance does). */
function PlaceSky({ place, viewDistance }) {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    showSky(place, scene.fog, viewDistance)
    gl.setClearColor(lookOf(place).sky.horizon)
  }, [place, scene, gl, viewDistance])
  return null
}

/**
 * The place you're in - Earth's spaceport, Halo Station or a destination's surface -
 * or the flight scene while you're travelling between them. Each away scene unmounts
 * (and frees its meshes and textures) when you leave it.
 */
function PlaceScene({ place }) {
  const trip = useGame((s) => s.trip)
  if (trip) {
    return (
      <Suspense fallback={null}>
        <Flight trip={trip} />
      </Suspense>
    )
  }
  if (place === EARTH) return <EarthBase />
  return (
    <Suspense fallback={null}>
      {place === STATION && <Station />}
      {DESTINATION_IDS.includes(place) && <Surface key={place} place={place} />}
    </Suspense>
  )
}

/** Keeps the camera's far plane in step with the preset's view distance. */
function ViewDistance({ far }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { camera } = get()
    camera.far = far
    camera.updateProjectionMatrix()
  }, [get, far])
  return null
}

/**
 * The camera's vertical field of view for a screen `aspect` wide: 60 degrees on a
 * landscape screen; wider on one held upright, so the scene still fits across a phone in
 * portrait instead of being cropped to a narrow slit.
 */
const fovForAspect = (aspect) => (aspect >= 1 ? 60 : Math.min(84, 60 / Math.sqrt(Math.max(0.3, aspect))))

/** Keeps the field of view right for the screen's shape as the phone turns. */
function AspectFov() {
  const get = useThree((s) => s.get)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  useEffect(() => {
    const { camera } = get()
    camera.fov = fovForAspect(width / Math.max(1, height))
    camera.updateProjectionMatrix()
  }, [get, width, height])
  return null
}

/**
 * The 3D view. Owns the renderer lifecycle: quality-driven settings, automatic preset
 * drops when FPS falls under budget, and recovery from a lost WebGL context.
 *
 * @param {{ onReady?: () => void }} props called once the avatar is in and a frame
 *   has been drawn
 */
export function GameScene({ onReady }) {
  const { game } = useBloxity()
  const settings = useQuality((s) => s.settings)
  const antialias = useQuality((s) => s.antialias)
  // A level picked in Settings rebuilds the whole 3D view with it.
  const rebuild = useQuality((s) => s.rebuild)
  const degrade = useQuality((s) => s.degrade)
  const recover = useQuality((s) => s.recover)
  const renderScale = useQuality((s) => RENDER_SCALES[s.renderStep])
  // Boxity ad break: nothing renders until it's over.
  const adBreak = useBloxityStore((s) => s.adBreak)
  const place = useScenePlace()

  const [warmedUp, setWarmedUp] = useState(false)
  const [firstFrame, setFirstFrame] = useState(false)
  const [texturesReady, setTexturesReady] = useState(false)
  const [contextKey, setContextKey] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  /** The last rebuild (see quality.js) whose shaders have warmed up. */
  const [warmedRebuild, setWarmedRebuild] = useState(0)
  // Rebuilt for a new graphics level, still compiling: a cover instead of an empty sky.
  const rebuilding = rebuild !== warmedRebuild
  const readySent = useRef(false)

  const handleWarmedUp = useCallback(() => {
    setWarmedUp(true)
    setWarmedRebuild(useQuality.getState().rebuild)
  }, [])
  const handleFirstFrame = useCallback(() => setFirstFrame(true), [])

  useEffect(() => {
    game.loadingStep('Preparing scene…')
  }, [game])

  // Playable once every shader is compiled and the first real frame is drawn. The
  // player's own avatar streams in afterwards (a blocky stand-in shows meanwhile), so a
  // slow avatar CDN never holds the game up.
  // The lobby's surface textures are painted on a worker; give them a moment so the
  // first look is the finished one (they show in flat colour if they're any slower).
  useEffect(() => {
    let live = true
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500))
    Promise.race([lobbyTexturesReady(), timeout]).then(() => {
      if (live) setTexturesReady(true)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!warmedUp || !firstFrame || !texturesReady || readySent.current) return
    readySent.current = true
    performance.mark('pp:ready')
    game.loadingEnd()
    onReady?.()
    // Nothing on screen needs these yet, so they wait until the game is up: the away
    // scenes' code (so the first trip never waits for it) and, at the first idle moment,
    // the audio engine - built on the first tap instead it would freeze that tap.
    if ('requestIdleCallback' in window) {
      requestIdleCallback(prepareAudio, { timeout: 1500 })
      requestIdleCallback(preloadPlaces, { timeout: 4000 })
    } else {
      setTimeout(prepareAudio, 200)
      setTimeout(preloadPlaces, 1500)
    }
    // And the planets, queued on the texture worker.
    warmPlanets()
  }, [warmedUp, firstFrame, texturesReady, game, onReady])

  // A lost context (GPU reset, too many tabs, backgrounded on mobile) is recovered by
  // remounting the canvas, which builds a fresh context and re-uploads everything.
  // Game state lives in stores, so nothing is lost but a moment of rendering.
  const handleCreated = useCallback(({ gl }) => {
    performance.mark('pp:gl-created')
    gl.setClearColor(lookOf('earth').sky.horizon)
    // Ground seen at a low angle stays sharp: anisotropic filtering, as much as the GPU
    // offers up to 4x on LOW (cheap) and 8x above.
    const level = useQuality.getState().level
    setTextureAnisotropy(Math.min(level === 'LOW' ? 4 : 8, gl.capabilities.getMaxAnisotropy()))
    // Checking every program's compile status forces the driver to finish it on the
    // spot. Worth it while developing; in production it only costs start-up time.
    gl.debug.checkShaderErrors = import.meta.env.DEV
    const canvas = gl.domElement
    let remountTimer = null
    const remount = () => {
      clearTimeout(remountTimer)
      setContextLost(false)
      setContextKey((k) => k + 1)
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      // A canvas already taken off the page was replaced on purpose (a new graphics
      // level), and losing its context is how it's cleaned up: nothing to recover.
      if (!canvas.isConnected) return
      e.preventDefault()
      setContextLost(true)
      // Don't wait forever for a 'restored' that may never come.
      remountTimer = setTimeout(remount, 1500)
    })
    canvas.addEventListener('webglcontextrestored', remount)
  }, [])

  // Never set state from the monitor's frame callback directly.
  const handleDecline = useCallback(() => setTimeout(degrade, 0), [degrade])
  const handleIncline = useCallback(() => setTimeout(recover, 0), [recover])

  const dpr = Math.min(settings.dpr, window.devicePixelRatio || 1) * renderScale

  // The renderer is built here rather than by R3F so its creation (the WebGL context,
  // often the slowest single step of start-up) is measured, and so the canvas is opaque:
  // the sky covers it anyway, and an opaque canvas is cheaper for the browser to
  // composite.
  const createRenderer = useMemo(
    () => (defaults) => {
      performance.mark('pp:gl-start')
      const renderer = new WebGLRenderer({
        ...defaults,
        alpha: false,
        antialias,
        stencil: false,
        powerPreference: 'high-performance',
      })
      performance.mark('pp:gl-end')
      return renderer
    },
    [antialias],
  )

  return (
    <>
      <Canvas
        key={`${contextKey}:${rebuild}`}
        frameloop={adBreak ? 'never' : 'always'}
        dpr={dpr}
        gl={createRenderer}
        // PCF, not R3F's default "soft": three r18x removed PCFSoftShadowMap.
        shadows={settings.shadows === 'realtime' ? 'percentage' : false}
        // No tone mapping. The default (ACES) desaturates the toy colours; the palette
        // and light levels in sceneStyle.js are chosen to look right without it.
        flat
        camera={{ position: [0, 6, 26], fov: 60, near: 0.5, far: settings.viewDistance }}
        onCreated={handleCreated}
      >
        <fog attach="fog" args={[lookOf(EARTH).fog.color, settings.fogNear, settings.viewDistance * 0.95]} />
        <ViewDistance far={settings.viewDistance} />
        <AspectFov />
        {/* Under 45 FPS: shed load (quality.degrade). Back over 58 with room to spare:
            resolution comes back (quality.recover). After a few flips back and forth it
            settles where it is rather than see-sawing. */}
        <PerformanceMonitor bounds={() => [45, 58]} flipflops={4} onDecline={handleDecline} onIncline={handleIncline} />

        <Sky />
        <CraftEnvironment />
        <PlaceSky place={place} viewDistance={settings.viewDistance} />
        <Lighting />
        <PlaceScene place={place} />
        <WorldLabels />
        <Particles />
        <RemotePlayers />
        <RemoteAvatars />
        <Player />
        <BlobShadows />

        <FollowCamera />
        <ShaderWarmup onDone={handleWarmedUp} />
        {warmedUp && <FirstFrameSignal onFirstFrame={handleFirstFrame} />}
        <PerfProbe />
        {showDevPerf && DevPerf && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <DevPerf position="bottom-right" minimal />
            </Suspense>
          </ErrorBoundary>
        )}
      </Canvas>

      {(contextLost || rebuilding) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-sky-400/80 text-2xl text-white">
          <span className="pp-stroke">Reloading graphics…</span>
        </div>
      )}
    </>
  )
}

export default GameScene
