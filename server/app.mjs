import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { hashPassword, publicUser, validateAccount, verifyPassword } from './store.mjs';
import { validGame } from './validation.mjs';

const COOKIE = 'wire_pairs_session';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8' };
const tokenFrom = req => req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);

export async function createApp({ store, staticDir = resolve('dist'), origin = '', secureCookie = false, logger = console }) {
  const dummyHash = await hashPassword('timing-padding-password');
  const attempts = new Map();
  const cookie = (token, expires = false) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expires ? 0 : 30 * 86400}${secureCookie ? '; Secure' : ''}`;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    const json = (code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
    const fail = (code, error) => json(code, { error });
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!path.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(req.method)) return fail(405, '请求方法不支持');
        let file = resolve(staticDir, '.' + decodeURIComponent(path));
        if (file !== staticDir && !file.startsWith(staticDir + sep)) return fail(403, '无法访问该资源');
        try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); }
        catch { if (extname(path)) return fail(404, '资源不存在'); file = resolve(staticDir, 'index.html'); }
        const content = await readFile(file).catch(() => null);
        if (!content) return fail(404, '页面尚未构建，请先运行 npm run build');
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
        return res.end(req.method === 'HEAD' ? undefined : content);
      }
      if (path === '/api/health' && req.method === 'GET') return json(200, { ok: true });
      let body = {};
      if (!['GET', 'HEAD'].includes(req.method)) {
        const requestOrigin = req.headers.origin;
        const allowedOrigin = origin || `http://${req.headers.host}`;
        if (requestOrigin && requestOrigin !== allowedOrigin) return fail(403, '请求来源不匹配');
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return fail(415, '请使用 JSON 请求');
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 65536) { fail(413, '游戏记录过大'); req.resume(); return; } chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return fail(400, '请求格式不正确'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, '请求格式不正确');
      }
      const token = tokenFrom(req), user = store.session(token);
      if (path === '/api/session' && req.method === 'GET') return json(200, { user: publicUser(user) });
      if (path === '/api/auth/login' && req.method === 'POST') {
        const key = `${req.socket.remoteAddress || 'local'}:${typeof body.username === 'string' ? body.username.trim().toLowerCase().slice(0, 32) : '<invalid>'}`, now = Date.now();
        if (attempts.size > 10000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
        const bucket = attempts.get(key);
        if (bucket && bucket.until > now && bucket.count >= 10) return json(429, { error: '尝试次数较多，请 15 分钟后再试' }, { 'Retry-After': '900' });
        // Reserve before asynchronous password hashing so simultaneous requests cannot bypass the limit.
        attempts.set(key, { count: bucket && bucket.until > now ? bucket.count + 1 : 1, until: bucket && bucket.until > now ? bucket.until : now + 900000 });
        const account = typeof body.username === 'string' && body.username.length <= 32 ? store.getByUsername(body.username.trim()) : null;
        const valid = await verifyPassword(body.password, account?.password_hash || dummyHash);
        if (!account || !valid) {
          return fail(401, '账号或密码不正确');
        }
        attempts.delete(key); store.revoke(token);
        return json(200, { user: publicUser(account) }, { 'Set-Cookie': cookie(store.createSession(account.id)) });
      }
      // There is intentionally no registration endpoint.
      if (!user) return fail(401, '请先登录');
      if (path === '/api/auth/logout' && req.method === 'POST') { store.revoke(token); return json(200, { ok: true }, { 'Set-Cookie': cookie('', true) }); }
      if (path === '/api/auth/password' && req.method === 'POST') {
        if (!await verifyPassword(body.currentPassword, user.password_hash)) return fail(400, '原密码不正确');
        const error = validateAccount(user.username, body.password, user.display_name); if (error) return fail(400, error);
        if (body.password === body.currentPassword) return fail(400, '新密码不能与原密码相同');
        await store.changePassword(user.id, body.password);
        return json(200, { user: publicUser(store.getUser(user.id)) }, { 'Set-Cookie': cookie(store.createSession(user.id)) });
      }
      if (user.must_change_password) return fail(403, '请先修改管理员分配的初始密码');
      if (path === '/api/game' && req.method === 'GET') return json(200, store.readSave(user.id));
      if (path === '/api/game' && req.method === 'PUT') {
        if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validGame(body.game)) return fail(400, '游戏记录格式不正确，请重新加载进度');
        const result = store.writeSave(user.id, body.game, body.revision);
        return json(result.conflict ? 409 : 200, result);
      }
      if (path === '/api/records' && req.method === 'GET') return json(200, { records: store.records(user.id) });
      if (path.startsWith('/api/admin/')) {
        if (user.role !== 'admin') return fail(403, '只有管理员可以管理账号');
        if (path === '/api/admin/users' && req.method === 'GET') return json(200, { users: store.listUsers() });
        if (path === '/api/admin/users' && req.method === 'POST') {
          const error = validateAccount(body.username, body.password, body.displayName || body.username); if (error) return fail(400, error);
          try { const account = await store.createUser(body.username, body.password, body.displayName || body.username); return json(201, { user: account }); }
          catch (error) { if (String(error.message).includes('UNIQUE')) return fail(409, '这个账号已经存在'); throw error; }
        }
        if (path === '/api/admin/reset-password' && req.method === 'POST') {
          const target = typeof body.userId === 'string' ? store.getUser(body.userId) : null;
          if (!target || target.role === 'admin') return fail(400, '只能重置普通用户的密码');
          const error = validateAccount(target.username, body.password, target.display_name); if (error) return fail(400, error);
          await store.changePassword(target.id, body.password, true); return json(200, { ok: true });
        }
      }
      return fail(404, '接口不存在');
    } catch (error) { logger.error('Request failed:', error.message); if (!res.headersSent) fail(500, '服务暂时不可用，请稍后重试'); else res.end(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
