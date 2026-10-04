import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const game = () => ({ version: 1, runId: 'test-run-1234', status: 'playing', level: { number: 1, seed: 123, name: '测试', description: '测试棋盘', challenge: '剩余 30 秒通关', mechanic: 'classic', seconds: 180, board: { rows: 1, cols: 2, cells: [{ kind: 'tile', icon: 1 }, { kind: 'tile', icon: 1 }] }, solution: [[0, 1]] }, remaining: 170, score: 0, totalScore: 0, selected: null, combo: 0, comboLeft: 0, maxCombo: 0, tools: { hint: 3, shuffle: 2, hammer: 2 }, used: 0, hammer: false, hint: [], hintLeft: 0, best: 0, highest: 1, cleared: 0, event: { id: 0, type: '' } });

describe('accounts and server-side records', () => {
  let store, server, base, admin, alice, bob, directory;
  const client = () => {
    let cookie = '';
    const request = async (path, method = 'GET', body, headers = {}) => {
      const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', Origin: base } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const data = await response.json(); return { status: response.status, data, headers: response.headers };
    };
    return { request, cookie: () => cookie };
  };
  before(async () => {
    mkdirSync('.work', { recursive: true }); directory = mkdtempSync(resolve('.work', 'api-test-'));
    store = openStore(resolve(directory, 'test.sqlite'));
    await store.createUser('admin', 'Admin-test-123!', '管理员', 'admin', false);
    await store.createUser('alice', 'Alice-test-123!', 'Alice', 'user', false);
    await store.createUser('bob', 'Bob-test-12345!', 'Bob', 'user', false);
    server = await createApp({ store, logger: { error() {} } }); await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
    admin = client(); alice = client(); bob = client();
    for (const [c, username, password] of [[admin, 'admin', 'Admin-test-123!'], [alice, 'alice', 'Alice-test-123!'], [bob, 'bob', 'Bob-test-12345!']]) assert.equal((await c.request('/api/auth/login', 'POST', { username, password })).status, 200);
  });
  after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); store.close(); rmSync(directory, { recursive: true }); });
  it('does not allow registration or unauthenticated progress access', async () => {
    const anonymous = client();
    assert.equal((await anonymous.request('/api/game')).status, 401);
    assert.equal((await anonymous.request('/api/admin/users')).status, 401);
    assert.notEqual((await anonymous.request('/api/auth/register', 'POST', { username: 'hacker', password: 'password123' })).status, 201);
    assert.equal(store.getByUsername('hacker'), undefined);
  });
  it('stores salted password hashes, never plaintext, and returns secure session attributes', async () => {
    const row = store.getByUsername('alice'); assert.notEqual(row.password_hash, 'Alice-test-123!'); assert.match(row.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
    const result = await client().request('/api/auth/login', 'POST', { username: 'ALICE', password: 'Alice-test-123!' });
    assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /HttpOnly/); assert.match(result.headers.get('set-cookie'), /SameSite=Strict/);
    assert.equal(result.data.user.password_hash, undefined);
    assert.equal((await client().request('/api/auth/login', 'POST', { username: 'alice', password: 'incorrect' })).status, 401);
  });
  it('only lets admins create users and forces first-login password change', async () => {
    assert.equal((await alice.request('/api/admin/users', 'POST', { username: 'mallory', password: 'password123' })).status, 403);
    const created = await admin.request('/api/admin/users', 'POST', { username: 'charlie', displayName: '小查', password: 'Initial-charlie-123', role: 'admin' });
    assert.equal(created.status, 201); assert.equal(created.data.user.role, 'user');
    const charlie = client(); const login = await charlie.request('/api/auth/login', 'POST', { username: 'charlie', password: 'Initial-charlie-123' });
    assert.equal(login.data.user.mustChangePassword, true); assert.equal((await charlie.request('/api/game')).status, 403);
    assert.equal((await charlie.request('/api/auth/password', 'POST', { currentPassword: 'Initial-charlie-123', password: 'Personal-charlie-123' })).status, 200);
    assert.equal((await charlie.request('/api/game')).status, 200);
    assert.equal((await admin.request('/api/admin/users', 'POST', { username: 'charlie', password: 'password123' })).status, 409);
  });
  it('isolates game state and records by authenticated user, ignoring supplied user IDs', async () => {
    const g = game(); const result = await alice.request('/api/game', 'PUT', { revision: 0, game: g, userId: store.getByUsername('bob').id });
    assert.equal(result.status, 200); assert.equal(result.data.revision, 1);
    assert.equal((await alice.request('/api/game')).data.game.runId, g.runId);
    assert.equal((await bob.request('/api/game')).data.game, null);
    assert.deepEqual((await bob.request('/api/records')).data.records, []);
  });
  it('rejects stale revisions without overwriting newer progress', async () => {
    const g = game(); g.score = 99;
    const result = await alice.request('/api/game', 'PUT', { revision: 0, game: g });
    assert.equal(result.status, 409); assert.equal(result.data.revision, 1); assert.equal(result.data.game.score, 0);
    assert.equal((await alice.request('/api/game')).data.game.score, 0);
  });
  it('records wins transactionally, deduplicates retries, and keeps history after a new run', async () => {
    const g = game(); Object.assign(g, { status: 'won', score: 100, best: 100, cleared: 2, maxCombo: 1, highest: 2 }); g.level.board.cells = [null, null];
    assert.equal((await alice.request('/api/game', 'PUT', { revision: 1, game: g })).status, 200);
    assert.equal((await alice.request('/api/game', 'PUT', { revision: 2, game: g })).status, 200);
    let records = (await alice.request('/api/records')).data.records;
    assert.equal(records.length, 1); assert.equal(records[0].score, 100); assert.equal(records[0].stars, 3);
    const next = game(); next.runId = 'different-run-5678';
    assert.equal((await alice.request('/api/game', 'PUT', { revision: 3, game: next })).status, 200);
    records = (await alice.request('/api/records')).data.records; assert.equal(records.length, 1);
  });
  it('rejects malformed, odd-pair and oversized saves', async () => {
    for (const value of [{}, null, { ...game(), score: -1 }, { ...game(), status: 'won' }, { ...game(), tools: { hint: 900, shuffle: 2, hammer: 2 } }]) assert.equal((await bob.request('/api/game', 'PUT', { revision: 0, game: value })).status, 400);
    const odd = game(); odd.level.board.cells[0] = null; assert.equal((await bob.request('/api/game', 'PUT', { revision: 0, game: odd })).status, 400);
    assert.equal((await bob.request('/api/game', 'PUT', { revision: 0, game: game(), padding: 'a'.repeat(70000) })).status, 413);
    assert.equal((await bob.request('/api/game')).data.revision, 0);
  });
  it('blocks cross-origin writes and non-JSON requests', async () => {
    assert.equal((await alice.request('/api/game', 'PUT', { revision: 4, game: game() }, { Origin: 'https://untrusted.example' })).status, 403);
    const response = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: alice.cookie(), 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(response.status, 415);
  });
  it('invalidates all old sessions after an admin password reset', async () => {
    const id = store.getByUsername('bob').id;
    assert.equal((await admin.request('/api/admin/reset-password', 'POST', { userId: id, password: 'Reset-bob-1234!' })).status, 200);
    assert.equal((await bob.request('/api/game')).status, 401);
    const login = await bob.request('/api/auth/login', 'POST', { username: 'bob', password: 'Reset-bob-1234!' });
    assert.equal(login.status, 200); assert.equal(login.data.user.mustChangePassword, true);
    assert.equal((await bob.request('/api/game')).status, 403);
  });
  it('persists SQLite data across reopening and logout revokes the session', async () => {
    const another = openStore(resolve(directory, 'test.sqlite'));
    assert.equal(another.readSave(store.getByUsername('alice').id).revision, 4); assert.equal(another.records(store.getByUsername('alice').id).length, 1); another.close();
    assert.equal((await alice.request('/api/auth/logout', 'POST', {})).status, 200);
    assert.equal((await alice.request('/api/game')).status, 401);
  });
  it('rate limits repeated incorrect logins', async () => {
    const anonymous = client(); let result;
    for (let i = 0; i < 12; i++) result = await anonymous.request('/api/auth/login', 'POST', { username: 'nonexistent', password: 'wrong-password' });
    assert.equal(result.status, 429);
  });
  it('also rate limits simultaneous guesses while password hashes are pending', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => client().request('/api/auth/login', 'POST', { username: 'parallel-guesses', password: 'wrong-password' })));
    assert.equal(results.filter(r => r.status === 429).length, 2);
    assert.equal(results.filter(r => r.status === 401).length, 10);
  });
});
