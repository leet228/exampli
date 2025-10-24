import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from '@svgr/rollup';

// https://vite.dev/config/

export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: ['unlight-pseudocandidly-rachelle.ngrok-free.dev', '192.168.78.1'],
    hmr: { host: '192.168.78.1', protocol: 'ws' },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500
  }
})
