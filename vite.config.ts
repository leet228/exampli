import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from '@svgr/rollup';

// https://vite.dev/config/

export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    allowedHosts: ['bool-acid-michel-landing.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:5173',
        changeOrigin: true
      }
    }
  }
})
