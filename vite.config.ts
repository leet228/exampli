import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from '@svgr/rollup';
// @ts-ignore - types provided at build or shimmed
import viteSvgo from 'vite-plugin-svgo';
// @ts-ignore
import { compression } from 'vite-plugin-compression2';
// @ts-ignore
import { VitePWA } from 'vite-plugin-pwa';

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

  const plugins: any[] = [
    react(),
    svgr(),
    viteSvgo({
      plugins: [
        { name: 'preset-default' },
        { name: 'removeViewBox', active: false },
        { name: 'removeDimensions', active: true },
      ]
    }),
  ];

  // Compression для Brotli и Gzip
  // На Vercel CDN уже сжимает ответы; предсжатие заметно замедляет сборку.
  // Включайте только при необходимости: PRECOMPRESS=1
  if (process.env.PRECOMPRESS === '1') {
    plugins.push(
      compression({ algorithms: ['brotliCompress'], threshold: 1024 }),
      compression({ algorithms: ['gzip'], threshold: 1024 })
    );
  }

  // PWA с Service Worker для offline-first
  if (process.env.ENABLE_PWA !== '0') {
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['**/*.svg', '**/*.png', '**/*.wav'],
        manifest: {
          name: 'Exampli',
          short_name: 'Exampli',
          description: 'Учи предметы эффективно',
          theme_color: '#0b1220',
          background_color: '#0b1220',
          display: 'standalone',
        },
        workbox: {
          // Исключаем тяжёлый чанк plotly из precache, чтобы не валить сборку Workbox (2 MiB лимит)
          globIgnores: ['**/react-plotly-*.js'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
              },
            },
            // Кэшируем крупный vendor‑чанк plotly по запросу в рантайме
            {
              urlPattern: /\/react-plotly-.*\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'big-vendor',
                expiration: { maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
            {
              urlPattern: /\.(svg|png|jpg|jpeg|wav)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              },
            },
          ],
        },
      })
    );
  }

  return {
    plugins,
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
      chunkSizeWarningLimit: 6000,
      // Оптимизация code splitting
      rollupOptions: {
        output: {
          manualChunks: {
            // Разделяем vendor-библиотеки на группы
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['framer-motion', 'lottie-react'],
            'vendor-markdown': [
              'react-markdown',
              'remark-gfm',
              'remark-math',
              'rehype-katex',
              'rehype-highlight'
            ],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-analytics': ['@vercel/analytics', '@vercel/speed-insights'],
          },
        },
      },
      // Минификация: используем быстрый esbuild по умолчанию (значительно ускоряет билд)
      // Дополнительная очистка логов сделана через esbuild-плагины не требуется
      // Source maps для debugging (можно отключить в production)
      sourcemap: process.env.NODE_ENV !== 'production',
    },
    // Оптимизация зависимостей
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: ['@vercel/analytics', '@vercel/speed-insights'],
    },
  }
})
