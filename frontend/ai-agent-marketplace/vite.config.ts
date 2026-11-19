import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

const analyze = process.env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(analyze
      ? [
          visualizer({
            filename: 'dist/stats.html',
            open: false,
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@stellar/stellar-sdk') || id.includes('@stellar/freighter-api')) {
              return 'stellar';
            }
            if (
              id.includes('react-router-dom') ||
              id.includes('react-router') ||
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor';
            }
            if (id.includes('lucide-react')) {
              return 'lucide';
            }
            if (id.includes('date-fns')) {
              return 'date-fns';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'react-query';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});