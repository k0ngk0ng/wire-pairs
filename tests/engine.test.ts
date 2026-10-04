import { describe, expect, it } from 'vitest';
import { findPath, generateLevel, findMove, removePair, reshuffle, random, tileCount, verifySolution, type Board } from '../src/engine';

const tile = (icon = 1) => ({ kind: 'tile' as const, icon });
function make(rows: string[]): Board { return { rows: rows.length, cols: rows[0].length, cells: rows.join('').split('').map(c => c === '.' ? null : c === '#' ? { kind: 'stone' } : tile(+c)) }; }

// An independent grid BFS is the oracle; unlike the production route enumerator,
// it advances one cell at a time and records direction plus number of turns.
function oracle(b: Board, a: number, target: number) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const queue = [{ x: a % b.cols, y: Math.floor(a / b.cols), d: -1, t: 0 }];
  const seen = new Map<string, number>();
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    for (let d = 0; d < 4; d++) {
      const x = node.x + dirs[d][0], y = node.y + dirs[d][1], t = node.t + Number(node.d !== -1 && node.d !== d);
      if (t > 2 || x < -1 || y < -1 || x > b.cols || y > b.rows) continue;
      if (x === target % b.cols && y === Math.floor(target / b.cols)) return true;
      if (x >= 0 && x < b.cols && y >= 0 && y < b.rows && b.cells[y * b.cols + x]) continue;
      const key = `${x},${y},${d}`;
      if ((seen.get(key) ?? 3) <= t) continue;
      seen.set(key, t); queue.push({ x, y, d, t });
    }
  }
  return false;
}
describe('two-turn connections', () => {
  it('handles straight, corner, two-corner, and exterior routes', () => {
    expect(findPath(make(['1.1']), 0, 2)).toHaveLength(2);
    expect(findPath(make(['1.', '.1']), 0, 3)).toHaveLength(3);
    expect(findPath(make(['1#1', '...']), 0, 2)).toHaveLength(4);
    const b = make(['1#1', '###']); expect(findPath(b, 0, 2)?.some(p => p.y === -1)).toBe(true);
  });
  it('rejects three-turn corridors, mismatched icons, ice and same cell', () => {
    const b = make(['######', '#1.###', '##..##', '###.1#', '######']);
    expect(findPath(b, 7, 22)).toBeNull();
    expect(findPath(make(['12']), 0, 1)).toBeNull();
    expect(findPath(make(['11']), 0, 0)).toBeNull();
    expect(findPath({ rows: 1, cols: 2, cells: [{ ...tile(), ice: true }, tile()] }, 0, 1)).toBeNull();
  });
  it('agrees with an independent BFS over 2000 obstructed random boards', () => {
    const rng = random(81273);
    for (let i = 0; i < 2000; i++) {
      const b: Board = { rows: 5, cols: 6, cells: Array.from({ length: 30 }, () => rng() < .5 ? null : { kind: 'stone' }) };
      const a = Math.floor(rng() * 30), target = (a + 1 + Math.floor(rng() * 29)) % 30;
      b.cells[a] = tile(); b.cells[target] = tile();
      expect(!!findPath(b, a, target), `case ${i}, endpoints ${a}/${target}`).toBe(oracle(b, a, target));
    }
  });
});
describe('obstacles and generation', () => {
  it('breaks adjacent crates and unlocks ice, without diagonal effects', () => {
    const b: Board = { rows: 3, cols: 3, cells: [tile(), tile(), { kind: 'crate' }, { ...tile(2), ice: true }, null, { kind: 'crate' }, tile(2), null, null] };
    const result = removePair(b, 0, 1)!;
    expect(result.cells[2]).toBeNull(); expect(result.cells[3]).toEqual({ ...tile(2), ice: false });
    expect(result.cells[5]).toEqual({ kind: 'crate' }); expect(b.cells[0]).toEqual(tile());
  });
  it('generates reproducible complete solutions across difficulty tiers and high levels', () => {
    const levels = [...Array.from({ length: 160 }, (_, i) => i + 1), 500, 999, 1000, 1001, 12345, 999999];
    for (const seed of [240601, 7373, 987654]) for (const n of levels) {
      const level = generateLevel(n, seed);
      expect(verifySolution(level.board, level.solution), `${n}/${seed}`).toBe(true);
      expect(tileCount(level.board) % 2).toBe(0);
      expect(level.seconds).toBeGreaterThanOrEqual(120);
      expect(level.board.cols).toBeLessThanOrEqual(14);
      if (level.mechanic === 'ice') expect(level.board.cells.some(c => c?.kind === 'tile' && c.ice)).toBe(true);
      if (level.mechanic === 'crate') expect(level.board.cells.some(c => c?.kind === 'crate')).toBe(true);
      if (level.mechanic === 'stone') expect(level.board.cells.some(c => c?.kind === 'stone')).toBe(true);
    }
    expect(generateLevel(78, 35)).toEqual(generateLevel(78, 35));
  }, 30000);
  it('preserves pairs and restores blocked/fully frozen states', () => {
    const b: Board = { rows: 2, cols: 4, cells: [{ ...tile(1), ice: true }, { kind: 'stone' }, { ...tile(2), ice: true }, { kind: 'crate' }, { ...tile(1), ice: true }, { kind: 'stone' }, { ...tile(2), ice: true }, null] };
    const result = reshuffle(b, 42);
    expect(findMove(result.board)).not.toBeNull(); expect(tileCount(result.board)).toBe(4);
    expect(result.board.cells.filter(c => c?.kind === 'tile').map(c => c.kind === 'tile' && c.icon).sort()).toEqual([1, 1, 2, 2]);
    expect(result.relaxed).toBe(true);
  });
  it('always finishes arbitrary greedy play with bounded free recovery', () => {
    for (let n = 1; n <= 40; n++) {
      let b = generateLevel(n).board, moves = 0;
      while (tileCount(b)) {
        let pair = findMove(b);
        if (!pair) { b = reshuffle(b, n * 100 + moves).board; pair = findMove(b); }
        expect(pair).not.toBeNull(); b = removePair(b, ...pair!)!; moves++;
        expect(moves).toBeLessThanOrEqual(70);
      }
    }
  });
});
