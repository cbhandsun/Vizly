
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { boundedJsonAssetsPlugin } from './vite-plugins/boundedJsonAssets';
import { startupModuleGroups } from './vite-plugins/startupModuleGroups';

export default defineConfig({
  plugins: [boundedJsonAssetsPlugin(), react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
    dedupe: ['yjs', 'react', 'react-dom'],
  },
  server: {
    watch: {
      ignored: ['**/tmp/**', '**/dist*/**', '**/playwright-report/**'],
    },
  },
  optimizeDeps: { force: true, entries: ['index.html'], include: ['@vizly/core', '@vizly/contracts'] },
  ssr: { noExternal: ['@vizly/core', '@vizly/contracts'] },
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: startupModuleGroups } },
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'packages/**/*.{test,spec}.{ts,tsx}', 'supabase/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.{js,mjs,ts}', 'vite-plugins/**/*.{test,spec}.{ts,js,mjs}', 'server/**/*.{test,spec}.ts'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setupLocaleAssetFetch.ts'],
    pool: 'forks',
  },
});

