import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['unlight-pseudocandidly-rachelle.ngrok-free.dev', '192.168.78.1'],
    hmr: { host: '192.168.78.1', protocol: 'ws' },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
