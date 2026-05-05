import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    ]),
    electronRenderer(),
    {
      name: 'remove-crossorigin-for-electron',
      transformIndexHtml(html) {
        return html.replace(/crossorigin/g, '');
      },
    },
    {
      name: 'resolve-tinymce-subpath',
      resolveId(id) {
        if (!id.startsWith('tinymce/')) return;
        const parts = id.split('/');
        if (parts.length < 3) return;
        const base = path.resolve(__dirname, 'node_modules', id);
        // Try the known file patterns for each tinymce subpackage type
        const candidates: string[] = [];
        if (parts[1] === 'themes') candidates.push(base + '/theme.js');
        if (parts[1] === 'models') candidates.push(base + '/model.js');
        if (parts[1] === 'icons') candidates.push(base + '/icons.js');
        if (parts[1] === 'plugins') candidates.push(base + '/plugin.js');
        for (const c of candidates) {
          if (fs.existsSync(c)) return c;
        }
        // Fallback: append .js
        if (fs.existsSync(base + '.js')) return base + '.js';
        return;
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
