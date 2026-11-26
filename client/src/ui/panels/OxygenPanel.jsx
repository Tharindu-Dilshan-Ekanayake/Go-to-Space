import { useEffect, useState } from 'react'

import { breathable, OXYGEN_TANKS, refillCost, tankById } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'
import { oxygenLeft, formatAir } from '../hud/oxygen'

/** A tank, drawn: a rounded cylinder in its colour, a valve on top, a gauge and a band. */
function TankArt({ tank, size = 110 }) {
  const big = tank.seconds >= 360
  return (
    <svg viewBox="0 0 100 120" width={u(size)} height={u(size * 1.2)} aria-hidden="true">
      <defs>
        <linearGradient id={`tank-${tank.id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.25" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {(big ? [30, 70] : [50]).map((x) => (
        <g key={x}>
          <rect x={x - (big ? 17 : 24)} y="24" width={big ? 34 : 48} height="88" rx={big ? 17 : 22} fill={tank.color} stroke="#111" strokeWidth="4" />
          <rect x={x - (big ? 17 : 24)} y="24" width={big ? 34 : 48} height="88" rx={big ? 17 : 22} fill={`url(#tank-${tank.id})`} />
          <rect x={x - (big ? 17 : 24)} y="62" width={big ? 34 : 48} height="9" fill="#ffffff" opacity="0.85" />
          <rect x={x - 6} y="10" width="12" height="16" rx="3" fill="#c3c9d3" stroke="#111" strokeWidth="3" />
        </g>
      ))}
      <circle cx="50" cy="44" r="10" fill="#f4f6fa" stroke="#111" strokeWidth="3" />
      <path d="M50 44 L56 39" stroke="#e8323c" strokeWidth="3" strokeLinecap="round" />
      <text x="50" y="98" textAnchor="middle" fontSize="18" fontWeight="900" fill="#111">
        O₂
      </text>
    </svg>
  )
}

/**
 * The Oxygen Store: how much air you have, a refill (free where there's air, a little
 * Money out on the planets) and bigger tanks to buy. Opens when you step into a store's
 * ring; buying and refilling only work there.
 */
export function OxygenPanel() {
  const profile = useGame((s) => s.profile)
  const atStore = useGame((s) => s.zone === 'o2')
  const [left, setLeft] = useState(() => oxygenLeft())
  useEffect(() => {
    const id = setInterval(() => setLeft(oxygenLeft()), 250)
    return () => clearInterval(id)
  }, [])

  const tank = tankById(profile.tank)
  const place = profile.location
  const cost = refillCost(place)
  const fraction = Math.max(0, Math.min(1, left / tank.seconds))
  const full = fraction > 0.995
  const air = breathable(place)

  const refill = () => {
    if (!atStore || full || profile.money < cost) {
      sfx.error()
      return
    }
    actions.refillOxygen()
  }
  const buy = (t) => {
    if (!atStore || profile.money < t.price) {
      sfx.error()
      return
    }
    actions.buyTank(t.id)
  }

  return (
    <Panel title="OXYGEN STORE" icon="store" width={1100}>
      <div
        className="flex flex-wrap items-center"
        style={{
          gap: u(18),
          padding: u(14),
          marginBottom: u(12),
          borderRadius: u(12),
          border: `${u(4)} solid #111`,
          background: 'linear-gradient(90deg, #12305a, #0d1a33)',
        }}
      >
        <TankArt tank={tank} size={84} />
        <div className="flex flex-col" style={{ flex: 1, minWidth: u(320), gap: u(6) }}>
          <span style={{ fontSize: u(34) }}>
            <StrokeText stroke={u(6)} gradient={GRADIENTS.gold}>{`${tank.name}: ${formatAir(left)} of air`}</StrokeText>
          </span>
          <div
            style={{
              height: u(26),
              borderRadius: u(14),
              border: `${u(4)} solid #111`,
              background: '#0a0f1c',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${fraction * 100}%`,
                height: '100%',
                background: fraction < 0.25 ? 'linear-gradient(90deg,#ff4a3b,#ff9a2e)' : 'linear-gradient(90deg,#2fa8ff,#7fe2ff)',
                transition: 'width 0.25s linear',
              }}
            />
          </div>
          <span
            style={{
              fontSize: u(21),
              color: '#cfe8ff',
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 600,
            }}
          >
            {air ? 'There is air here: your tank fills up by itself.' : 'No air here: your tank runs down. Run dry and a rescue shuttle takes you back to Halo Station.'}
          </span>
        </div>
        {!air && (
          <ChunkyButton gradient={atStore && !full && profile.money >= cost ? GRADIENTS.greenButton : GRADIENTS.greyButton} onClick={refill} style={{ height: u(70), minWidth: u(250) }}>
            <span style={{ fontSize: u(30) }}>
              <StrokeText stroke={u(6)}>{full ? 'Tank full' : `Refill $${formatNumber(cost)}`}</StrokeText>
            </span>
          </ChunkyButton>
        )}
      </div>
      {!atStore && (
        <p className="m-0 text-center" style={{ fontSize: u(26), marginBottom: u(12) }}>
          <StrokeText stroke={u(5)} fill="#ffd27a" className="pp-text-wrap">
            Step into an Oxygen Store's ring to refill and buy tanks. There's one on Earth, on Halo Station and on every planet.
          </StrokeText>
        </p>
      )}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${u(240)}, 1fr))`,
          gap: u(12),
        }}
      >
        {OXYGEN_TANKS.map((t) => {
          const owned = t.seconds <= tank.seconds
          const yours = t.id === tank.id
          let button
          if (yours)
            button = {
              label: 'Your tank',
              gradient: GRADIENTS.greyButton,
              disabled: true,
            }
          else if (owned)
            button = {
              label: 'Smaller',
              gradient: GRADIENTS.greyButton,
              disabled: true,
            }
          else
            button = {
              label: `$${formatNumber(t.price)}`,
              gradient: atStore && profile.money >= t.price ? GRADIENTS.greenButton : GRADIENTS.greyButton,
              onClick: () => buy(t),
            }
          return (
            <div
              key={t.id}
              className="flex flex-col items-center text-center"
              style={{
                padding: u(12),
                borderRadius: u(10),
                border: `${u(5)} solid ${yours ? '#ffd21f' : '#111'}`,
                background: 'linear-gradient(180deg, #1f3550, #121b2e)',
              }}
            >
              <TankArt tank={t} />
              <span style={{ fontSize: u(32), lineHeight: 1.1 }}>
                <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
                  {t.name}
                </StrokeText>
              </span>
              <span
                style={{
                  fontSize: u(22),
                  margin: `${u(4)} 0`,
                  color: '#cfe8ff',
                  fontFamily: 'system-ui, sans-serif',
                  fontWeight: 600,
                }}
              >{`${formatAir(t.seconds)} of air`}</span>
              <ChunkyButton gradient={button.gradient} disabled={button.disabled} onClick={button.onClick} className="w-full" style={{ height: u(62) }}>
                <span style={{ fontSize: u(30) }}>
                  <StrokeText stroke={u(6)}>{button.label}</StrokeText>
                </span>
              </ChunkyButton>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export default OxygenPanel
