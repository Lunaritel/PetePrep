import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function cspPlugin(production: boolean): Plugin {
  return {
    name: 'peteprep-web-csp',
    transformIndexHtml(html) {
      const policy = production
        ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; manifest-src 'self'; connect-src 'self'"
        : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; manifest-src 'self'; connect-src 'self' ws://localhost:* http://localhost:*";
      return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/?\s*>/i, `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: 'src/renderer',
  base: '/PetePrep/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/pwa-192.png', 'icons/pwa-512.png', 'icons/pwa-maskable-512.png', 'THIRD_PARTY_NOTICES.txt', 'LICENSE'],
      manifest: {
        name: 'PetePrep',
        short_name: 'PetePrep',
        description: 'Offline exam practice with progress saved on your device.',
        start_url: '/PetePrep/',
        scope: '/PetePrep/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#eef0f8',
        background_color: '#eef0f8',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2,webmanifest,txt}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
    cspPlugin(mode === 'production'),
  ],
  define: { __APP_VERSION__: JSON.stringify(version), __WEB_BUILD__: JSON.stringify(true) },
  build: { outDir: '../../dist-web', emptyOutDir: true },
}));
