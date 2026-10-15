import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { settingsPlugin } from './vite-plugin-settings.ts';
import { snapshotPlugin } from './vite-plugin-snapshot.ts';

export default defineConfig({
  plugins: [vue(), settingsPlugin(), snapshotPlugin()],
  server: {
    // Never expose the dev server to the LAN (see docs/DESIGN.md 5).
    host: '127.0.0.1',
    // Vite's default 5173 is also MulmoClaude's; fail instead of drifting to another port.
    port: 5273,
    strictPort: true,
    // The real snapshot is reachable only through the plugin's /snapshot.json route.
    fs: {
      deny: [
        // Vite's defaults (overriding `deny` replaces them, so they are repeated here).
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/.data/**',
      ],
    },
    // The collector rewrites .data/snapshot.json every minute; do not watch it.
    watch: { ignored: ['**/.data/**'] },
  },
});
