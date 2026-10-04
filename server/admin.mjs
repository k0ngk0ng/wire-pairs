import { resolve } from 'node:path';
import { openStore } from './store.mjs';

const args = process.argv.slice(2);
const value = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const store = openStore(resolve(process.env.DATA_DIR || 'data', 'wire-pairs.sqlite'));
try {
  const username = value('--username') || 'admin';
  let password;
  if (args.includes('--password-stdin')) {
    let input = ''; for await (const chunk of process.stdin) input += chunk; password = input.replace(/\r?\n$/, '');
  } else {
    process.stdout.write(`创建管理员 ${username}。请输入密码（至少 8 位，不会显示）：`);
    if (!process.stdin.isTTY) throw new Error('非交互环境请使用 --password-stdin');
    process.stdin.setRawMode(true); process.stdin.resume();
    password = await new Promise((accept, reject) => {
      let text = '';
      const onData = chunk => {
        for (const ch of chunk.toString()) {
          if (ch === '\u0003') { process.stdin.off('data', onData); reject(new Error('已取消')); return; }
          if (ch === '\r' || ch === '\n') { process.stdin.off('data', onData); accept(text); return; }
          if (ch === '\u007f') text = text.slice(0, -1); else if (ch >= ' ') text += ch;
        }
      }; process.stdin.on('data', onData);
    });
    process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n');
  }
  const existing = store.getByUsername(username);
  if (existing) {
    if (!args.includes('--reset-password') || existing.role !== 'admin') throw new Error('账号已存在；重置现有管理员密码请加 --reset-password');
    const { validateAccount } = await import('./store.mjs'); const error = validateAccount(username, password); if (error) throw new Error(error);
    await store.changePassword(existing.id, password); console.log(`管理员 ${username} 的密码已重置，旧会话已失效。`);
  } else {
    await store.createUser(username, password, value('--name') || '管理员', 'admin', false);
    console.log(`管理员 ${username} 已创建。请在网页登录后创建普通用户。`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); store.close(); }
