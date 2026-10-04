import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, CloudUpload as CloudCheck, Eye, EyeOff, KeyRound, Leaf, LoaderCircle, LockKeyhole, Plus, ShieldCheck, Sparkles, Star, Trophy, UserRound, Users, X, Zap } from 'lucide-react';
import { api, loadPending, pendingKey, type CloudSave, type RecordRow, type User } from './api';
import { newGame, restoreGame, type Game } from './game';
import App from './App';
import { assetUrl } from './assets';

const message = (error: unknown) => error instanceof TypeError ? '暂时无法连接服务器，请稍后重试' : error instanceof Error ? error.message : '暂时无法连接服务器，请稍后重试';
function PasswordInput({ label, name, autoComplete = 'current-password', minLength = 1 }: { label: string; name: string; autoComplete?: string; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return <label className="form-field"><span>{label}</span><div className="input-with-icon"><LockKeyhole size={17} /><input name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength} maxLength={128} placeholder={minLength >= 8 ? '至少 8 位字符' : '请输入密码'} /><button type="button" aria-label={visible ? `隐藏${label}` : `显示${label}`} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>;
}
function ChangePassword({ user, onSuccess }: { user: User; onSuccess: (u: User) => void }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirm')) { setError('两次输入的新密码不一致'); return; }
    setBusy(true);
    try { const result = await api<{ user: User }>('/auth/password', 'POST', { currentPassword: form.get('current'), password: form.get('password') }); onSuccess(result.user); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="account-form"><p className="modal-intro">{user.mustChangePassword ? '这是你的首次登录，请将管理员分配的初始密码换成自己的密码。' : '修改成功后，其他设备需要使用新密码重新登录。'}</p><PasswordInput label="原密码" name="current" /><PasswordInput label="新密码" name="password" autoComplete="new-password" minLength={8} /><PasswordInput label="确认新密码" name="confirm" autoComplete="new-password" minLength={8} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button wide" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{busy ? '正在保存' : '保存新密码'}</button></form>;
}

function Login({ onSuccess }: { onSuccess: (u: User) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try { const { user } = await api<{ user: User }>('/auth/login', 'POST', { username: String(data.get('username')).trim(), password: data.get('password') }); onSuccess(user); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  return <div className="login-page"><header className="login-header"><img src={assetUrl('favicon.svg')} alt="" /><strong>连连看</strong><span>一连就开心</span><small><ShieldCheck size={14} /> 内部休闲时光</small></header><main className="login-layout"><section className="login-story"><div className="eyebrow"><span /> HELLO AGAIN, OLD FRIEND</div><h1>快乐，<br />总能<span>连在一起。</span></h1><p>记忆里的经典图案，旅途中的新鲜机关。<br />登录账号，把每一次小小的胜利好好收藏。</p><div className="login-mosaic" aria-hidden="true">{[2, 7, 10, 3, 18, 1, 9, 12, 5, 17, 4, 2, 26, 6, 14, 27, 10, 18, 1, 24, 3, 12, 7, 9].map((n, i) => <div className={`mosaic-tile mosaic-${i}`} key={i}><img src={assetUrl(`icons/${n}.png`)} alt="" /></div>)}<span className="mosaic-spark"><Zap size={27} fill="currentColor" /></span></div><div className="login-features"><span><Sparkles size={16} /> 经典图案</span><span><Leaf size={16} /> 无限闯关</span><span><CloudCheck size={16} /> 云端续玩</span></div></section><section className="login-card"><span className="modal-illustration"><UserRound size={27} /></span><div className="eyebrow">YOUR LITTLE HAPPY PLACE</div><h2>欢迎回来</h2><p>登录后，继续属于你的闯关旅程。</p><form onSubmit={submit}><label className="form-field"><span>账号</span><div className="input-with-icon"><UserRound size={17} /><input name="username" autoComplete="username" placeholder="请输入管理员分配的账号" required minLength={3} maxLength={32} autoFocus /></div></label><PasswordInput name="password" label="密码" />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button wide login-submit" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <>登录，开始连连看 <ArrowRight size={18} /></>}</button></form><div className="login-admin-note"><KeyRound size={16} /><p>账号由管理员创建<br /><span>需要开通账号或重置密码？请联系管理员。</span></p></div></section></main><footer className="login-footer">不赶路，享受每一次连接。<span>游戏记录随账号保存，换台设备也能继续。</span></footer></div>;
}

function AccountPanel({ user, onClose, onUser }: { user: User; onClose: () => void; onUser: (u: User) => void }) {
  const [tab, setTab] = useState<'records' | 'password' | 'users'>('records');
  const [records, setRecords] = useState<RecordRow[]>([]), [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      if (tab === 'records') setRecords((await api<{ records: RecordRow[] }>('/records')).records);
      if (tab === 'users') setUsers((await api<{ users: User[] }>('/admin/users')).users);
    } catch (e) { setError(message(e)); } finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const old = document.activeElement as HTMLElement; ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const els = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || [])];
        if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === els.at(-1)) { e.preventDefault(); els[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', handler); return () => { document.removeEventListener('keydown', handler); old?.focus(); };
  }, [onClose]);
  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form); setBusy(true); setError(''); setNotice('');
    try {
      await api('/admin/users', 'POST', { username: String(data.get('username')).trim(), displayName: String(data.get('displayName')).trim(), password: data.get('password') });
      setNotice('账号已创建，请将账号和初始密码告知对应用户。首次登录需要修改密码。'); form.reset(); await load();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); setNotice('');
    try { await api('/admin/reset-password', 'POST', { userId: resetUser!.id, password: data.get('password') }); setNotice(`已重置 ${resetUser!.displayName} 的密码，该用户的旧会话已退出。`); setResetUser(null); await load(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop account-overlay"><div className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" ref={ref}><button className="modal-close icon-button" aria-label="关闭账号面板" onClick={onClose}><X size={21} /></button><div className="account-heading"><span className="account-avatar">{user.displayName.slice(0, 1)}</span><div><h2 id="account-title">{user.displayName}</h2><p>@{user.username} <span>{user.role === 'admin' ? '管理员' : '快乐玩家'}</span></p></div></div><div className="account-tabs" role="tablist" aria-label="账号选项"><button role="tab" aria-selected={tab === 'records'} onClick={() => { setTab('records'); setNotice(''); }}><Trophy size={15} /> 我的记录</button><button role="tab" aria-selected={tab === 'password'} onClick={() => { setTab('password'); setNotice(''); }}><KeyRound size={15} /> 修改密码</button>{user.role === 'admin' && <button role="tab" aria-selected={tab === 'users'} onClick={() => { setTab('users'); setNotice(''); }}><Users size={15} /> 用户管理</button>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {tab === 'records' && <div className="record-list">{loading ? <p className="empty-records"><LoaderCircle size={20} className="spin" /> 正在读取云端记录</p> : records.length === 0 ? <div className="empty-records"><Trophy size={32} /><strong>旅程才刚刚开始</strong><span>完成第一关，你的成绩就会收藏在这里。</span></div> : <><p className="records-caption">最近 50 次通关，每一个小小的胜利都值得记住。</p>{records.map((r, i) => <div className="history-row" key={i}><span className="history-level">{String(r.level).padStart(2, '0')}</span><div><strong>第 {r.level} 关</strong><small>{new Date(r.completedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {r.maxCombo} 连击</small></div><span className="history-stars">{[1, 2, 3].map(n => <Star size={12} key={n} fill={n <= r.stars ? 'currentColor' : 'none'} />)}</span><b>{r.score.toLocaleString()}<small>分</small></b></div>)}</>}</div>}
    {tab === 'password' && <ChangePassword user={user} onSuccess={u => { onUser(u); setNotice('密码已更新，当前设备保持登录。'); setTab('records'); }} />}
    {tab === 'users' && <div className="admin-content">{resetUser ? <form className="account-form" onSubmit={reset}><h3>重置 {resetUser.displayName} 的密码</h3><PasswordInput name="password" label="新的初始密码" minLength={8} autoComplete="new-password" /><div className="settings-actions"><button className="secondary-button" type="button" onClick={() => setResetUser(null)}>取消</button><button className="primary-button" disabled={busy}>确定重置</button></div></form> : <form className="account-form create-user-form" onSubmit={createUser}><h3><Plus size={16} /> 创建新用户</h3><div className="form-columns"><label className="form-field"><span>账号</span><input name="username" placeholder="字母、数字或下划线" autoComplete="off" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_\-]{3,32}" /></label><label className="form-field"><span>昵称</span><input name="displayName" placeholder="页面中显示的名字" required maxLength={32} /></label></div><PasswordInput name="password" label="初始密码" autoComplete="new-password" minLength={8} /><button className="primary-button wide" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} 创建账号</button></form>}<div className="user-list">{loading ? <p className="records-caption">正在读取用户</p> : users.map(u => <div className="user-row" key={u.id}><span className="mini-avatar">{u.displayName.slice(0, 1)}</span><div><strong>{u.displayName}</strong><small>@{u.username}</small></div>{u.role === 'admin' ? <span className="soft-tag">管理员</span> : <button className="text-button" onClick={() => { setResetUser(u); setNotice(''); }}>重置密码</button>}</div>)}</div></div>}
  </div></div>;
}

export default function Session() {
  const [user, setUser] = useState<User | null>(null), [checking, setChecking] = useState(true), [error, setError] = useState('');
  const [cloud, setCloud] = useState<CloudSave | null>(null), [initialGame, setInitialGame] = useState<Game | null>(null);
  const [generation, setGeneration] = useState(0), [account, setAccount] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<(CloudSave & { game: Game }) | null>(null);
  const checkSequence = useRef(0), loadSequence = useRef(0);
  const expired = useCallback(() => { setUser(null); setCloud(null); setInitialGame(null); setAccount(false); setError(''); }, []);
  const loadCloud = useCallback(async (u: User, ignorePending = false) => {
    const sequence = ++loadSequence.current;
    setChecking(true); setError('');
    try {
      const remote = await api<CloudSave>('/game'); if (sequence !== loadSequence.current) return; setCloud(remote);
      setPendingConflict(null);
      const restored = remote.game ? restoreGame(JSON.stringify(remote.game)) : null;
      if (remote.game && !restored) throw new Error('云端进度无法读取，请联系管理员；原记录未被覆盖');
      const pending = ignorePending ? null : loadPending(u.id);
      const validPending = pending && restoreGame(JSON.stringify(pending.game));
      if (validPending && pending) {
        if (JSON.stringify(pending.game) === JSON.stringify(remote.game)) { localStorage.removeItem(pendingKey(u.id)); setInitialGame(restored); }
        else if (pending.revision === remote.revision) setInitialGame(validPending);
        else { setPendingConflict(pending); setInitialGame(null); }
      } else setInitialGame(restored || newGame(1, crypto.getRandomValues(new Uint32Array(1))[0]));
      setGeneration(n => n + 1);
    } catch (e) { if (sequence === loadSequence.current) setError(message(e)); } finally { if (sequence === loadSequence.current) setChecking(false); }
  }, []);
  const loggedIn = useCallback((u: User) => { setUser(u); setError(''); if (!u.mustChangePassword) void loadCloud(u); else setChecking(false); }, [loadCloud]);
  const checkSession = useCallback(async () => {
    const sequence = ++checkSequence.current;
    setChecking(true); setError('');
    try { const result = await api<{ user: User | null }>('/session'); if (sequence !== checkSequence.current) return; if (result.user) loggedIn(result.user); else { setUser(null); setChecking(false); } }
    catch (e) { if (sequence === checkSequence.current) { setError(message(e)); setChecking(false); } }
  }, [loggedIn]);
  useEffect(() => { void checkSession(); }, [checkSession]);
  const closeAccount = useCallback(() => setAccount(false), []);
  const logout = async () => { await api('/auth/logout', 'POST', {}); expired(); };

  if (checking) return <div className="session-loading"><img src={assetUrl('favicon.svg')} alt="连连看" /><LoaderCircle size={22} className="spin" /><p>正在接上你的快乐时光…</p></div>;
  if (error) return <div className="session-loading"><CloudCheck size={38} /><h2>暂时没能连接到云端</h2><p>{error}</p><button className="primary-button" onClick={() => { if (user) void loadCloud(user); else void checkSession(); }}>重新连接</button></div>;
  if (!user) return <Login onSuccess={loggedIn} />;
  if (user.mustChangePassword) return <div className="password-page"><div className="modal"><span className="modal-illustration"><KeyRound size={27} /></span><h2>欢迎，{user.displayName}</h2><ChangePassword user={user} onSuccess={loggedIn} /><button className="text-button logout-button" onClick={() => { void logout().catch(e => setError(message(e))); }}>返回登录</button></div></div>;
  if (pendingConflict && cloud) return <div className="password-page"><div className="modal"><h2>发现尚未同步的本机进度</h2><p className="modal-intro">本机停在第 {pendingConflict.game.level.number} 关，云端停在第 {cloud.game?.level.number || 1} 关。请选择继续哪一份，另一份当前棋盘将被替换。</p><div className="settings-actions"><button className="primary-button" onClick={() => { localStorage.removeItem(pendingKey(user.id)); setPendingConflict(null); void loadCloud(user, true); }}>继续云端进度</button><button className="secondary-button" onClick={async () => {
    try { await api('/game', 'PUT', { game: pendingConflict.game, revision: cloud.revision }); localStorage.removeItem(pendingKey(user.id)); setPendingConflict(null); void loadCloud(user, true); }
    catch { void loadCloud(user); }
  }}>保留本机进度</button></div></div></div>;
  if (!cloud || !initialGame) return <div className="session-loading"><p>正在恢复进度…</p></div>;
  return <><App key={generation} initialGame={initialGame} cloud={cloud} user={user} onSessionExpired={expired} onLoadCloud={() => void loadCloud(user, true)} onAccount={() => setAccount(true)} onLogout={logout} />{account && <AccountPanel user={user} onClose={closeAccount} onUser={setUser} />}</>;
}
