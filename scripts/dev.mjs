import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', ...process.argv.slice(2)], { stdio: 'inherit' })];
let stopped = false;
function stop(code = 0) { if (stopped) return; stopped = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code; }
children.forEach(child => child.on('exit', code => stop(code || 0)));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
