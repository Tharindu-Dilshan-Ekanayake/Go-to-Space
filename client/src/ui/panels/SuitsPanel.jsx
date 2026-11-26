import { SUITS } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/**
 * A suit, drawn as a bust to match the one you wear: shoulder armour and chest plate
 * with its glowing panel, the neck ring, the helmet with its band, ear pieces and tinted
 * visor - an antenna from Scout up, a headlamp from Ranger up, glowing trim on the top
 * suits, and a soft glow behind in the suit's colour.
 */
function SuitBust({ suit, size = 140 }) {
  const { main, accent, visor } = suit.colors
  const tier = suit.id === 'solar' ? SUITS.length : SUITS.indexOf(suit)
  const trim = ['nebula', 'eclipse', 'quasar', 'galaxy', 'solar'].includes(suit.id)
  const winged = ['quasar', 'galaxy', 'solar'].includes(suit.id)
  const id = `suit-${suit.id}`
  return (
    <svg viewBox="0 0 120 120" width={u(size)} height={u(size)} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-halo`} cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id={`${id}-visor`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="35%" stopColor={visor} />
          <stop offset="100%" stopColor="#0b1430" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="62" r="58" fill={`url(#${id}-halo)`} />
      {winged && (
        <g stroke={accent} strokeWidth="4" strokeLinecap="round" opacity="0.9">
          <line x1="22" y1="86" x2="4" y2="66" />
          <line x1="24" y1="96" x2="6" y2="84" />
          <line x1="98" y1="86" x2="116" y2="66" />
          <line x1="96" y1="96" x2="114" y2="84" />
        </g>
      )}
      {/* Shoulders and chest plate. */}
      <path d="M14 116 Q16 86 38 80 L82 80 Q104 86 106 116 Z" fill={main} stroke="#111" strokeWidth="4" />
      <path d="M14 116 Q16 86 38 80 L82 80 Q104 86 106 116 Z" fill={`url(#${id}-shell)`} />
      <ellipse cx="25" cy="90" rx="13" ry="9" fill={main} stroke="#111" strokeWidth="3.5" />
      <ellipse cx="95" cy="90" rx="13" ry="9" fill={main} stroke="#111" strokeWidth="3.5" />
      <rect x="40" y="90" width="40" height="22" rx="4" fill={main} stroke="#111" strokeWidth="3" />
      <rect x="40" y="90" width="40" height="5" fill={accent} />
      <rect x="58" y="99" width="18" height="9" rx="2" fill="#2b2e36" />
      <circle cx="62" cy="103.5" r="1.8" fill="#3aff8a" />
      <circle cx="67" cy="103.5" r="1.8" fill="#ffd23a" />
      <circle cx="72" cy="103.5" r="1.8" fill="#ff4a3b" />
      <rect x="44" y="101" width="10" height="4" rx="1.5" fill={visor} />
      {trim && <rect x="40" y="90" width="40" height="22" rx="4" fill="none" stroke={accent} strokeWidth="1.6" />}
      {/* Neck ring. */}
      <ellipse cx="60" cy="80" rx="26" ry="7" fill={main} stroke="#111" strokeWidth="3.5" />
      {/* Antenna, behind the helmet. */}
      {tier >= 2 && (
        <>
          <line x1="28" y1="40" x2="22" y2="12" stroke="#c3c9d3" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="22" cy="11" r="3.2" fill="#ff4a3b" stroke="#111" strokeWidth="1.5" />
        </>
      )}
      {/* Helmet: shell, band over the top, ear pieces, visor and its shine. */}
      <circle cx="60" cy="46" r="33" fill={main} stroke="#111" strokeWidth="4.5" />
      <circle cx="60" cy="46" r="33" fill={`url(#${id}-shell)`} />
      <path d="M27 44 Q60 4 93 44" fill="none" stroke={accent} strokeWidth="6" />
      <rect x="22" y="38" width="9" height="18" rx="3" fill={main} stroke="#111" strokeWidth="3" />
      <rect x="89" y="38" width="9" height="18" rx="3" fill={main} stroke="#111" strokeWidth="3" />
      <circle cx="94" cy="47" r="2.2" fill="#3aff8a" />
      <ellipse cx="60" cy="51" rx="23" ry="17" fill={`url(#${id}-visor)`} stroke="#111" strokeWidth="3.5" />
      <path d="M44 45 Q50 38 60 37" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      {tier >= 4 && (
        <>
          <rect x="53" y="17" width="14" height="6" rx="2" fill="#2b2e36" />
          <rect x="55" y="18.5" width="10" height="3" rx="1" fill="#fffbe0" />
        </>
      )}
      {tier >= 9 && <ellipse cx="60" cy="51" rx="25" ry="19" fill="none" stroke={accent} strokeWidth="2.2" />}
      {suit.id === 'galaxy' &&
        [
          [30, 104],
          [50, 96],
          [88, 100],
          [96, 110],
          [70, 112],
        ].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.4" fill="#ffffff" />)}
      {trim && <circle cx="60" cy="46" r="36" fill="none" stroke={accent} strokeWidth="1.6" opacity="0.9" />}
    </svg>
  )
}

const perk = (suit) => {
  const parts = [`x${suit.mult} pay`]
  if (suit.speed > 1) parts.push(`+${Math.round((suit.speed - 1) * 100)}% speed`)
  if (suit.jump > 1) parts.push(`+${Math.round((suit.jump - 1) * 100)}% jump`)
  if (suit.jetpack) parts.push('jetpack')
  return parts.join(' · ')
}

/**
 * Space suits: each pays more per delivery, and the better ones are faster, jump higher
 * or fly. Bought at the Suit Shop on Earth (the panel opens at its counter); ones you own
 * can be put on from anywhere. Every suit is bought with Money - nothing costs Gems.
 */
export function SuitsPanel() {
  const profile = useGame((s) => s.profile)
  const atShop = useGame((s) => s.zone === 'suits')

  const buy = (suit) => {
    if (!atShop || profile.money < suit.price) {
      sfx.error()
      return
    }
    actions.buySuit(suit.id)
  }

  return (
    <Panel title="SUITS" icon="star" width={1100}>
      {!atShop && (
        <p className="m-0 text-center" style={{ fontSize: u(26), marginBottom: u(12) }}>
          <StrokeText stroke={u(5)} fill="#ffd27a" className="pp-text-wrap">
            Buy new suits at the Suit Shop on Earth. You can wear the ones you own anywhere.
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
        {SUITS.map((suit) => {
          const owned = profile.ownedSuits.includes(suit.id)
          const worn = profile.suit === suit.id
          let button
          if (worn)
            button = {
              label: 'Wearing',
              gradient: GRADIENTS.greyButton,
              disabled: true,
            }
          else if (owned)
            button = {
              label: 'Wear',
              gradient: GRADIENTS.blueButton,
              onClick: () => actions.equipSuit(suit.id),
            }
          else
            button = {
              label: suit.price === 0 ? 'FREE' : `$${formatNumber(suit.price)}`,
              gradient: atShop && profile.money >= suit.price ? GRADIENTS.greenButton : GRADIENTS.greyButton,
              onClick: () => buy(suit),
            }
          return (
            <div
              key={suit.id}
              className="flex flex-col items-center text-center"
              style={{
                padding: u(12),
                borderRadius: u(10),
                border: `${u(5)} solid ${worn ? '#ffd21f' : '#111'}`,
                background: 'linear-gradient(180deg, #2a3150, #161b2e)',
              }}
            >
              <SuitBust suit={suit} />
              <span style={{ fontSize: u(36), lineHeight: 1.1 }}>
                <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
                  {suit.name}
                </StrokeText>
              </span>
              <span
                style={{
                  fontSize: u(21),
                  minHeight: u(50),
                  margin: `${u(4)} 0`,
                  color: '#cfe8ff',
                  fontFamily: 'system-ui, sans-serif',
                  fontWeight: 600,
                }}
              >
                {perk(suit)}
              </span>
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

export default SuitsPanel
