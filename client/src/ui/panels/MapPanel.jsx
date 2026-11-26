import { useEffect, useRef } from 'react'

import { DESTINATIONS, EARTH, PLACE_NAMES, STATION, suitById, suitSurvives } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isUnlocked, payMultiplier } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { usePlanetThumb } from '../../game/places/planets'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/**
 * A little planet: its real painted map on a lit ball (the same map as in the sky), or a
 * shaded disc in its colour until that's painted - and for Halo Station.
 */
function PlanetDot({ body, color, size = 84, ring = false }) {
  const thumb = usePlanetThumb(body || 'moon')
  const picture = body ? thumb : null
  return (
    <span className="relative inline-block shrink-0" style={{ width: u(size), height: u(size) }}>
      {picture ? (
        <img src={picture} alt="" className="absolute inset-0" style={{ width: '100%', height: '100%', filter: `drop-shadow(0 0 ${u(10)} ${color}88)` }} />
      ) : (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle at 32% 30%, #ffffff55, ${color} 45%, #000000aa 100%)`, boxShadow: `0 0 ${u(18)} ${color}66` }}
        />
      )}
      {ring && <span className="absolute rounded-full" style={{ left: '-22%', right: '-22%', top: '42%', height: '16%', border: `${u(4)} solid #e8d9b0aa`, transform: 'rotate(-14deg)' }} />}
    </span>
  )
}

const HUBS = [
  { id: EARTH, color: '#2f7fe6', blurb: 'The spaceport: Cargo Pad, Suit Shop, rocket.' },
  { id: STATION, color: '#9fb4d8', blurb: 'Shuttles to every destination leave from here.' },
]

/**
 * The Star Map: every place in the game. Unlock destinations with Money (each pays more
 * per delivery than the last). There's no warping: every trip is flown. Opened
 * from the menu, the console on Earth, or by walking into a locked shuttle bay (which
 * scrolls to that destination).
 */
export function MapPanel() {
  const profile = useGame((s) => s.profile)
  const focus = useGame((s) => s.panelData?.focus ?? null)
  const focusRef = useRef(null)
  const mult = payMultiplier(profile)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus])

  const unlock = (dest) => {
    if (profile.money < dest.cost) {
      sfx.error()
      return
    }
    actions.unlock(dest.id)
  }

  return (
    <Panel title="STAR MAP" icon="portal" width={1120}>
      <p className="m-0 text-center" style={{ fontSize: u(24), marginBottom: u(12), color: '#cfd8e6', fontFamily: 'system-ui, sans-serif' }}>
        Unlock destinations to send packages further for more Money. Then fly there: the rocket to Halo Station, and its shuttles on to every planet.
      </p>
      <div className="flex flex-col" style={{ gap: u(10) }}>
        {[...HUBS.map((h) => ({ ...h, hub: true })), ...DESTINATIONS].map((place) => {
          const dest = place.hub ? null : place
          const open = place.hub || isUnlocked(profile, place.id)
          const here = profile.location === place.id
          const color = dest ? dest.look.planet : place.color
          const focused = focus === place.id
          return (
            <div
              key={place.id}
              ref={focused ? focusRef : null}
              className="flex flex-wrap items-center"
              style={{
                gap: u(16),
                padding: `${u(10)} ${u(16)}`,
                borderRadius: u(10),
                border: `${u(4)} solid ${focused ? '#ffd21f' : '#111'}`,
                background: open ? 'linear-gradient(90deg, #1d2a5c, #121a3a)' : 'linear-gradient(90deg, #2a2d36, #1a1c22)',
              }}
            >
              <PlanetDot body={place.id === STATION ? null : place.id} color={color} ring={place.id === 'titan'} />
              <div className="flex min-w-0 flex-1 flex-col" style={{ minWidth: u(260) }}>
                <span style={{ fontSize: u(42), lineHeight: 1.05 }}>
                  <StrokeText stroke={u(8)} gradient={open ? GRADIENTS.gold : undefined}>
                    {PLACE_NAMES[place.id]}
                  </StrokeText>
                </span>
                <span style={{ fontSize: u(22), color: '#cfd8e6', fontFamily: 'system-ui, sans-serif' }}>{dest ? dest.blurb : place.blurb}</span>
                {dest && (
                  <span style={{ fontSize: u(24), marginTop: u(2) }}>
                    <span style={{ color: '#8dff4f' }}>{`$${formatNumber(Math.round(dest.reward * mult))} a delivery`}</span>
                    <span style={{ color: '#9fb4d8' }}>{`  ·  gravity ${Math.round(dest.gravity * 100)}%`}</span>
                    <span style={{ color: suitSurvives(profile.suit, dest.id) ? '#8dff4f' : '#ff7a6a' }}>{`  ·  needs ${suitById(dest.minSuit).name} suit+`}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center" style={{ gap: u(10) }}>
                {!open && (
                  <ChunkyButton gradient={profile.money >= dest.cost ? GRADIENTS.greenButton : GRADIENTS.greyButton} onClick={() => unlock(dest)} title="Unlock" style={{ width: u(240), height: u(70) }}>
                    <span style={{ fontSize: u(30) }}>
                      <StrokeText stroke={u(6)}>{`Unlock $${formatNumber(dest.cost)}`}</StrokeText>
                    </span>
                  </ChunkyButton>
                )}
                {open && (
                  <ChunkyButton gradient={here ? GRADIENTS.blueButton : GRADIENTS.greyButton} disabled style={{ width: u(240), height: u(70) }}>
                    <span style={{ fontSize: u(here ? 30 : 28), lineHeight: 1.05 }} className="text-center">
                      <StrokeText stroke={u(6)}>{here ? 'You are here' : place.hub ? 'Open' : 'Unlocked'}</StrokeText>
                    </span>
                  </ChunkyButton>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export default MapPanel
