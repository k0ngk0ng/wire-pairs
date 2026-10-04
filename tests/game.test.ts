import { describe, expect, it } from 'vitest';
import { newGame, reduceGame, restoreGame, stars } from '../src/game';
import { findMove, tileCount } from '../src/engine';

describe('single-player lifecycle', () => {
  it('starts on selection and rejects repeated clicks without double scoring', () => {
    let game = newGame(); const pair = findMove(game.level.board)!;
    game = reduceGame(game, { type: 'tile', index: pair[0] }); expect(game.status).toBe('playing');
    game = reduceGame(game, { type: 'tile', index: pair[1] }); expect(game.score).toBe(100); expect(game.cleared).toBe(2);
    game = reduceGame(game, { type: 'tile', index: pair[1] }); expect(game.score).toBe(100);
  });
  it('freezes time and combo during pause, allows resume, and loses at zero', () => {
    let game = { ...newGame(), status: 'playing' as const, comboLeft: 2 };
    const paused = reduceGame(game, { type: 'pause' }); expect(reduceGame(paused, { type: 'tick', seconds: 12 })).toEqual(paused);
    const resumed = reduceGame(paused, { type: 'resume' }); const tick = reduceGame(resumed, { type: 'tick', seconds: 1 });
    expect(tick.remaining).toBe(game.remaining - 1); expect(tick.comboLeft).toBe(1);
    const lost = reduceGame(tick, { type: 'tick', seconds: 999 }); expect(lost.status).toBe('lost');
    expect(reduceGame(lost, { type: 'hint' })).toEqual(lost);
    expect(reduceGame(lost, { type: 'retry' }).remaining).toBe(game.level.seconds);
  });
  it('limits consumables and never consumes a hammer on normal tiles', () => {
    let game = newGame(); for (let i = 0; i < 10; i++) game = reduceGame(game, { type: 'hint' });
    expect(game.tools.hint).toBe(0); expect(game.used).toBe(3);
    game = reduceGame(game, { type: 'hammer' }); game = reduceGame(game, { type: 'tile', index: 0 });
    expect(game.tools.hammer).toBe(2); expect(tileCount(game.level.board)).toBe(80);
  });
  it('clears 20 successive levels, calculates stars, and persists the next stage', () => {
    let game = newGame();
    for (let n = 1; n <= 20; n++) {
      while (tileCount(game.level.board)) { const pair = findMove(game.level.board)!; expect(pair).not.toBeNull(); for (const index of pair) game = reduceGame(game, { type: 'tile', index }); }
      expect(game.status).toBe('won'); expect(stars(game)).toBe(3); expect(game.highest).toBe(n + 1);
      expect(restoreGame(JSON.stringify(game))?.status).toBe('won');
      game = reduceGame(game, { type: 'next' }); expect(game.level.number).toBe(n + 1); expect(game.tools.hint).toBe(3);
    }
    expect(game.totalScore).toBeGreaterThan(10000);
  });
  it('restores running games as paused and safely rejects corrupt saves', () => {
    const game = reduceGame(newGame(), { type: 'start' });
    expect(restoreGame(JSON.stringify(game))?.status).toBe('paused');
    expect(restoreGame('{')).toBeNull(); expect(restoreGame('{}')).toBeNull();
    expect(restoreGame(JSON.stringify({ ...game, remaining: -3 }))).toBeNull();
    const broken = structuredClone(game); broken.level.board.cells[0] = null;
    expect(restoreGame(JSON.stringify(broken))).toBeNull();
    expect(restoreGame(JSON.stringify({ ...game, tools: null }))).toBeNull();
  });
});
