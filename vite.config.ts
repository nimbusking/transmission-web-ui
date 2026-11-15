import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    proxy: {
      '/rpc': {
        target: process.env.TR_RPC_TARGET || 'http://127.0.0.1:19091',
        changeOrigin: true,
        rewrite: () => '/transmission/rpc',
      },
    },
  },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
});
