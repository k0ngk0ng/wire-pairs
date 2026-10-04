import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(process.env.DATA_DIR || 'data');
const backupDirectory = resolve(directory, 'backups');
mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const database = new DatabaseSync(resolve(directory, 'wire-pairs.sqlite'), { readOnly: true });
const file = resolve(backupDirectory, `wire-pairs-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
try { await backup(database, file); console.log(`一致性备份已保存：${file}`); } finally { database.close(); }
