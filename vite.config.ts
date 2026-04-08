import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import environment from 'vite-plugin-environment';

// Generate build timestamp for cache busting
const BUILD_TIMESTAMP = Date.now();

export default defineConfig({
  plugins: [
    react(),
    environment('all', { prefix: 'CANISTER_' }),
    environment('all', { prefix: 'DFX_' }),
    environment('all', { prefix: 'VITE_' }),
  ],
  define: {
    global: 'globalThis',
    'process.env': {},
    Buffer: ['buffer', 'Buffer'],
    __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP),
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4943',
        changeOrigin: true,
      },
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].[hash].${BUILD_TIMESTAMP}.js`,
        chunkFileNames: `assets/[name].[hash].${BUILD_TIMESTAMP}.js`,
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          // ✅ FIX: Ensure .wasm and .js files from basis transcoder are served with proper MIME types
          if (name.endsWith('.wasm') || name.includes('basis_transcoder')) {
            return `assets/[name].[hash].[ext]`;
          }
          return `assets/[name].[hash].${BUILD_TIMESTAMP}.[ext]`;
        },
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  // ✅ FIX: Ensure WASM and JS files are treated as assets
  assetsInclude: ['**/*.wasm', '**/basis_transcoder.js'],
});
