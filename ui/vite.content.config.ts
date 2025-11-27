import { defineConfig } from 'vite';
import { resolve } from 'path';

// Get the entry point from env var
const entryName = process.env.CONTENT_ENTRY;
const entryPath = process.env.CONTENT_PATH;

if (!entryName || !entryPath) {
  throw new Error('CONTENT_ENTRY and CONTENT_PATH env vars are required');
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/content',
    emptyOutDir: false, // Don't delete other files
    sourcemap: false, // Disable sourcemaps for cleaner output
    lib: {
      entry: resolve(__dirname, entryPath),
      name: entryName.replace(/-/g, '_'), // Global variable name for IIFE (must be valid JS identifier)
      formats: ['iife'],
      fileName: () => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        // Ensure we don't get any chunks
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
