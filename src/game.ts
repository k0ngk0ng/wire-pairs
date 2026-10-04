import { findMove, findPath, generateLevel, removePair, reshuffle, tileCount, type Level, type Point } from './engine';

export type Status = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export type Game = {
  version: 1; runId: string; level: Level; status: Status; remaining: number; score: number; totalScore: number;
  selected: number | null; combo: number; comboLeft: number; maxCombo: number;
  tools: { hint: number; shuffle: number; hammer: number }; used: number; hammer: boolean;
  hint: number[]; hintLeft: number; best: number; highest: number; cleared: number;
  event: { id: number; type: string; text?: string; path?: Point[]; points?: number };
};
export type Action = { type: 'tile'; index: number } | { type: 'tick'; seconds: number }
  | { type: 'start' | 'pause' | 'resume' | 'hint' | 'shuffle' | 'hammer' | 'next' | 'retry' | 'new' };
export function newGame(number = 1, seed = 240601, best = 0, highest = 1, totalScore = 0, runId: string = globalThis.crypto?.randomUUID?.() || `run_${Date.now()}_${Math.random().toString(36).slice(2)}`): Game {
  const level = generateLevel(number, seed);
  return { version: 1, runId, level, status: 'ready', remaining: level.seconds, score: 0, totalScore,
    selected: null, combo: 0, comboLeft: 0, maxCombo: 0, tools: { hint: 3, shuffle: 2, hammer: 2 },
    used: 0, hammer: false, hint: [], hintLeft: 0, best, highest, cleared: 0, event: { id: 0, type: '' } };
}
const emit = (state: Game, type: string, text?: string, path?: Point[], points?: number): Game => ({ ...state, event: { id: state.event.id + 1, type, text, path, points } });
function recover(state: Game): Game {
  if (tileCount(state.level.board) && !findMove(state.level.board)) {
    const result = reshuffle(state.level.board, state.level.seed + state.event.id * 67 + state.score);
    return emit({ ...state, selected: null, level: { ...state.level, board: result.board } }, 'recovery', '没有可配对的图标，已免费调整棋盘');
  }
  return state;
}
export function stars(state: Game) {
  const challengeMet = state.level.challenge.includes('6') ? state.maxCombo >= 6 : state.level.challenge.includes('道具') ? state.used === 0 : state.remaining >= 30;
  return 1 + Number(state.remaining >= state.level.seconds * .2) + Number(challengeMet);
}
export function reduceGame(state: Game, action: Action): Game {
  if (action.type === 'new') return newGame(1, state.level.seed + 7919, state.best, state.highest);
  if (action.type === 'retry') return newGame(state.level.number, state.level.seed, state.best, state.highest, state.totalScore, state.runId);
  if (action.type === 'next') return state.status === 'won' ? newGame(state.level.number + 1, state.level.seed, state.best, state.highest, state.totalScore + state.score, state.runId) : state;
  if (action.type === 'pause') return state.status === 'playing' ? { ...state, status: 'paused' } : state;
  if (action.type === 'resume') return state.status === 'paused' ? { ...state, status: 'playing' } : state;
  if (action.type === 'start') return state.status === 'ready' ? emit({ ...state, status: 'playing' }, 'start') : state;
  if (action.type === 'tick') {
    if (state.status !== 'playing') return state;
    const remaining = Math.max(0, state.remaining - action.seconds);
    const next = { ...state, remaining, comboLeft: Math.max(0, state.comboLeft - action.seconds), hintLeft: Math.max(0, state.hintLeft - action.seconds) };
    if (remaining <= 0) return emit({ ...next, status: 'lost', selected: null }, 'lost');
    if (Math.ceil(remaining) <= 10 && Math.ceil(remaining) !== Math.ceil(state.remaining)) return emit(next, 'countdown');
    return next;
  }
  if (state.status !== 'ready' && state.status !== 'playing') return state;
  if (action.type === 'hammer') return state.tools.hammer > 0 ? emit({ ...state, hammer: !state.hammer, selected: null }, 'tool', state.hammer ? '已收起破障锤' : '点击一个石块、木箱或冰层，即可破除') : state;
  if (action.type === 'hint') {
    if (!state.tools.hint) return state;
    const pair = findMove(state.level.board);
    if (!pair) return recover(state);
    return emit({ ...state, hint: pair, hintLeft: 3, selected: null, hammer: false, tools: { ...state.tools, hint: state.tools.hint - 1 }, used: state.used + 1 }, 'hint', '这两个图标可以连接', findPath(state.level.board, ...pair)!);
  }
  if (action.type === 'shuffle') {
    if (!state.tools.shuffle) return state;
    const result = reshuffle(state.level.board, state.level.seed ^ (state.event.id + state.used + 1) * 1777);
    return emit({ ...state, level: { ...state.level, board: result.board }, hint: [], selected: null, hammer: false, tools: { ...state.tools, shuffle: state.tools.shuffle - 1 }, used: state.used + 1 }, 'shuffle', result.relaxed ? '已打开受阻通道，并重新排列图标' : '换个排列，换个思路');
  }
  if (action.type === 'tile') {
    const cell = state.level.board.cells[action.index];
    if (!cell) return state;
    if (state.hammer) {
      if (cell.kind === 'tile' && !cell.ice) return emit(state, 'error', '破障锤只能用于石块、木箱或冰层');
      const cells = [...state.level.board.cells]; cells[action.index] = cell.kind === 'tile' ? { ...cell, ice: false } : null;
      return recover(emit({ ...state, hammer: false, used: state.used + 1, tools: { ...state.tools, hammer: state.tools.hammer - 1 }, level: { ...state.level, board: { ...state.level.board, cells } } }, 'break', '障碍已清除，继续前进！'));
    }
    if (cell.kind !== 'tile') return emit(state, 'info', cell.kind === 'stone' ? '石块无法配对，可以绕行或使用破障锤' : '在木箱旁完成配对，即可击碎它');
    if (cell.ice) return emit(state, 'info', '先在旁边完成配对，解冻后就能选择了');
    const started: Game = { ...state, status: 'playing', hint: [] };
    if (state.selected === action.index) return { ...started, selected: null };
    const selected = state.selected === null ? null : state.level.board.cells[state.selected];
    if (!selected || selected.kind !== 'tile' || selected.icon !== cell.icon) return emit({ ...started, selected: action.index }, 'select');
    const path = findPath(state.level.board, state.selected!, action.index);
    if (!path) return emit({ ...started, selected: action.index }, 'error', '这条路被挡住了，连接最多只能转两次弯');
    const board = removePair(state.level.board, state.selected!, action.index)!;
    const combo = state.comboLeft > 0 ? state.combo + 1 : 1;
    const points = (100 + Math.min(10, combo - 1) * 20) * (state.level.mechanic === 'reward' ? 2 : 1);
    const score = state.score + points;
    const won = tileCount(board) === 0;
    const next: Game = { ...started, level: { ...state.level, board }, selected: null, combo, comboLeft: 3, maxCombo: Math.max(state.maxCombo, combo), cleared: state.cleared + 2,
      remaining: Math.min(state.level.seconds, state.remaining + (combo % 5 === 0 ? 2 : 0)), score, best: Math.max(state.best, score),
      highest: Math.max(state.highest, state.level.number + Number(won)), status: won ? 'won' : 'playing' };
    return recover(emit(next, won ? 'won' : 'match', combo % 5 === 0 ? '漂亮！连击奖励 +2 秒' : undefined, path, points));
  }
  return state;
}

export const SAVE_KEY = 'wire-pairs.save.v1';
export function restoreGame(raw: string | null): Game | null {
  if (!raw) return null;
  try {
    const game = JSON.parse(raw) as Game;
    const b = game.level?.board;
    if (game.version !== 1 || typeof game.runId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(game.runId) || !b || !Number.isInteger(b.rows) || !Number.isInteger(b.cols) || b.rows < 1 || b.rows > 10 || b.cols < 2 || b.cols > 14 || !Array.isArray(b.cells) || b.cells.length !== b.rows * b.cols) return null;
    if (!Number.isSafeInteger(game.level.number) || game.level.number < 1 || !Number.isSafeInteger(game.level.seed) || !Number.isFinite(game.level.seconds) || game.level.seconds <= 0 || game.level.seconds > 600 || !Number.isFinite(game.remaining) || game.remaining < 0 || game.remaining > game.level.seconds) return null;
    if (!['ready', 'playing', 'paused', 'won', 'lost'].includes(game.status) || !['classic', 'stone', 'crate', 'ice', 'reward', 'mixed', 'speed'].includes(game.level.mechanic) || typeof game.level.description !== 'string' || typeof game.level.name !== 'string' || typeof game.level.challenge !== 'string') return null;
    const counts = new Map<number, number>();
    for (const c of b.cells) {
      if (c === null) continue;
      if (!c || !['tile', 'stone', 'crate'].includes(c.kind)) return null;
      if (c.kind === 'tile') { if (!Number.isInteger(c.icon) || c.icon < 1 || c.icon > 51 || (c.ice !== undefined && typeof c.ice !== 'boolean')) return null; counts.set(c.icon, (counts.get(c.icon) || 0) + 1); }
    }
    if ([...counts.values()].some(n => n % 2)) return null;
    for (const n of [game.score, game.totalScore, game.best, game.highest, game.cleared, game.combo, game.maxCombo, game.used]) if (!Number.isSafeInteger(n) || n < 0) return null;
    if (!Number.isFinite(game.comboLeft) || game.comboLeft < 0 || game.comboLeft > 3) return null;
    for (const n of [game.tools?.hint, game.tools?.shuffle, game.tools?.hammer]) if (!Number.isInteger(n) || n < 0 || n > 10) return null;
    if ((game.status === 'won') !== (tileCount(b) === 0)) return null;
    return recover({ ...game, status: game.status === 'playing' ? 'paused' : game.status, selected: null, hammer: false, hint: [], hintLeft: 0, event: { id: 0, type: '' } });
  } catch { return null; }
}
