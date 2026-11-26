import { useEffect, useMemo } from 'react'
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

import { LOBBY_BOARD } from '@shared/world'

import { getQuality } from '../../store/quality'
import { useGame } from '../../store/game'
import { BOARD_INFO, boardRows } from '../../ui/boards'
import { STYLE } from '../materials'
import { GEO, useProps } from './kit'

/** The three boards on the lobby gantry, left to right. */
const SCREENS = ['earned', 'deliveries', 'playtime']
/** Each screen's size in the world (metres), and the gap between screens. */
const SCREEN = 7
const GAP = 0.5
/** Height of the screens' middle above the ground. */
const MIDDLE = 6.6
const FONT = "'Fredoka One', 'Arial Rounded MT Bold', system-ui, sans-serif"

const MEDALS = ['#ffd23a', '#d4dbe6', '#e0975a']

/** Cuts `text` with an ellipsis to fit `maxWidth` pixels in the context's current font. */
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

/**
 * Paints one board onto its canvas: a coloured title, then the top ten as rows - a rank
 * (gold, silver and bronze for the podium), the name and the value on the right, your own
 * row picked out in gold. `size` is the canvas's side in pixels; everything scales with it.
 */
function paintBoard(canvas, id, rows, myName) {
  const info = BOARD_INFO[id]
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  const k = size / 512
  const bg = ctx.createLinearGradient(0, 0, 0, size)
  bg.addColorStop(0, '#16224d')
  bg.addColorStop(1, '#0a1030')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)
  // Title bar.
  ctx.fillStyle = info.color
  ctx.fillRect(0, 0, size, 76 * k)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(0, 0, size, 26 * k)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `${44 * k}px ${FONT}`
  ctx.lineJoin = 'round'
  ctx.lineWidth = 9 * k
  ctx.strokeStyle = '#111'
  ctx.strokeText(info.title.toUpperCase(), size / 2, 40 * k)
  ctx.fillStyle = '#fff'
  ctx.fillText(info.title.toUpperCase(), size / 2, 40 * k)
  // Rows.
  const top = 84 * k
  const rowH = 42 * k
  rows.slice(0, 10).forEach((row, i) => {
    const y = top + i * rowH
    const mine = row.name === myName
    ctx.fillStyle = mine ? 'rgba(255,210,58,0.28)' : i % 2 ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.07)'
    ctx.fillRect(10 * k, y, size - 20 * k, rowH - 3 * k)
    ctx.textAlign = 'center'
    ctx.font = `${31 * k}px ${FONT}`
    ctx.fillStyle = MEDALS[i] || '#8fa3d6'
    ctx.fillText(String(i + 1), 40 * k, y + rowH / 2)
    ctx.textAlign = 'right'
    ctx.fillStyle = info.color
    const value = info.format(row.value)
    ctx.fillText(value, size - 24 * k, y + rowH / 2)
    const valueWidth = ctx.measureText(value).width
    ctx.textAlign = 'left'
    ctx.fillStyle = mine ? '#ffe28a' : '#ffffff'
    ctx.fillText(fit(ctx, row.name || '-', size - 90 * k - 40 * k - valueWidth), 74 * k, y + rowH / 2)
  })
}

/**
 * The lobby leaderboard (shared/world.js LOBBY_BOARD): a gantry of three big screens
 * facing the spawn - Most Money, Most Deliveries, Top Playtime, the top ten of each, live
 * (the server refreshes them every minute) with your own name picked out. Offline it
 * shows just you. The gantry is one props mesh and each screen one textured plane: four
 * draw calls. The screens repaint only when the boards change.
 */
export function LobbyBoard() {
  const leaderboards = useGame((s) => s.leaderboards)
  const profile = useGame((s) => s.profile)
  const size = Math.min(512, getQuality().maxTexture)

  const screens = useMemo(
    () =>
      SCREENS.map(() => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const texture = new CanvasTexture(canvas)
        texture.colorSpace = SRGBColorSpace
        texture.minFilter = LinearMipmapLinearFilter
        texture.magFilter = LinearFilter
        texture.anisotropy = 4
        return { canvas, texture }
      }),
    [size],
  )

  // Repaint when the boards (or your own numbers, offline) change.
  const stats = profile.stats
  useEffect(() => {
    SCREENS.forEach((id, i) => {
      paintBoard(screens[i].canvas, id, boardRows(leaderboards, profile, id), profile.name)
      screens[i].texture.needsUpdate = true
    })
    // Painted again once the page's font has loaded (the first paint may have used a fallback).
    let live = true
    document.fonts?.ready.then(() => {
      if (!live) return
      SCREENS.forEach((id, i) => {
        paintBoard(screens[i].canvas, id, boardRows(leaderboards, profile, id), profile.name)
        screens[i].texture.needsUpdate = true
      })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens, leaderboards, profile.name, stats.deliveries, stats.totalEarned, stats.playtime])
  useEffect(() => () => screens.forEach((s) => s.texture.dispose()), [screens])

  const frame = useProps((b) => {
    const { x, z, w } = LOBBY_BOARD
    const total = SCREENS.length * SCREEN + (SCREENS.length - 1) * GAP
    // Legs either end, a cross beam behind the screens, and a lit banner over them.
    for (const side of [-1, 1]) {
      b.box(x + side * (w / 2 - 0.5), 5.4, z, 0.5, 10.8, 0.7, '#8d939c', STYLE.SMOOTH)
      b.box(x + side * (w / 2 - 0.5), 0.3, z, 1.4, 0.6, 1.4, '#5d6573', STYLE.SMOOTH)
    }
    b.box(x, MIDDLE, z - 0.1, total + 1.2, SCREEN + 0.7, 0.5, '#1d2330', STYLE.SMOOTH)
    b.box(x, MIDDLE - SCREEN / 2 - 0.5, z + 0.2, total + 1.4, 0.18, 0.2, '#3ad6ff', STYLE.GLOW)
    b.box(x, 10.9, z + 0.05, total + 1.6, 1.1, 0.7, '#6a4cff', STYLE.SMOOTH)
    b.box(x, 10.9, z + 0.42, total + 1.2, 0.8, 0.06, '#ffd23a', STYLE.GLOW)
    // Gold stars on the banner's ends, and a lamp over each screen.
    for (const side of [-1, 1]) b.add(GEO.sphereLow, { position: [x + side * (total / 2 + 0.2), 10.9, z + 0.5], scale: 0.4, color: '#ffffff', style: STYLE.GLOW })
    SCREENS.forEach((_, i) => {
      const sx = x + (i - 1) * (SCREEN + GAP)
      b.box(sx, MIDDLE + SCREEN / 2 + 0.45, z + 0.5, 1.4, 0.16, 0.5, '#fff6d0', STYLE.GLOW)
    })
  }, '')

  const { x, z } = LOBBY_BOARD
  return (
    <group>
      {frame && <primitive object={frame} />}
      {screens.map((s, i) => (
        <mesh key={SCREENS[i]} position={[x + (i - 1) * (SCREEN + GAP), MIDDLE, z + 0.2]}>
          <planeGeometry args={[SCREEN, SCREEN]} />
          <meshBasicMaterial map={s.texture} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export default LobbyBoard
