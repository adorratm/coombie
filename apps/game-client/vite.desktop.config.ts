import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Standalone static build for Electron / Steam packaging (relative asset paths). */
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@protocol-z/shared': path.resolve(rootDir, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  assetsInclude: ['**/*.vrm'],
  build: {
    outDir: '../desktop/game-dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'chrome120',
    chunkSizeWarningLimit: 1800,
  },
});
