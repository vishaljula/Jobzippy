import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Only check mode - package.json controls this via --mode flag
  const isProduction = mode === 'production';

  return {
    envDir: resolve(__dirname, '..'), // Look for .env in project root
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
          {
            src: 'public/mocks',
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
      emptyOutDir: false,
      minify: isProduction ? 'esbuild' : false, // Disable minification in dev mode
      sourcemap: !isProduction, // Enable sourcemaps for debugging
      rollupOptions: {
        input: {
          // Side panel (main UI)
          'sidepanel/index': resolve(__dirname, 'src/sidepanel/index.html'),
          // Background service worker
          background: resolve(__dirname, 'src/background/index.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            // Background and content scripts should be in their own files
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
  };
});
