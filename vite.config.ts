import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from '@svgr/rollup';

// https://vite.dev/config/

export default defineConfig(() => {
  const HMR_HOST = process.env.VITE_HMR_HOST || process.env.HOST || 'localhost';
  const HMR_PROTOCOL = process.env.VITE_HMR_PROTOCOL || 'ws';
  const ALLOWED = [
    'localhost',
    '127.0.0.1',
    HMR_HOST,
    process.env.VITE_PUBLIC_TUNNEL_HOST || '',
  ].filter(Boolean) as string[];

  return {
    plugins: [react(), svgr()],
    server: {
      port: 5173,
      strictPort: true,
      host: true,
      allowedHosts: ALLOWED,
      hmr: { host: HMR_HOST, protocol: HMR_PROTOCOL as 'ws' | 'wss', clientPort: (HMR_PROTOCOL === 'wss' ? 443 : undefined) as any },
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY || 'http://localhost:3000',
          changeOrigin: true
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 1500
    }
  }
})
