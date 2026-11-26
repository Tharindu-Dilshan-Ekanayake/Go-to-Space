import { formatDuration, formatNumber } from '@shared/format'

/** The four leaderboards: titles, colours, value formatting, and your own value (offline). */
export const BOARD_INFO = {
  deliveries: { title: 'Most Deliveries', color: '#ffb21e', format: (v) => formatNumber(v), own: (p) => p.stats.deliveries },
  earned: { title: 'Money Earned', color: '#3fdc4a', format: (v) => `$${formatNumber(v)}`, own: (p) => p.stats.totalEarned },
  places: { title: 'Places Visited', color: '#c45cff', format: (v) => formatNumber(v), own: (p) => p.visited.length },
  playtime: { title: 'Top Playtime', color: '#4fc3ff', format: (v) => formatDuration(v * 1000), own: (p) => p.stats.playtime },
}

/** Rows for a board: the server's top 10, or just you when offline. */
export function boardRows(leaderboards, profile, id) {
  if (leaderboards?.[id]?.length) return leaderboards[id]
  return [{ name: profile.name, value: BOARD_INFO[id].own(profile) }]
}
