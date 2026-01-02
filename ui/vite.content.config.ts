import { defineConfig } from 'vite';
import { resolve } from 'path';

// Get the entry point from env var
const entryName = process.env.CONTENT_ENTRY;
const entryPath = process.env.CONTENT_PATH;

if (!entryName || !entryPath) {
  throw new Error('CONTENT_ENTRY and CONTENT_PATH env vars are required');
}

export default defineConfig(({ mode }) => {
  // Only check mode - package.json controls this via --mode flag
  const isProduction = mode === 'production';

  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist/content',
      emptyOutDir: false, // Don't delete other files
      minify: isProduction ? 'esbuild' : false, // Disable minification in dev mode
      sourcemap: !isProduction ? 'inline' : false, // Enable sourcemaps for debugging
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
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
    },
  };
});
