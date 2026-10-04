import { resolve } from 'node:path';
import { openStore } from './store.mjs';
import { createApp } from './app.mjs';

const dbPath = resolve(process.env.DATA_DIR || 'data', 'wire-pairs.sqlite');
const store = openStore(dbPath);
const port = Number(process.env.API_PORT || process.env.PORT || 3001);
const server = await createApp({ store, origin: process.env.APP_ORIGIN || '', secureCookie: process.env.COOKIE_SECURE === 'true' });
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Wire Pairs server: http://${process.env.HOST || '127.0.0.1'}:${port}\nDatabase: ${dbPath}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => { store.close(); process.exit(0); }); });
