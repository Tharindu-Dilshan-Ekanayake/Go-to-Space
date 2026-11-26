import { useEffect } from 'react'

import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { u } from '../hud/style'

/**
 * Room kept clear along the bottom while a panel is open: the portal draws its banner ad
 * there (Boxity screen ads, integration.js 'panel' screen), and it would otherwise sit on
 * top of the panel's lower rows. About a banner tall on a desktop, less on a short phone.
 * (`dvh`: the height you can really see, address bar and all, not the taller `vh`.)
 */
export const AD_STRIP = 'clamp(72px, 17dvh, 150px)'

/** The red square X that sits on every panel's top-right corner. */
export function CloseButton({ onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="pp-btn pointer-events-auto absolute flex items-center justify-center"
      style={{
        // At least 44 px: a thumb must hit it on a small phone.
        width: `max(44px, ${u(96)})`,
        height: `max(44px, ${u(96)})`,
        background: 'linear-gradient(180deg, #ff6a5c 0%, #ee2233 55%, #c4101f 100%)',
        border: `${u(5)} solid #111`,
        borderRadius: u(6),
        boxShadow: `inset 0 0 0 ${u(4)} #ffffff, 0 ${u(4)} 0 rgba(0,0,0,0.4)`,
        fontSize: `max(36px, ${u(78)})`,
        lineHeight: 1,
        ...style,
      }}
    >
      <StrokeText stroke={u(10)}>X</StrokeText>
    </button>
  )
}

/**
 * The game's modal panel: dark rounded frame, a big outlined title riding the top edge
 * and the red X on the corner, as in the reference's Daily Rewards and Rebirth windows.
 * Escape or a click outside closes it.
 *
 * @param {{ title: string, icon?: string, width?: number, children: React.ReactNode,
 *           footer?: React.ReactNode, onClose?: () => void }} props `width` in reference
 *   pixels; `icon` sits in front of the title
 */
export function Panel({ title, icon, width = 920, children, footer, onClose }) {
  const closePanel = useGame((s) => s.closePanel)
  const close = onClose || closePanel
  // Long titles shrink to stay clear of the close button.
  const titleSize = Math.min(92, (width - 190) / (title.length * 0.62))
  // ...and on a narrow phone, where the panel shrinks to the screen, shrink with it.
  const titleFont = `min(${u(titleSize)}, calc((100vw - ${u(250)} - 16px) / ${(title.length * 0.62 + (icon ? 1.6 : 0)).toFixed(2)}))`

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      className="pp-font pointer-events-auto absolute inset-0 z-40 flex items-center justify-center"
      // Dimmed well down: the lobby's labels and swords behind must not show through or compete.
      // The popup lives in what's left: the top margin (notch, close button) above, and the
      // ad strip below. It never grows past that, so its title and X are always on screen.
      style={{ background: 'rgba(0, 0, 0, 0.6)', boxSizing: 'border-box', paddingTop: 'max(env(safe-area-inset-top), clamp(12px, 4dvh, 40px))', paddingBottom: AD_STRIP }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      {/* Room for the close button at the right, and to scroll on short screens. */}
      <div className="pp-panel-in relative flex flex-col items-center" style={{ '--px': 'var(--panel-px)', width: `min(${u(width)}, calc(100vw - ${u(60)} - 16px))`, maxHeight: '100%' }}>
        <div
          className="relative w-full"
          style={{
            marginTop: u(56),
            // Fills what's left of the popup's height and scrolls inside it.
            minHeight: 0,
            padding: `${u(52)} ${u(22)} ${u(22)}`,
            borderRadius: u(10),
            // As solid as the player's Boxity background_transparency setting (integration.js).
            background: 'linear-gradient(180deg, rgb(30 33 38 / var(--panel-alpha, 0.94)), rgb(18 20 24 / var(--panel-alpha, 0.94)))',
            border: `${u(6)} solid #0b0c0e`,
            boxShadow: `inset 0 0 0 ${u(3)} rgba(255,255,255,0.08), 0 ${u(10)} ${u(30)} rgba(0,0,0,0.35)`,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          {children}
        </div>
        <div className="absolute flex items-center leading-none" style={{ left: u(icon ? 10 : 60), top: u(8 + (92 - titleSize) * 0.6), fontSize: titleFont, gap: u(8) }}>
          {icon && <Icon name={icon} size={`calc(${titleFont} * 1.4)`} style={{ marginTop: `calc(${titleFont} * -0.3)` }} />}
          <StrokeText stroke={`calc(${titleFont} * 0.17)`}>{title}</StrokeText>
        </div>
        <CloseButton onClick={close} style={{ right: u(-24), top: u(20) }} />
        {footer}
      </div>
    </div>
  )
}

export default Panel
