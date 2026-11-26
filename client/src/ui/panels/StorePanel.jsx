import { useState } from 'react'

import { AD_REWARDS, MONEY_PRODUCTS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { bestReward } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { isRewardedAvailable, watchRewardedAd } from '../../bloxity/services'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

const BLURB_STYLE = { color: '#3a2a10', fontFamily: 'system-ui, sans-serif', fontWeight: 700 }

/** A shop card: icon, name, what it does, and its button. */
function Card({ icon, name, blurb, faded, children }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{ padding: u(10), borderRadius: u(8), border: `${u(5)} solid #111`, background: faded ? GRADIENTS.greyButton : GRADIENTS.rewardCard }}
    >
      {icon}
      <span style={{ fontSize: u(name.length > 12 ? 24 : 30), lineHeight: 1.1 }}>
        <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
          {name}
        </StrokeText>
      </span>
      <span className="whitespace-normal" style={{ fontSize: u(18), minHeight: u(44), margin: `${u(4)} 0` }}>
        <span style={BLURB_STYLE}>{blurb}</span>
      </span>
      {children}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: u(40), marginBottom: u(8) }}>
      <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
        {children}
      </StrokeText>
    </div>
  )
}

const GRID = { gridTemplateColumns: `repeat(auto-fill, minmax(${u(200)}, 1fr))`, gap: u(12) }

/**
 * The Store's extras, all bought with Money (balance MONEY_PRODUCTS) - nothing costs
 * Gems - and a way to the suits.
 */
function MoneySection() {
  const profile = useGame((s) => s.profile)
  const openPanel = useGame((s) => s.openPanel)
  const buy = (id, product) => {
    if (profile.money < product.price) {
      sfx.error()
      return
    }
    actions.buyProduct(id)
  }
  return (
    <div>
      <SectionTitle>Shop</SectionTitle>
      <div className="grid" style={GRID}>
        {Object.entries(MONEY_PRODUCTS).map(([id, product]) => {
          const owned = Boolean(product.grant?.pass && profile.passes[product.grant.pass])
          const afford = profile.money >= product.price
          return (
            <Card key={id} icon={<Icon name={product.icon} size={u(96)} />} name={product.name} blurb={product.blurb} faded={owned}>
              <ChunkyButton gradient={owned || !afford ? GRADIENTS.greyButton : GRADIENTS.greenButton} disabled={owned} onClick={() => buy(id, product)} className="w-full" style={{ height: u(58) }}>
                <span style={{ fontSize: u(30) }}>
                  <StrokeText stroke={u(6)}>{owned ? 'Owned' : `$${formatNumber(product.price)}`}</StrokeText>
                </span>
              </ChunkyButton>
            </Card>
          )
        })}
        <Card icon={<Icon name="star" size={u(96)} />} name="Space Suits" blurb="Better suits pay more and reach further planets">
          <ChunkyButton gradient={GRADIENTS.purpleButton} onClick={() => openPanel('suits')} className="w-full" style={{ height: u(58) }}>
            <span style={{ fontSize: u(30) }}>
              <StrokeText stroke={u(6)}>See suits</StrokeText>
            </span>
          </ChunkyButton>
        </Card>
      </div>
    </div>
  )
}

/** Free Money for watching an ad (Boxity rewarded ads), when Boxity has one to show. */
function FreeSection() {
  const [state, setState] = useState({})
  const best = useGame((s) => bestReward(s.profile))
  if (!isRewardedAvailable()) return null
  const watch = async (placement) => {
    setState((s) => ({ ...s, [placement]: 'watching' }))
    const result = await watchRewardedAd(placement)
    setState((s) => ({ ...s, [placement]: result.ok ? 'done' : 'retry' }))
  }
  return (
    <div>
      <SectionTitle>Free Rewards</SectionTitle>
      <div className="grid" style={GRID}>
        {Object.entries(AD_REWARDS).map(([placement, reward]) => {
          const status = state[placement]
          const money = best * (reward.grant.deliveries || 0)
          return (
            <Card key={placement} icon={<Icon name={reward.icon} size={u(96)} />} name={reward.label} blurb={`Watch a short ad for $${formatNumber(money)}`}>
              <ChunkyButton gradient={GRADIENTS.greenButton} disabled={status === 'watching'} onClick={() => watch(placement)} className="w-full" style={{ height: u(58) }}>
                <span style={{ fontSize: u(28) }}>
                  <StrokeText stroke={u(6)}>{status === 'watching' ? '...' : status === 'retry' ? 'Try again later' : status === 'done' ? 'Got it!' : 'Watch Ad'}</StrokeText>
                </span>
              </ChunkyButton>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/** Gems extras and free rewards. (Money is spent on suits and destinations, in their own panels.) */
export function StorePanel() {
  return (
    <Panel title="STORE" icon="store" width={1080}>
      <div className="flex flex-col" style={{ gap: u(18) }}>
        <FreeSection />
        <MoneySection />
      </div>
    </Panel>
  )
}

export default StorePanel
