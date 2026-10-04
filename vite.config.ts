import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const assets = (env.VITE_ASSET_BASE_URL || './assets/').replace(/\/?$/, '/');
  return {
    plugins: [react(), { name: 'asset-favicon', transformIndexHtml: (html: string) => html.replace('%ASSET_FAVICON_URL%', `${assets}favicon.svg`) }],
    base: './',
    server: { proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } },
  };
});
