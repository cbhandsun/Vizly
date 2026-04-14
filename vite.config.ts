import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
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
