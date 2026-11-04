import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    headers: {
      // Ensure VRM binaries aren't sniffed as text on first request
      'Accept-Ranges': 'bytes',
    },
  },
  resolve: {
    // Shared package emits CJS for Nest; Vite needs ESM named exports from source.
    alias: {
      '@protocol-z/shared': path.resolve(rootDir, '../../packages/shared/src/index.ts'),
    },
  },
  assetsInclude: ['**/*.vrm'],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ProtocolZGame',
      formats: ['es'],
      fileName: 'protocol-z-game',
    },
    rollupOptions: {
      external: ['three', 'socket.io-client'],
    },
  },
});
