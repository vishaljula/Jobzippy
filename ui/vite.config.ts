import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/manifest.json',
          dest: '.',
        },
        {
          src: 'public/icons',
          dest: '.',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      input: {
        // Side panel (main UI)
        'sidepanel/index': resolve(__dirname, 'src/sidepanel/index.html'),
        // Background service worker
        background: resolve(__dirname, 'src/background/index.ts'),
        // Content scripts
        'content-linkedin': resolve(__dirname, 'src/content/linkedin/index.ts'),
        'content-indeed': resolve(__dirname, 'src/content/indeed/index.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Background and content scripts should be in their own files
          if (chunkInfo.name.startsWith('content-')) {
            return 'content/[name].js';
          }
          if (chunkInfo.name === 'background') {
            return 'background/index.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Handle HTML files
          if (assetInfo.name && assetInfo.name.endsWith('.html')) {
            return '[name].[ext]';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
