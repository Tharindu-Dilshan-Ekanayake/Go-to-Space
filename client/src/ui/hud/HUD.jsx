import { useEffect, useRef, useState } from 'react'

import { breathable, destinationById, EARTH, LAUNCH_WARNING_MS, msToLaunch, OXYGEN_LOW, PLACE_NAMES, STATION, tankById } from '@shared/balance'
import { formatClock, formatNumber } from '@shared/format'
import { isUnlocked, payMultiplier } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { serverNow, useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { formatAir, oxygenLeft } from './oxygen'
import { GRADIENTS, u } from './style'
import TopBar from './TopBar'

const placeName = (place) => PLACE_NAMES[place] || place

/** Your Money, top-left, with a coin. */
function MoneyCounter() {
  const money = useGame((s) => s.profile.money)
  const deliveries = useGame((s) => s.profile.stats.deliveries)
  return (
    <div className="hud-money pointer-events-none absolute flex flex-col" style={{ gap: u(4) }}>
      <div className="flex items-center" style={{ gap: u(10), fontSize: u(58), lineHeight: 1 }}>
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            width: u(62),
            height: u(62),
            background: GRADIENTS.gold,
            border: `${u(5)} solid #111`,
            fontSize: u(40),
          }}
        >
          <StrokeText stroke={u(7)}>$</StrokeText>
        </span>
        <StrokeText stroke={u(11)} gradient={GRADIENTS.gold}>
          {formatNumber(money)}
        </StrokeText>
      </div>
      <div style={{ fontSize: u(28), marginLeft: u(6) }}>
        <StrokeText stroke={u(6)}>{`${formatNumber(deliveries)} ${deliveries === 1 ? 'delivery' : 'deliveries'}`}</StrokeText>
      </div>
    </div>
  )
}

/** The menu tiles down the left: Star Map, Suits, Store. */
function LeftMenu() {
  const togglePanel = useGame((s) => s.togglePanel)
  const tiles = [
    { id: 'map', label: 'MAP', icon: 'portal', gradient: GRADIENTS.blueButton },
    {
      id: 'suits',
      label: 'SUITS',
      icon: 'star',
      gradient: GRADIENTS.purpleButton,
    },
    {
      id: 'store',
      label: 'STORE',
      icon: 'store',
      gradient: GRADIENTS.greenButton,
    },
  ]
  return (
    <div className="hud-menu pointer-events-none absolute flex flex-col" style={{ gap: u(14) }}>
      {tiles.map((t) => (
        <ChunkyButton key={t.id} gradient={t.gradient} onClick={() => togglePanel(t.id)} title={t.label} radius={18} style={{ width: u(128), height: u(112), flexDirection: 'column' }}>
          <Icon name={t.icon} size={u(54)} />
          <span style={{ fontSize: u(28), lineHeight: 1 }}>
            <StrokeText stroke={u(6)}>{t.label}</StrokeText>
          </span>
        </ChunkyButton>
      ))}
    </div>
  )
}

/** The package you carry (or a nudge to get one), bottom-left. */
function PackageCard() {
  const pkg = useGame((s) => s.profile.package)
  const mult = useGame((s) => payMultiplier(s.profile))
  return (
    <div
      className="hud-package pointer-events-auto absolute text-center"
      style={{
        width: u(420),
        padding: `${u(12)} ${u(16)}`,
        background: 'rgba(10,12,18,0.82)',
        border: `${u(5)} solid #ffffff`,
        borderRadius: u(10),
        boxShadow: `0 0 0 ${u(4)} #111`,
      }}
    >
      {pkg ? (
        <>
          <div style={{ fontSize: u(30), color: '#cfd8e6' }}>Deliver to:</div>
          <div style={{ fontSize: u(60), lineHeight: 1.05 }}>
            <StrokeText stroke={u(10)} gradient={GRADIENTS.gold}>
              {placeName(pkg.to)}
            </StrokeText>
          </div>
          <div className="flex items-center justify-center" style={{ fontSize: u(28), gap: u(14), marginTop: u(4) }}>
            <span style={{ color: '#8dff4f' }}>{`Pays $${formatNumber(Math.round(pkg.reward * mult))}`}</span>
            <button type="button" className="pp-btn underline" style={{ color: '#ff9a8a' }} onClick={() => actions.dropPackage()}>
              drop it
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: u(34) }}>
            <StrokeText stroke={u(7)}>No package</StrokeText>
          </div>
          <div style={{ fontSize: u(26), color: '#cfd8e6' }}>Grab one at any Cargo Pad</div>
        </>
      )}
    </div>
  )
}

/** What to do next, worked out from where you are and what you carry. */
function objectiveFor(profile, zone) {
  const place = profile.location
  const pkg = profile.package
  // First things first: nobody goes to space without a suit.
  if (profile.suit === 'none' && place === EARTH) return zone === 'suits' ? 'Take the FREE Rookie suit!' : 'Get your FREE space suit at the SUIT SHOP'
  if (!pkg) return place === STATION ? 'Fly to a planet (or take the pod home) to find a Cargo Pad' : 'Step on the CARGO PAD to pick up a package'
  if (pkg.to === place) return 'Step on the CARGO PAD to deliver!'
  if (place === EARTH) return zone === 'boarding' ? 'Stay in the ring - you launch at zero!' : 'Board the ROCKET: stand in the green ring at liftoff'
  if (place === STATION) {
    if (pkg.to === EARTH) return 'Take the RE-ENTRY POD down to Earth'
    return isUnlocked(profile, pkg.to) ? `Walk into the ${placeName(pkg.to).toUpperCase()} shuttle bay` : `Unlock ${placeName(pkg.to)} on the Star Map`
  }
  return 'Take the SHUTTLE BEACON back up to Halo Station'
}

/**
 * Out on a planet: the air left in your tank - a bar and a clock, blue going red when
 * it runs low (with a beep every couple of seconds), and what to do about it.
 */
function OxygenMeter() {
  const profile = useGame((s) => s.profile)
  const travelling = useGame((s) => s.trip !== null)
  const [left, setLeft] = useState(() => oxygenLeft())
  const lastBeep = useRef(0)
  const shown = !travelling && !breathable(profile.location)
  useEffect(() => {
    if (!shown) return undefined
    const id = setInterval(() => {
      const now = oxygenLeft()
      setLeft(now)
      const low = now / tankById(useGame.getState().profile.tank).seconds < OXYGEN_LOW
      if (low && now > 0 && performance.now() - lastBeep.current > 2000) {
        lastBeep.current = performance.now()
        sfx.beep(true)
      }
    }, 250)
    return () => clearInterval(id)
  }, [shown])
  if (!shown) return null
  const full = tankById(profile.tank).seconds
  const fraction = Math.max(0, Math.min(1, left / full))
  const low = fraction < OXYGEN_LOW
  return (
    <div className="flex flex-col items-center" style={{ gap: u(4) }}>
      <div
        className={`flex items-center${low ? ' pp-pulse' : ''}`}
        style={{
          gap: u(12),
          padding: `${u(6)} ${u(18)}`,
          borderRadius: u(40),
          background: low ? 'rgba(200,30,40,0.85)' : 'rgba(10,12,18,0.75)',
          border: `${u(4)} solid #111`,
          fontSize: u(34),
        }}
      >
        <StrokeText stroke={u(7)} fill="#bff0ff">
          O₂
        </StrokeText>
        <div
          style={{
            width: u(220),
            height: u(22),
            borderRadius: u(12),
            border: `${u(3)} solid #111`,
            background: '#0a0f1c',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${fraction * 100}%`,
              height: '100%',
              background: low ? 'linear-gradient(90deg,#ff4a3b,#ff9a2e)' : 'linear-gradient(90deg,#2fa8ff,#7fe2ff)',
              transition: 'width 0.25s linear',
            }}
          />
        </div>
        <StrokeText stroke={u(7)}>{formatAir(left)}</StrokeText>
      </div>
      {low && (
        <div style={{ fontSize: u(28) }}>
          <StrokeText stroke={u(6)} fill="#ffb0a8">
            LOW OXYGEN! Refill at the Oxygen Store, or fly back up
          </StrokeText>
        </div>
      )}
    </div>
  )
}

/** On Earth: the rocket countdown (urgent and beeping in its last seconds), and your next step. */
function TopCenter() {
  const profile = useGame((s) => s.profile)
  const zone = useGame((s) => s.zone)
  const [left, setLeft] = useState(() => msToLaunch(serverNow()))
  const onEarth = profile.location === EARTH
  const lastSecond = useRef(-1)

  useEffect(() => {
    if (!onEarth) return undefined
    const id = setInterval(() => {
      const ms = msToLaunch(serverNow())
      setLeft(ms)
      const second = Math.ceil(ms / 1000)
      if (second !== lastSecond.current) {
        lastSecond.current = second
        const boarding = useGame.getState().zone === 'boarding'
        if (second <= 10 && second > 0) sfx.beep(boarding)
      }
    }, 200)
    return () => clearInterval(id)
  }, [onEarth])

  const urgent = left <= LAUNCH_WARNING_MS
  return (
    <div className="hud-topcenter pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ gap: u(8), maxWidth: '70vw' }}>
      {onEarth && (
        <div
          className="flex items-center"
          style={{
            gap: u(12),
            padding: `${u(6)} ${u(22)}`,
            borderRadius: u(40),
            background: urgent ? 'rgba(200,30,40,0.85)' : 'rgba(10,12,18,0.75)',
            border: `${u(4)} solid #111`,
            fontSize: u(40),
          }}
        >
          <Icon name="flame" size={u(44)} />
          <StrokeText stroke={u(8)}>{left < 1000 ? 'LIFTOFF!' : `Liftoff in ${formatClock(left)}`}</StrokeText>
        </div>
      )}
      <OxygenMeter />
      <div className="text-center" style={{ fontSize: u(32), lineHeight: 1.15 }}>
        <StrokeText stroke={u(7)}>{objectiveFor(profile, zone)}</StrokeText>
      </div>
    </div>
  )
}

/** A short banner over the middle: deliveries, arrivals, badges, refusals. */
function Toast() {
  const toast = useGame((s) => s.toast)
  /** The id of the last toast whose time ran out. */
  const [expired, setExpired] = useState(null)
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setExpired(toast.id), 2800)
    return () => clearTimeout(id)
  }, [toast])
  const shown = toast && toast.id !== expired ? toast : null
  if (!shown) return null
  const gradient = shown.tone === 'bad' ? GRADIENTS.priceShort : shown.tone === 'info' ? GRADIENTS.blueButton : GRADIENTS.gold
  return (
    <div key={shown.id} className="pp-hint pointer-events-none absolute left-1/2 -translate-x-1/2 text-center" style={{ top: '24%', fontSize: u(54), maxWidth: '86vw' }}>
      <StrokeText stroke={u(11)} gradient={gradient}>
        {shown.text}
      </StrokeText>
    </div>
  )
}

/** Mid-trip: where you're going, and a bar filling up until you arrive. */
function TripOverlay() {
  const trip = useGame((s) => s.trip)
  const barRef = useRef(null)
  useEffect(() => {
    if (!trip) return undefined
    let frame = 0
    const step = () => {
      const t = Math.min(1, (performance.now() - trip.startedAt) / trip.duration)
      if (barRef.current) barRef.current.style.width = `${t * 100}%`
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [trip])
  if (!trip) return null
  const verb = trip.via === 'warp' ? 'Warping to' : trip.via === 'rocket' ? 'Launching to' : trip.via === 'pod' ? 'Descending to' : 'Flying to'
  const dest = destinationById(trip.to)
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center" style={{ bottom: u(90), width: u(720), maxWidth: '90vw' }}>
      <div style={{ fontSize: u(40) }}>
        <StrokeText stroke={u(8)}>{verb}</StrokeText>
      </div>
      <div style={{ fontSize: u(84), lineHeight: 1 }}>
        <StrokeText stroke={u(14)} gradient={GRADIENTS.gold}>
          {placeName(trip.to).toUpperCase()}
        </StrokeText>
      </div>
      {dest && <div style={{ fontSize: u(28), color: '#e6eefc', marginTop: u(6) }}>{dest.blurb}</div>}
      <div
        style={{
          height: u(18),
          marginTop: u(16),
          borderRadius: u(10),
          background: 'rgba(0,0,0,0.5)',
          border: `${u(3)} solid #fff`,
          overflow: 'hidden',
        }}
      >
        <div ref={barRef} style={{ height: '100%', width: 0, background: GRADIENTS.barFill }} />
      </div>
    </div>
  )
}

/**
 * The heads-up display: your Money top-left over the menu tiles, the package you carry
 * bottom-left, the launch countdown and your next step top-centre, and sound,
 * leaderboards, settings and your name tag top-right. Mid-trip only the trip overlay
 * shows.
 *
 * The root ignores pointer events so the canvas and joystick underneath keep working;
 * only the buttons themselves opt back in. While a panel is open the HUD steps aside.
 */
export function HUD() {
  const panelOpen = useGame((s) => s.panel !== null)
  const travelling = useGame((s) => s.trip !== null)
  const hide = (on) => ({ display: on ? 'none' : 'contents' })
  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-20 select-none">
      <div
        className="absolute inset-0 transition-opacity duration-150"
        style={{
          opacity: panelOpen ? 0 : 1,
          visibility: panelOpen ? 'hidden' : 'visible',
        }}
      >
        <TopBar />
        <div style={hide(travelling)}>
          <MoneyCounter />
          <LeftMenu />
          <PackageCard />
          <TopCenter />
        </div>
        <TripOverlay />
        <Toast />
      </div>
    </div>
  )
}

export default HUD
