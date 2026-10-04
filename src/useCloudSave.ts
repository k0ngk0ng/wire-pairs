import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, pendingKey, type CloudSave } from './api';
import type { Game } from './game';

export function useCloudSave(game: Game, userId: string, initial: CloudSave, onSessionExpired: () => void) {
  const [status, setStatus] = useState<'saved' | 'saving' | 'offline' | 'conflict' | 'error'>('saved');
  const [conflict, setConflict] = useState<CloudSave | null>(null);
  const [error, setError] = useState('');
  const state = useRef({ revision: initial.revision, latest: game, lastSaved: JSON.stringify(initial.game), inFlight: null as Promise<boolean> | null, conflict: false, disposed: false, suppress: false });
  state.current.latest = game;
  const cache = useCallback(() => {
    if (state.current.suppress) return;
    try { localStorage.setItem(pendingKey(userId), JSON.stringify({ game: state.current.latest, revision: state.current.revision, updatedAt: Date.now() })); } catch { /* Server saving still works if local storage is unavailable. */ }
  }, [userId]);
  const flush = useCallback(async (): Promise<boolean> => {
    const s = state.current;
    if (s.inFlight) { const ok = await s.inFlight; if (!ok) return false; return flush(); }
    if (s.conflict || s.disposed || s.suppress) return false;
    const content = JSON.stringify(s.latest);
    if (content === s.lastSaved) return true;
    cache(); setStatus('saving');
    const send = async () => {
      try {
        const result = await api<{ revision: number; updatedAt: number }>('/game', 'PUT', { revision: s.revision, game: JSON.parse(content) });
        s.revision = result.revision; s.lastSaved = content;
        if (content === JSON.stringify(s.latest)) { try { localStorage.removeItem(pendingKey(userId)); } catch { /* Optional local cache. */ } }
        else cache();
        if (!s.disposed) { setStatus('saved'); setError(''); }
        return true;
      } catch (e) {
        if (s.disposed) return false;
        if (e instanceof ApiError && e.status === 409) { s.conflict = true; setConflict(e.data as CloudSave); setStatus('conflict'); }
        else if (e instanceof ApiError && e.status === 401) { cache(); onSessionExpired(); }
        else if (e instanceof ApiError && e.status === 400) { setStatus('error'); setError(e.message); }
        else { setStatus('offline'); setError('暂时无法连接服务器，进度已在本机暂存'); }
        return false;
      } finally { s.inFlight = null; }
    };
    s.inFlight = send(); return s.inFlight;
  }, [cache, onSessionExpired, userId]);
  useEffect(() => {
    const s = state.current; s.disposed = false;
    const timer = setInterval(() => { void flush(); }, 4000);
    const online = () => { void flush(); };
    const leaving = () => {
      cache();
      // A revision check makes duplicate/reordered unload writes harmless.
      if (!s.inFlight && !s.conflict && !s.suppress && JSON.stringify(s.latest) !== s.lastSaved) {
        void fetch('/api/game', { method: 'PUT', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: s.revision, game: s.latest }) }).catch(() => {});
      }
    };
    window.addEventListener('online', online); window.addEventListener('pagehide', leaving);
    return () => { s.disposed = true; clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('pagehide', leaving); };
  }, [cache, flush]);
  useEffect(() => {
    cache(); const timer = setTimeout(() => { void flush(); }, game.status === 'won' || game.status === 'lost' || game.status === 'paused' ? 0 : 350);
    return () => clearTimeout(timer);
  }, [game.event.id, game.status, game.level.number, cache, flush]);
  const overwrite = async () => {
    if (!conflict) return false;
    state.current.revision = conflict.revision; state.current.conflict = false;
    // Force a write even when the local content happens to equal the last successful save.
    state.current.lastSaved = ''; setConflict(null);
    return flush();
  };
  const discardLocal = () => { state.current.suppress = true; try { localStorage.removeItem(pendingKey(userId)); } catch { /* Optional cache. */ } };
  return { status, conflict, error, flush, overwrite, discardLocal };
}
