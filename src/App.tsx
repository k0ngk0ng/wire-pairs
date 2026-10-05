import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import { ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Clock3, Flame, Hammer, Infinity as InfinityIcon, Leaf, Lightbulb, Maximize2, Minimize2, Mountain, Pause, Play, RotateCcw, Settings2, Shuffle, Snowflake, Sparkles, Star, Trophy, Volume2, VolumeX, X, Zap, Box, UserRound, CloudUpload as CloudCheck, CloudOff, LoaderCircle, LogOut } from 'lucide-react';
import { reduceGame, stars, type Action, type Game } from './game';
import type { User, CloudSave } from './api';
import { useCloudSave } from './useCloudSave';
import { mechanicFor, tileCount } from './engine';
import { audio, defaultSettings, type AudioSettings } from './audio';
import Lightning from './Lightning';
import Version from './Version';
import { assetUrl as asset } from './assets';

const fmt = (n: number) => `${Math.floor(Math.ceil(n) / 60).toString().padStart(2, '0')}:${(Math.ceil(n) % 60).toString().padStart(2, '0')}`;
const titles = { classic: '经典配对', stone: '石块小径', crate: '木箱机关', ice: '冰封挑战', reward: '双倍奖励', mixed: '组合挑战', speed: '限时追光' };
function loadSettings(): AudioSettings {
  try {
    const s = JSON.parse(localStorage.getItem('wire-pairs.settings') || 'null');
    if (s && typeof s.muted === 'boolean' && typeof s.reduced === 'boolean' && [s.effects, s.music].every(n => typeof n === 'number' && n >= 0 && n <= 1)) return s;
  } catch { /* Use defaults. */ }
  return { ...defaultSettings, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
}
function Logo({ small = false }: { small?: boolean }) { return <span className={`logo-mark ${small ? 'small' : ''}`} aria-hidden="true"><i /><i /><Zap size={small ? 19 : 24} fill="currentColor" /></span>; }
function MechanicIcon({ type, size = 20 }: { type: string; size?: number }) {
  if (type === 'stone') return <Mountain size={size} />;
  if (type === 'crate') return <Box size={size} />;
  if (type === 'ice') return <Snowflake size={size} />;
  if (type === 'reward') return <Sparkles size={size} />;
  if (type === 'speed') return <Zap size={size} />;
  if (type === 'mixed') return <Leaf size={size} />;
  return <Leaf size={size} />;
}

type AppProps = { initialGame: Game; cloud: CloudSave; user: User; onSessionExpired: () => void; onLoadCloud: () => void; onAccount: () => void; onLogout: () => Promise<void> };
export default function App({ initialGame, cloud, user, onSessionExpired, onLoadCloud, onAccount, onLogout }: AppProps) {
  const [game, dispatch] = useReducer(reduceGame, initialGame);
  const [settings, setSettings] = useState(loadSettings);
  const [modal, setModal] = useState<'help' | 'settings' | 'new' | 'retry' | null>(null);
  const [toast, setToast] = useState('');
  const [finishedEvent, setFinishedEvent] = useState<Game['event'] | null>(null);
  const finishAnimation = useCallback((event: Game['event']) => setFinishedEvent(event), []);
  const [assetFailed, setAssetFailed] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [focused, setFocused] = useState(false);
  const [portraitPhone, setPortraitPhone] = useState(() => matchMedia('(max-width: 600px) and (orientation: portrait)').matches);
  const nativeFullscreen = useRef(false);
  const focusRequested = useRef(false);
  const leaveFullscreen = useCallback(() => {
    focusRequested.current = false;
    setFocused(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const query = matchMedia('(max-width: 600px) and (orientation: portrait)');
    const update = () => setPortraitPhone(query.matches);
    query.addEventListener('change', update);
    const changed = () => {
      if (document.fullscreenElement) nativeFullscreen.current = true;
      else if (nativeFullscreen.current) { nativeFullscreen.current = false; leaveFullscreen(); }
    };
    document.addEventListener('fullscreenchange', changed);
    return () => { query.removeEventListener('change', update); document.removeEventListener('fullscreenchange', changed); };
  }, [leaveFullscreen]);
  useEffect(() => {
    if (!focused) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [focused]);
  const modalRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef(game); gameRef.current = game;
  const messageId = useRef(-1);
  const victorySoundEvent = useRef<Game['event'] | null>(null);
  const touch = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const touchEnded = useRef(0);
  const sync = useCloudSave(game, user.id, cloud, onSessionExpired);
  const act = useCallback((action: Action) => {
    void audio.unlock();
    if (['next', 'new', 'retry'].includes(action.type) && gameRef.current.status === 'won') {
      void sync.flush().then(ok => { if (ok) dispatch(action); else setToast('通关成绩还未上传，连接恢复后即可继续'); });
    } else dispatch(action);
  }, [sync.flush]);
  const touchStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };
  const touchMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = touch.current;
    if (start?.id === e.pointerId && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) start.moved = true;
  };
  const touchEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = touch.current;
    if (!start || start.id !== e.pointerId) return;
    touch.current = null; touchEnded.current = Date.now();
    if (start.moved || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return;
    // Give each tile half of the gutter, without stealing taps from its neighbor.
    const margin = (parseFloat(getComputedStyle(e.currentTarget).gap) || 0) / 2;
    let nearest: HTMLButtonElement | null = null, distance = Infinity;
    for (const tile of e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-cell]:not(:disabled)')) {
      const r = tile.getBoundingClientRect();
      if (e.clientX < r.left - margin || e.clientX > r.right + margin || e.clientY < r.top - margin || e.clientY > r.bottom + margin) continue;
      const d = Math.hypot(e.clientX - (r.left + r.right) / 2, e.clientY - (r.top + r.bottom) / 2);
      if (d < distance) { nearest = tile; distance = d; }
    }
    if (nearest) act({ type: 'tile', index: Number(nearest.dataset.cell) });
  };
  const board = game.level.board;
  const transposed = focused && portraitPhone;
  const displayCols = transposed ? board.rows : board.cols;
  const displayRows = transposed ? board.cols : board.rows;
  const remainingTiles = tileCount(board);
  const progress = game.cleared / (game.cleared + remainingTiles);
  const resultReady = game.status === 'lost' || (game.status === 'won' && (!game.event.path || finishedEvent === game.event));
  const locked = game.status !== 'playing' && game.status !== 'ready';

  useEffect(() => {
    let previous = performance.now();
    const timer = setInterval(() => { const now = performance.now(); dispatch({ type: 'tick', seconds: (now - previous) / 1000 }); previous = now; }, 100);
    const pause = () => dispatch({ type: 'pause' });
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => { audio.preload(); }, []);
  useLayoutEffect(() => {
    audio.configure(settings, game.status === 'playing');
    try { localStorage.setItem('wire-pairs.settings', JSON.stringify(settings)); } catch { /* Settings remain usable without local storage. */ }
  }, [settings, game.status]);
  useEffect(() => { if (sync.conflict || sync.status === 'error') dispatch({ type: 'pause' }); }, [sync.conflict, sync.status]);
  useEffect(() => () => audio.configure(settings, false), []);
  useLayoutEffect(() => {
    if (messageId.current === game.event.id) return;
    messageId.current = game.event.id;
    void audio.play(game.event.type === 'won' && game.event.path ? 'match' : game.event.type);
    if (game.event.text) setToast(game.event.text);
  }, [game.event]);
  useLayoutEffect(() => {
    if (resultReady && game.status === 'won' && game.event.path && victorySoundEvent.current !== game.event) {
      victorySoundEvent.current = game.event;
      audio.play('won');
    }
  }, [resultReady, game.status, game.event]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);
  const openModal = useCallback((which: typeof modal) => { dispatch({ type: 'pause' }); setModal(which); }, []);
  useEffect(() => { if (assetFailed) dispatch({ type: 'pause' }); }, [assetFailed]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { if (!modal && !gallery && !sync.conflict) leaveFullscreen(); setModal(null); setGallery(false); dispatch({ type: 'pause' }); return; }
      if (modal || gallery || sync.conflict || document.querySelector('.account-overlay') || e.repeat) return;
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('button')) { e.preventDefault(); act({ type: gameRef.current.status === 'paused' ? 'resume' : gameRef.current.status === 'ready' ? 'start' : 'pause' }); }
      if (e.key.toLowerCase() === 'h') act({ type: 'hint' });
      if (e.key.toLowerCase() === 'r') act({ type: 'shuffle' });
      if (e.key.toLowerCase() === 'b') act({ type: 'hammer' });
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [act, modal, gallery, sync.conflict, leaveFullscreen]);
  useEffect(() => {
    if (!modal && !gallery && !sync.conflict) return;
    const oldFocus = document.activeElement as HTMLElement;
    const dialog = sync.conflict ? conflictRef.current : modalRef.current; dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]'));
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener('keydown', trap); return () => { document.removeEventListener('keydown', trap); oldFocus?.focus(); };
  }, [modal, gallery, sync.conflict]);

  const fullscreen = async () => {
    if (focused) { leaveFullscreen(); return; }
    focusRequested.current = true;
    setFocused(true);
    // The focused layout also works on iPhone and browsers without the Fullscreen API.
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        if (!focusRequested.current && document.fullscreenElement) await document.exitFullscreen();
      }
    } catch { /* Keep the viewport-filling layout when native fullscreen is unavailable. */ }
  };

  return <div className={`app ${settings.reduced ? 'reduce-motion' : ''} ${focused ? 'game-focused' : ''}`} data-theme={game.level.mechanic}>
    <header className="site-header">
      <a className="brand" href="#" aria-label="连连看首页" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Logo /><span>连连看<span className="brand-divider" /><small>一连就开心</small></span></a>
      <nav aria-label="游戏设置">
        <button className="profile-button" onClick={() => { dispatch({ type: 'pause' }); onAccount(); }}><UserRound size={16} /><span>{user.displayName}</span></button>
        <button className="nav-button" onClick={() => openModal('help')}><CircleHelp size={18} /><span>玩法指南</span></button>
        <button className="icon-button" title={settings.muted ? '开启声音' : '静音'} aria-label={settings.muted ? '开启声音' : '静音'} onClick={() => { void audio.unlock(); setSettings(s => ({ ...s, muted: !s.muted })); }}>{settings.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
        <button className="icon-button" aria-label="游戏设置" onClick={() => openModal('settings')}><Settings2 size={20} /></button>
      </nav>
    </header>

    <main>
      <section className="page-heading">
        <div><div className="eyebrow"><span /> CLASSIC GAME, NEW ADVENTURE</div><h1>熟悉的快乐，<span>再连一次。</span></h1><p>经典图案，闪电连线。给自己一段简单快乐的时间。</p></div>
        <div className="adventure-stamp"><InfinityIcon size={31} /><div><strong>无限闯关</strong><span>每一关，都有新发现</span></div></div>
      </section>

      <button className="mobile-play-banner" onClick={fullscreen}><Maximize2 size={22} /><span><strong>全屏游玩</strong><small>放大棋盘，专心连一局</small></span><ArrowRight size={20} /></button>
      <div className="game-layout">
        <section className="game-card" aria-label="连连看游戏" data-level={game.level.number} data-status={game.status}>
          <div className="game-topbar"><div className="level-label"><span className="level-number">{String(game.level.number).padStart(2, '0')}</span><div><div className="section-overline">第 {game.level.number} 关 <span> / </span> {titles[game.level.mechanic]}</div><h2>{game.level.name}</h2></div></div>
            <div className="score-box"><span>本关得分</span><strong data-testid="score">{game.score.toLocaleString().padStart(4, '0')}</strong></div>
            <div className="topbar-actions"><button className="icon-button" aria-label={game.status === 'paused' ? '继续游戏' : '暂停游戏'} disabled={['won', 'lost', 'ready'].includes(game.status)} onClick={() => act({ type: game.status === 'paused' ? 'resume' : 'pause' })}>{game.status === 'paused' ? <Play size={20} /> : <Pause size={20} />}</button><button className="icon-button focus-settings" aria-label="游戏设置" onClick={() => openModal('settings')}><Settings2 size={19} /></button><button className="icon-button fullscreen-button" aria-label={focused ? '退出全屏游戏' : '全屏游戏'} aria-pressed={focused} onClick={fullscreen}>{focused ? <Minimize2 size={19} /> : <Maximize2 size={19} />}<span>{focused ? '退出' : '全屏'}</span></button></div>
          </div>
          <div className={`timer-row ${game.remaining <= 30 ? 'urgent' : ''}`}><Clock3 size={15} /><span className="time-label">剩余时间</span><div className="timer-track" role="progressbar" aria-label="剩余时间" aria-valuemin={0} aria-valuemax={game.level.seconds} aria-valuenow={Math.ceil(game.remaining)}><div style={{ width: `${game.remaining / game.level.seconds * 100}%` }} /></div><strong data-testid="timer">{fmt(game.remaining)}</strong></div>

          <div className={`board-stage ${game.hammer ? 'hammer-mode' : ''}`}>
            <div className="board-caption"><span><span className="live-dot" /> {game.status === 'ready' ? '点击图标，即刻开始' : game.status === 'paused' ? '休息一下，快乐不打烊' : titles[game.level.mechanic]}</span><span>{remainingTiles / 2} 对待消除</span></div>
            <div className="board-fit">
            <div className="board-grid" data-cols={board.cols} data-rows={board.rows} data-transposed={transposed} style={{ '--cols': displayCols + 2, '--rows': displayRows + 2, '--tile-cols': displayCols, '--tile-rows': displayRows, '--fit-cols': displayCols + .9, '--fit-rows': displayRows + .9 } as CSSProperties}
              onPointerDown={touchStart} onPointerMove={touchMove} onPointerUp={touchEnd}
              onPointerCancel={() => { touch.current = null; touchEnded.current = Date.now(); }}
              onClickCapture={e => { if (e.detail !== 0 && Date.now() - touchEnded.current < 700) { e.preventDefault(); e.stopPropagation(); } }} role="group" aria-label="配对棋盘">
              {board.cells.map((cell, i) => {
                const x = i % board.cols, y = Math.floor(i / board.cols);
                const pos = { gridColumn: (transposed ? y : x) + 2, gridRow: (transposed ? x : y) + 2 };
                if (!cell) return <span className="empty-cell" key={i} style={pos} />;
                const isTile = cell.kind === 'tile';
                return <button key={i} style={pos} data-cell={i} data-icon={isTile ? cell.icon : ''} data-kind={cell.kind} data-ice={isTile && cell.ice ? 'true' : undefined}
                  className={`tile ${cell.kind} ${isTile && cell.ice ? 'ice' : ''} ${game.selected === i ? 'selected' : ''} ${game.hintLeft > 0 && game.hint.includes(i) ? 'hinted' : ''}`}
                  aria-label={isTile ? `${cell.ice ? '冰封' : ''}图案 ${cell.icon}，第 ${(transposed ? x : y) + 1} 行第 ${(transposed ? y : x) + 1} 列` : `${cell.kind === 'stone' ? '石块' : '木箱'}，第 ${(transposed ? x : y) + 1} 行第 ${(transposed ? y : x) + 1} 列`}
                  aria-pressed={game.selected === i} disabled={locked || assetFailed} onClick={() => act({ type: 'tile', index: i })}>
                  {isTile ? <><img src={asset(`icons/${cell.icon}.png`)} alt="" draggable="false" onError={() => setAssetFailed(true)} />{cell.ice && <Snowflake className="ice-symbol" size={13} />}</> : cell.kind === 'stone' ? <Mountain size={29} strokeWidth={1.6} /> : <span className="wood-grain"><i /><i /></span>}
                </button>;
              })}
              <Lightning game={game} reduced={settings.reduced} transposed={transposed} onComplete={finishAnimation} />
            </div>
            </div>
            <div className="board-bottom"><span><Zap size={14} /> 两次转弯之内，快乐即刻连通</span><div className={`combo-chip ${game.combo > 1 && game.comboLeft > 0 ? 'active' : ''}`}><Flame size={15} /><span>{game.combo > 1 && game.comboLeft > 0 ? `${game.combo} 连击` : '连击蓄力中'}</span></div></div>
            {game.status === 'paused' && !modal && !gallery && <div className="board-overlay"><div className="pause-medallion"><Pause size={30} /></div><h3>让快乐歇一会儿</h3><p>时间已暂停，进度好好保留着。</p><button className="primary-button" onClick={() => act({ type: 'resume' })}><Play size={17} fill="currentColor" /> 继续游戏</button><button className="text-button light" onClick={() => openModal('retry')}>重新挑战本关</button></div>}
            {resultReady && <div className="board-overlay result-overlay"><div className="result-symbol">{game.status === 'won' ? <Trophy size={37} /> : <Clock3 size={37} />}</div><div className="eyebrow light">{game.status === 'won' ? 'A LITTLE WIN, A LOT OF JOY' : 'TAKE A BREATH & TRY AGAIN'}</div><h3>{game.status === 'won' ? '漂亮！又闯过一关' : '差一点，下次一定'}</h3>{game.status === 'won' ? <><div className="result-stars">{[1, 2, 3].map(n => <Star key={n} size={32} fill={n <= stars(game) ? 'currentColor' : 'transparent'} className={n <= stars(game) ? '' : 'unearned'} />)}</div><p>得分 {game.score.toLocaleString()} · 剩余 {fmt(game.remaining)} · 最高 {game.maxCombo} 连击</p><button className="primary-button" onClick={() => act({ type: 'next' })}>下一关 · {titles[mechanicFor(game.level.number + 1)]} <ArrowRight size={18} /></button></> : <><p>本关已完成 {Math.round(progress * 100)}%，换个思路再试试。</p><button className="primary-button" onClick={() => act({ type: 'retry' })}><RotateCcw size={17} /> 免费再试一次</button></>}<button className="text-button light" onClick={() => openModal('new')}>开启新的旅程</button></div>}
            {assetFailed && <div className="board-overlay"><h3>图标暂时没有加载完成</h3><p>请刷新页面重试，当前进度已保存。</p><button className="primary-button" onClick={() => location.reload()}>重新加载</button></div>}
          </div>

          <div className="game-feedback" role="status" aria-live="polite">{toast && <><Sparkles size={14} /><span>{toast}</span></>}</div>
          <div className="tool-bar"><div className="tool-group">
            <button className="tool-button" disabled={locked || game.tools.hint === 0} onClick={() => act({ type: 'hint' })} title="提示（H）"><span className="tool-icon hint-icon"><Lightbulb size={22} /></span><span><strong>提示 <kbd>H</kbd></strong><small>发现一对好搭档</small></span><b>{game.tools.hint}</b></button>
            <button className="tool-button" disabled={locked || game.tools.shuffle === 0} onClick={() => act({ type: 'shuffle' })} title="洗牌（R）"><span className="tool-icon shuffle-icon"><Shuffle size={21} /></span><span><strong>洗牌 <kbd>R</kbd></strong><small>换个思路继续连</small></span><b>{game.tools.shuffle}</b></button>
            <button className={`tool-button ${game.hammer ? 'tool-active' : ''}`} disabled={locked || game.tools.hammer === 0} onClick={() => act({ type: 'hammer' })} title="破障（B）" aria-pressed={game.hammer}><span className="tool-icon hammer-icon"><Hammer size={21} /></span><span><strong>破障 <kbd>B</kbd></strong><small>敲开挡路小机关</small></span><b>{game.tools.hammer}</b></button>
          </div><button className="restart-button" aria-label="重新挑战本关" onClick={() => openModal('retry')}><RotateCcw size={17} /></button><Version className="focus-version" /></div>
          <p className="orientation-note"><Maximize2 size={12} /> 点击全屏，放大棋盘；横竖屏都能玩</p>
        </section>

        <aside className="sidebar">
          <section className="journey-card"><div className="card-section-title"><span><Leaf size={18} /> 闯关旅程</span><span className="soft-tag">第 {Math.floor((game.level.number - 1) / 10) + 1} 章</span></div><h3>{game.level.number <= 10 ? '从一片绿野开始' : ['走进森林深处', '沿着微光前行', '收集一路惊喜'][Math.floor((game.level.number - 1) / 10) % 3]}</h3><p>不赶路，享受每一次连接。</p>
            <div className="journey-path">{Array.from({ length: 5 }, (_, i) => {
              const n = Math.floor((game.level.number - 1) / 5) * 5 + i + 1; const type = mechanicFor(n); const done = n < game.level.number || (n === game.level.number && game.status === 'won');
              return <div className={`journey-stop ${n === game.level.number ? 'current' : ''} ${done ? 'done' : ''}`} key={n}><span className="stop-dot">{done ? <Check size={16} /> : n === game.level.number ? <Play size={13} fill="currentColor" /> : <MechanicIcon type={type} size={15} />}</span><span><strong>第 {String(n).padStart(2, '0')} 关</strong><small>{titles[type]}</small></span>{n === game.level.number && <span className="current-tag">{game.status === 'won' ? '已完成' : '进行中'}</span>}</div>;
            })}</div>
            <div className="journey-footer"><InfinityIcon size={18} /><span>下一站，还有更多惊喜</span><ChevronRight size={15} /></div>
          </section>

          <section className="mission-card"><div className="card-section-title"><span><Star size={17} /> 本关小目标</span><span className="tiny-star">✧</span></div><h3>{game.level.challenge}</h3><p>{game.level.description}</p><div className="mission-progress"><span>消除进度</span><strong>{game.cleared} / {game.cleared + remainingTiles}</strong></div><div className="small-track"><i style={{ width: `${progress * 100}%` }} /></div>{game.status === 'ready' && <button className="start-button" onClick={() => act({ type: 'start' })}>开始这一关 <ArrowRight size={16} /></button>}{game.status !== 'ready' && <div className="mission-note"><Star size={13} /> 完成目标，点亮额外一颗星</div>}</section>

          <section className="record-card"><div><Trophy size={19} /><span>个人最佳</span><strong>{game.best.toLocaleString()}</strong></div><div><Mountain size={19} /><span>最远足迹</span><strong>第 {game.highest} 关</strong></div></section>
        </aside>
      </div>

      <section className="bottom-notes"><div><span className="note-icon"><Lightbulb size={18} /></span><p><strong>连连小贴士</strong><span>连接线可以绕到棋盘外侧。换个角度，往往就有新发现。</span></p></div><button className="text-button" onClick={() => { dispatch({ type: 'pause' }); setGallery(true); }}>看看经典图鉴 <ArrowRight size={15} /></button></section>
      <footer><span><Logo small /> 简单一点，快乐连连。<Version /></span><span className={`cloud-state ${sync.status}`} role="status">{sync.status === 'saving' ? <LoaderCircle size={14} className="spin" /> : sync.status === 'offline' || sync.status === 'error' ? <CloudOff size={14} /> : <CloudCheck size={14} />}{sync.status === 'saved' ? '进度已同步到云端' : sync.status === 'saving' ? '正在保存进度' : sync.status === 'offline' ? '离线暂存中，联网后自动同步' : sync.status === 'conflict' ? '请选择要继续的进度' : sync.error}<i />换台设备，也能接着玩</span></footer>
    </main>

    {(modal || gallery) && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { setModal(null); setGallery(false); } }}><div className={`modal ${gallery ? 'gallery-modal' : ''}`} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="modal-close icon-button" aria-label="关闭" onClick={() => { setModal(null); setGallery(false); }}><X size={21} /></button>
      {modal === 'help' && <><span className="modal-illustration"><Zap size={28} /></span><div className="eyebrow">A MOMENT OF PLAY</div><h2 id="dialog-title">一看就会，一连就开心</h2><p className="modal-intro">找到两个相同图标，最多转两次弯，连起来就能消除。</p><div className="rule-demo"><img src={asset('icons/2.png')} alt="星星图标" /><span /><i /><span /><img src={asset('icons/2.png')} alt="相同的星星图标" /></div><ol className="rules-list"><li><strong>连线有路，配对成功</strong><p>连线不能穿过其他图标或障碍，但可以绕到棋盘外面。</p></li><li><strong>清空棋盘，即可过关</strong><p>倒计时结束前消除全部图标。3 秒内连续配对形成连击，每 5 连击奖励 2 秒。</p></li><li><strong>遇到机关，换个思路</strong><p>石块需要绕行；在木箱或冰层四周相邻位置完成消除，就能击碎木箱或解冻图标。</p></li><li><strong>放心尝试，快乐不设限</strong><p>无解时免费调整棋盘，失败可免费重试。切换窗口会自动暂停。</p></li></ol><button className="primary-button wide" onClick={() => { setModal(null); act({ type: game.status === 'paused' ? 'resume' : 'start' }); }}>明白了，开始连连看 <ArrowRight size={17} /></button><p className="keyboard-note">快捷键：空格 暂停 / 继续 · H 提示 · R 洗牌 · B 破障</p></>}
      {modal === 'settings' && <><span className="modal-illustration"><Settings2 size={28} /></span><h2 id="dialog-title">把快乐调到刚刚好</h2><p className="modal-intro">声音偏好保存在本机，游戏进度自动保存到云端。</p><label className="setting-toggle"><span><Volume2 size={20} /><strong>游戏声音</strong></span><input type="checkbox" checked={!settings.muted} onChange={e => { void audio.unlock(); setSettings(s => ({ ...s, muted: !e.target.checked })); }} /></label><label className="setting-range"><span><AudioLines size={18} /> 消除音效 <b>{Math.round(settings.effects * 100)}%</b></span><input aria-label="消除音效音量" type="range" min="0" max="1" step="0.05" value={settings.effects} onChange={e => setSettings(s => ({ ...s, effects: +e.target.value }))} /></label><label className="setting-range"><span><Leaf size={18} /> 背景音乐 <b>{Math.round(settings.music * 100)}%</b></span><input aria-label="背景音乐音量" type="range" min="0" max="1" step="0.05" value={settings.music} onChange={e => setSettings(s => ({ ...s, music: +e.target.value }))} /></label><label className="setting-toggle"><span><Sparkles size={20} /><span><strong>轻柔动效</strong><small>减少闪电亮光、粒子与动画</small></span></span><input type="checkbox" checked={settings.reduced} onChange={e => setSettings(s => ({ ...s, reduced: e.target.checked }))} /></label><div className="settings-actions"><button className="secondary-button" onClick={() => setModal('new')}><RotateCcw size={16} /> 开启新旅程</button><button className="primary-button" onClick={() => { setModal(null); if (game.status === 'paused') act({ type: 'resume' }); }}>保存并返回 <Check size={16} /></button></div><button className="logout-button" onClick={async () => { if (await sync.flush()) { try { await onLogout(); sync.discardLocal(); } catch { setToast('暂时无法退出，请稍后再试'); } } else setToast('请等待进度同步后再退出登录'); }}><LogOut size={15} /> 保存进度并退出登录</button></>}
      {(modal === 'new' || modal === 'retry') && <><span className="modal-illustration"><RotateCcw size={27} /></span><h2 id="dialog-title">{modal === 'new' ? '开始一段新的旅程？' : '重新挑战这一关？'}</h2><p className="modal-intro">{modal === 'new' ? '从第 1 关重新出发，本次闯关进度将重置。个人最佳和最远足迹会保留。' : '本关的时间和道具会恢复，棋盘保持最初的布局。'}</p><div className="settings-actions"><button className="secondary-button" onClick={() => setModal(null)}>再想一下</button><button className="primary-button" onClick={() => { act({ type: modal === 'new' ? 'new' : 'retry' }); setModal(null); }}>确定，重新开始</button></div></>}
      {gallery && <><span className="modal-illustration"><Sparkles size={28} /></span><div className="eyebrow">HELLO, OLD FRIENDS</div><h2 id="dialog-title">熟悉的老朋友，都在这里</h2><p className="modal-intro">51 个经典图案，你最先认出了哪一个？</p><div className="icon-gallery">{Array.from({ length: 51 }, (_, i) => <div key={i}><img src={asset(`icons/${i + 1}.png`)} alt={`经典图案 ${i + 1}`} /><span>{String(i + 1).padStart(2, '0')}</span></div>)}</div><p className="keyboard-note">企鹅、星星、彩球与手势，还是记忆里的样子。</p></>}
    </div></div>}
    {sync.conflict && <div className="modal-backdrop cloud-conflict"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title" ref={conflictRef}><span className="modal-illustration"><CloudOff size={28} /></span><h2 id="conflict-title">另一台设备更新了进度</h2><p className="modal-intro">游戏已暂停。选择想继续的记录，未选择的当前棋盘将被替换；已经上传的通关成绩仍会保留。</p><div className="conflict-choices"><div><span>云端进度</span><strong>第 {sync.conflict.game?.level.number || 1} 关</strong><small>{sync.conflict.game?.score || 0} 分</small></div><div><span>本机进度</span><strong>第 {game.level.number} 关</strong><small>{game.score} 分</small></div></div><button className="primary-button wide" onClick={() => { sync.discardLocal(); onLoadCloud(); }}>继续云端进度</button><button className="secondary-button wide" style={{ marginTop: 10 }} onClick={() => { void sync.overwrite(); }}>保留本机进度并同步</button></div></div>}
  </div>;
}
