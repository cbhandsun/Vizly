import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  worker: { format: 'es' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setupLocaleAssetFetch.ts'],
    pool: 'threads',
  },
});
