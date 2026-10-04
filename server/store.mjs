import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const scrypt = promisify(scryptCallback);
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export function validateAccount(username, password, displayName = username) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_\-]{3,32}$/.test(username)) return '账号需为 3～32 位字母、数字、下划线或短横线';
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return '密码长度需为 8～128 位';
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 32) return '昵称需为 1～32 个字符';
  return null;
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${Buffer.from(key).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, hex] = stored.split(':');
  const key = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(hex, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export const publicUser = row => row ? { id: row.id, username: row.username, displayName: row.display_name, role: row.role, mustChangePassword: !!row.must_change_password } : null;

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')),
      must_change_password INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS saves (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
      data TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL, level INTEGER NOT NULL, score INTEGER NOT NULL, stars INTEGER NOT NULL,
      remaining REAL NOT NULL, max_combo INTEGER NOT NULL, completed_at INTEGER NOT NULL,
      UNIQUE(user_id, run_id, level)
    );
    CREATE INDEX IF NOT EXISTS record_user ON records(user_id, completed_at DESC);
  `);
  const getUser = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const getByUsername = username => db.prepare('SELECT * FROM users WHERE username=?').get(username);
  return {
    db, getUser, getByUsername,
    async createUser(username, password, displayName = username, role = 'user', mustChange = true) {
      const error = validateAccount(username, password, displayName); if (error) throw new Error(error);
      const hash = await hashPassword(password), id = randomUUID();
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, username, displayName.trim(), hash, role, Number(mustChange), Date.now());
      return publicUser(getUser(id));
    },
    createSession(userId) {
      const token = randomBytes(32).toString('base64url'), now = Date.now();
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hashToken(token), userId, now + 30 * 86400000, now);
      return token;
    },
    session(token) {
      if (!token || token.length > 100) return null;
      return db.prepare('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE token_hash=? AND expires_at>?').get(hashToken(token), Date.now()) || null;
    },
    revoke(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)); },
    async changePassword(id, password, mustChange = false) {
      const hash = await hashPassword(password);
      db.prepare('UPDATE users SET password_hash=?, must_change_password=? WHERE id=?').run(hash, Number(mustChange), id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    },
    readSave(userId) {
      const row = db.prepare('SELECT * FROM saves WHERE user_id=?').get(userId);
      return row ? { revision: row.revision, game: JSON.parse(row.data), updatedAt: row.updated_at } : { revision: 0, game: null, updatedAt: null };
    },
    writeSave(userId, game, revision) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous = db.prepare('SELECT revision FROM saves WHERE user_id=?').get(userId);
        if ((previous?.revision || 0) !== revision) { db.exec('ROLLBACK'); return { conflict: true, ...this.readSave(userId) }; }
        const updatedAt = Date.now();
        db.prepare('INSERT INTO saves(user_id,revision,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at')
          .run(userId, revision + 1, JSON.stringify(game), updatedAt);
        if (game.status === 'won') {
          const met = game.level.challenge.includes('6') ? game.maxCombo >= 6 : game.level.challenge.includes('道具') ? game.used === 0 : game.remaining >= 30;
          const stars = 1 + Number(game.remaining >= game.level.seconds * .2) + Number(met);
          db.prepare('INSERT INTO records(user_id,run_id,level,score,stars,remaining,max_combo,completed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,run_id,level) DO UPDATE SET score=MAX(records.score,excluded.score),stars=MAX(records.stars,excluded.stars),remaining=MAX(records.remaining,excluded.remaining),max_combo=MAX(records.max_combo,excluded.max_combo)')
            .run(userId, game.runId, game.level.number, game.score, stars, game.remaining, game.maxCombo, updatedAt);
        }
        db.exec('COMMIT'); return { revision: revision + 1, updatedAt };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    records(userId) {
      return db.prepare('SELECT level,score,stars,remaining,max_combo AS maxCombo,completed_at AS completedAt FROM records WHERE user_id=? ORDER BY completed_at DESC,id DESC LIMIT 50').all(userId);
    },
    listUsers() { return db.prepare('SELECT id,username,display_name AS displayName,role,must_change_password AS mustChangePassword,created_at AS createdAt FROM users ORDER BY created_at').all(); },
    close() { db.close(); },
  };
}
