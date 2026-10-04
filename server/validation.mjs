// The server stores client-computed game state; it validates shape and bounds, not gameplay.
// There is no competitive leaderboard or claim of cheat-proof scoring.
export function validGame(g) {
  if (!g || g.version !== 1 || typeof g.runId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(g.runId)) return false;
  const l = g.level, b = l?.board;
  if (!b || !Number.isInteger(b.rows) || b.rows < 1 || b.rows > 10 || !Number.isInteger(b.cols) || b.cols < 2 || b.cols > 14 || !Array.isArray(b.cells) || b.cells.length !== b.cols * b.rows) return false;
  if (!Number.isSafeInteger(l.number) || l.number < 1 || !Number.isSafeInteger(l.seed) || !Number.isFinite(l.seconds) || l.seconds < 1 || l.seconds > 600) return false;
  for (const key of ['name', 'description', 'challenge']) if (typeof l[key] !== 'string' || l[key].length > 200) return false;
  if (!['classic', 'stone', 'crate', 'ice', 'reward', 'mixed', 'speed'].includes(l.mechanic)) return false;
  if (!['ready', 'playing', 'paused', 'won', 'lost'].includes(g.status)) return false;
  const counts = new Map(); let tiles = 0;
  for (const c of b.cells) {
    if (c === null) continue;
    if (!c || !['tile', 'stone', 'crate'].includes(c.kind)) return false;
    if (c.kind === 'tile') {
      if (!Number.isInteger(c.icon) || c.icon < 1 || c.icon > 51 || (c.ice !== undefined && typeof c.ice !== 'boolean')) return false;
      counts.set(c.icon, (counts.get(c.icon) || 0) + 1); tiles++;
    }
  }
  if ([...counts.values()].some(n => n % 2) || (g.status === 'won') !== (tiles === 0)) return false;
  for (const key of ['score', 'totalScore', 'best', 'highest', 'cleared', 'combo', 'maxCombo', 'used']) if (!Number.isSafeInteger(g[key]) || g[key] < 0) return false;
  if (!Number.isFinite(g.remaining) || g.remaining < 0 || g.remaining > l.seconds || !Number.isFinite(g.comboLeft) || g.comboLeft < 0 || g.comboLeft > 3) return false;
  for (const key of ['hint', 'shuffle', 'hammer']) if (!Number.isInteger(g.tools?.[key]) || g.tools[key] < 0 || g.tools[key] > 10) return false;
  if (!Array.isArray(g.hint) || g.hint.length > 2 || g.hint.some(i => !Number.isInteger(i) || i < 0 || i >= b.cells.length)) return false;
  if (!Number.isFinite(g.hintLeft) || g.hintLeft < 0 || g.hintLeft > 3 || typeof g.hammer !== 'boolean') return false;
  if (g.selected !== null && (!Number.isInteger(g.selected) || g.selected < 0 || g.selected >= b.cells.length)) return false;
  if (!g.event || !Number.isSafeInteger(g.event.id) || g.event.id < 0 || typeof g.event.type !== 'string' || g.event.type.length > 30) return false;
  return true;
}
