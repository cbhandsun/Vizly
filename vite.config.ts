
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
    dedupe: ['yjs', 'react', 'react-dom'],
  },
  optimizeDeps: { force: true, include: ['@vizly/core', '@vizly/contracts'] },
  ssr: { noExternal: ['@vizly/core', '@vizly/contracts'] },
  worker: { format: 'es' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setupLocaleAssetFetch.ts'],
    pool: 'threads',
  },
});

