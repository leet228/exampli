import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from '@svgr/rollup';

// https://vite.dev/config/

export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    allowedHosts: ['unlight-pseudocandidly-rachelle.ngrok-free.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:5174',
        changeOrigin: true
      }
    }
  }
})
