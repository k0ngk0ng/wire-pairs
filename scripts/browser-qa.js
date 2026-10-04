// Run after logging in to a disposable test account:
// sh scripts/browser.sh eval --stdin < scripts/browser-qa.js
// Each call plays four levels at most, to stay below browser command timeouts.
(async () => {
  const { findMove } = await import('/src/engine.ts');
  const report = { stages: [], checks: [] };
  const wait = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const assert = (condition, text) => { if (!condition) throw new Error(text); };
  const status = () => document.querySelector('.game-card').dataset.status;
  const stageNumber = () => Number(document.querySelector('.game-card').dataset.level);
  const board = () => {
    const grid = document.querySelector('.board-grid'), style = getComputedStyle(grid);
    const cols = +style.getPropertyValue('--cols') - 2, rows = +style.getPropertyValue('--rows') - 2;
    const cells = Array(rows * cols).fill(null);
    for (const el of grid.querySelectorAll('[data-cell]')) cells[+el.dataset.cell] = el.dataset.kind === 'tile' ? { kind: 'tile', icon: +el.dataset.icon, ice: el.dataset.ice === 'true' } : { kind: el.dataset.kind };
    return { cols, rows, cells };
  };
  const click = async selector => { const el = document.querySelector(selector); assert(el && !el.disabled, `Missing/disabled ${selector}`); el.click(); await wait(); };
  const button = async text => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(text)); assert(el && !el.disabled, `Missing button ${text}`); el.click(); await wait(); };
  const resume = async () => { if (status() === 'paused') await click('.board-overlay .primary-button'); };
  if (status() === 'won') { await button('下一关'); await wait(); }
  await resume();
  const first = stageNumber();
  if (first === 1) {
    if (status() === 'ready') await button('开始这一关');
    await click('button[aria-label="暂停游戏"]'); const time = document.querySelector('[data-testid="timer"]').textContent;
    await new Promise(r => setTimeout(r, 220)); assert(time === document.querySelector('[data-testid="timer"]').textContent, 'Pause leaked time');
    report.checks.push('pause freezes clock'); await resume();
    await click('button[title="提示（H）"]'); assert(document.querySelectorAll('.hinted').length === 2, 'Missing hint'); report.checks.push('hint highlights a valid pair');
    const before = board(); await click('button[title="洗牌（R）"]'); const after = board();
    assert(after.cells.filter(c => c?.kind === 'tile').length === before.cells.filter(c => c?.kind === 'tile').length, 'Shuffle changed tile count');
    assert(findMove(after), 'Shuffle produced deadlock'); report.checks.push('shuffle preserves tiles and has move');
  }
  for (let stage = first; stage <= Math.min(first + 3, 20); stage++) {
    const start = board(), startCount = start.cells.filter(c => c?.kind === 'tile').length;
    const obstacles = start.cells.filter(c => c && (c.kind !== 'tile' || c.ice)).length;
    if ([4, 8].includes(stage)) {
      const target = start.cells.findIndex(c => c && (c.kind === 'stone' || c.kind === 'crate' || c.ice));
      assert(target >= 0, 'Expected obstacle'); await click('button[title="破障（B）"]'); await click(`[data-cell="${target}"]`);
      const cell = board().cells[target]; assert(!cell || !cell.ice, 'Hammer did not clear obstacle');
      assert(document.querySelector('button[title="破障（B）"] b').textContent === '1', 'Hammer count');
      report.checks.push(`hammer works on ${stage === 4 ? 'stone' : 'ice'}`);
    }
    let pairs = 0;
    while (status() !== 'won') {
      await resume(); const pair = findMove(board()); assert(pair, `No valid move on stage ${stage}`);
      await click(`[data-cell="${pair[0]}"]`); await click(`[data-cell="${pair[1]}"]`); pairs++;
      assert(pairs <= 70, 'Non-terminating stage');
    }
    assert(document.querySelector('.result-overlay')?.textContent.includes('又闯过一关'), 'Missing result UI');
    assert(!document.querySelector('.tile[data-kind="tile"]'), 'Tiles remain after victory');
    const deadline = Date.now() + 3000; let remote;
    do { await wait(); remote = await (await fetch('/api/game')).json(); } while ((remote.game?.status !== 'won' || remote.game?.level.number !== stage) && Date.now() < deadline);
    assert(remote.game?.status === 'won' && remote.game.level.number === stage, 'Victory not saved to server');
    report.stages.push({ stage, mechanic: remote.game.level.mechanic, startCount, obstacles, pairs, score: remote.game.score, revision: remote.revision });
    if (stage < Math.min(first + 3, 20)) { await button('下一关'); await wait(); assert(stageNumber() === stage + 1, 'Next stage did not load'); }
  }
  const records = await (await fetch('/api/records')).json();
  assert(report.stages.every(s => records.records.some(r => r.level === s.stage && r.score === s.score)), 'Missing server history');
  report.checks.push('every victory saved to SQLite', 'every stage has a history record');
  report.imagesLoaded = [...document.images].every(img => img.complete && img.naturalWidth > 0);
  report.horizontalOverflow = document.documentElement.scrollWidth > innerWidth;
  return report;
})()
