/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { realpathSync } from 'fs'

const projectRoot = process.cwd()
const projectRealRoot = realpathSync(projectRoot)

// https://vite.dev/config/
export default defineConfig({
  root: projectRoot,
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    fs: {
      allow: [projectRoot, projectRealRoot],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      allowExternal: true,
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'dist/**',
        'coverage/**',
        'node_modules/**',
        'src/**/*.d.ts',
        'src/test/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/core/vite-env.d.ts',
      ],
      thresholds: {
        statements: 61,
        branches: 48,
        functions: 61,
        lines: 63,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('@xyflow') || id.includes('elkjs')) {
              return 'vendor-flow';
            }
            if (id.includes('three') || id.includes('@react-three')) {
              return 'vendor-three';
            }
            if (id.includes('monaco-editor')) {
              return 'vendor-monaco';
            }
            if (id.includes('antd') || id.includes('@ant-design')) {
              return 'vendor-antd';
            }
            return 'vendor-core';
          }
        }
      }
    }
  }
})
