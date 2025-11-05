import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from '@svgr/rollup';
// @ts-ignore - types provided at build or shimmed
import { VitePWA } from 'vite-plugin-pwa';
// @ts-ignore - types provided at build or shimmed
import viteSvgo from 'vite-plugin-svgo';

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
    plugins: [
      react(),
      svgr(),
      viteSvgo(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,avif}'],
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              urlPattern: new RegExp('https://[^/]+\\.supabase\\.co/storage/'),
              handler: 'CacheFirst',
              options: { cacheName: 'supabase-storage', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 } }
            },
            {
              urlPattern: /\.svg$/,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'static-svgs', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } }
            },
            {
              urlPattern: /\.(png|jpg|jpeg|webp|avif)$/,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } }
            }
          ]
        },
        manifest: {
          name: 'КУРСИК',
          short_name: 'КУРСИК',
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#0049b7',
          icons: []
        }
      })
    ],
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
