import type { Game } from './game';
export type User = { id: string; username: string; displayName: string; role: 'admin' | 'user'; mustChangePassword: boolean };
export type CloudSave = { revision: number; game: Game | null; updatedAt: number | null };
export type RecordRow = { level: number; score: number; stars: number; remaining: number; maxCombo: number; completedAt: number };
export class ApiError extends Error {
  status: number; data: unknown;
  constructor(status: number, message: string, data: unknown) { super(message); this.status = status; this.data = data; }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  const result = await response.json().catch(() => ({ error: '服务器返回了无法识别的响应' }));
  if (!response.ok) throw new ApiError(response.status, result.error || '请求失败，请稍后重试', result);
  return result as T;
}
export const pendingKey = (id: string) => `wire-pairs.pending.${id}`;
export function loadPending(id: string): (CloudSave & { game: Game }) | null {
  try { const s = JSON.parse(localStorage.getItem(pendingKey(id)) || 'null'); return s?.game && Number.isInteger(s.revision) ? s : null; } catch { return null; }
}
