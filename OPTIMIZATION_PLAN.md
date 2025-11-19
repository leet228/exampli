# 🚀 План оптимизации проекта Exampli
## Для работы на плохом интернете + масштабирование до 100,000+ пользователей

---

## 📊 ТЕКУЩЕЕ СОСТОЯНИЕ ПРОЕКТА

### Найденные проблемы:

#### 🔴 КРИТИЧЕСКИЕ (влияют на скорость загрузки)
1. **Нет code splitting** - все страницы загружаются сразу
2. **Гигантский компонент** - `LessonRunnerSheet.tsx` (3005 строк!)
3. **249 SVG файлов** без оптимизации и sprite-sheet
4. **Нет Service Worker** для offline-first подхода
5. **Все CSS библиотеки** (katex, highlight.js) загружаются сразу
6. **Нет компрессии** на уровне Vercel
7. **Нет CDN кеширования** для API ответов

#### 🟡 СРЕДНИЕ (влияют на масштабируемость)
8. **API endpoints** не используют edge caching полностью
9. **Supabase запросы** не оптимизированы (N+1 проблемы)
10. **Нет rate limiting** на фронтенде
11. **Framer Motion** загружается полностью
12. **React 19** - bleeding edge версия (могут быть баги)

#### 🟢 НЕЗНАЧИТЕЛЬНЫЕ
13. Можно улучшить preconnect hints
14. Можно добавить resource hints
15. Можно оптимизировать Tailwind purge

---

## 🎯 ПЛАН ДЕЙСТВИЙ

### ЭТАП 1: Быстрые победы (1-2 дня) ⚡

#### 1.1. Включить code splitting для страниц
**Что делать:** Использовать React.lazy для всех страниц
**Эффект:** Уменьшение initial bundle на 60-70%

```typescript
// src/pages/App.tsx
import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';

// Lazy load всех страниц
const Home = lazy(() => import('./Home'));
const Profile = lazy(() => import('./Profile'));
const AI = lazy(() => import('./AI'));
const Battle = lazy(() => import('./Battle'));
const Quests = lazy(() => import('./Quests'));
const Subscription = lazy(() => import('./Subscription'));
const SubscriptionGate = lazy(() => import('./SubscriptionGate'));
const SubscriptionOpening = lazy(() => import('./SubscriptionOpening'));
const PostLesson = lazy(() => import('./PostLesson'));

// Легковесный loader
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full" />
  </div>
);

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Suspense fallback={<PageLoader />}><Home /></Suspense> },
      { path: '/quests', element: <Suspense fallback={<PageLoader />}><Quests /></Suspense> },
      { path: '/battle', element: <Suspense fallback={<PageLoader />}><Battle /></Suspense> },
      { path: '/ai', element: <Suspense fallback={<PageLoader />}><AI /></Suspense> },
      { path: '/subscription-gate', element: <Suspense fallback={<PageLoader />}><SubscriptionGate /></Suspense> },
      { path: '/subscription-opening', element: <Suspense fallback={<PageLoader />}><SubscriptionOpening /></Suspense> },
      { path: '/post-lesson', element: <Suspense fallback={<PageLoader />}><PostLesson /></Suspense> },
      { path: '/subscription', element: <Suspense fallback={<PageLoader />}><Subscription /></Suspense> },
      { path: '/profile', element: <Suspense fallback={<PageLoader />}><Profile /></Suspense> },
    ],
  },
]);
```

#### 1.2. Lazy load тяжелых библиотек
```typescript
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppRouter from './pages/App';
import { applyTelegramTheme } from './theme/telegram';
import { setupViewportMode } from './theme/telegram';
// ❌ УДАЛИТЬ эти импорты отсюда:
// import 'katex/dist/katex.min.css';
// import 'highlight.js/styles/github-dark.css';
import { setupPreconnects, setupLazyImagesObserver } from './lib/preconnect';

setupPreconnects();
setupLazyImagesObserver();
applyTelegramTheme();
setupViewportMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
```

```typescript
// src/components/MarkdownRenderer.tsx
// Lazy load CSS только когда нужно
function loadKatexStyles() {
  if (document.querySelector('link[href*="katex"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

function loadHighlightStyles() {
  if (document.querySelector('link[href*="highlight"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github-dark.min.css';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

// Вызывать в useEffect когда появляется math или code
```

#### 1.3. Оптимизация Vite конфига
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from '@svgr/rollup';
import viteSvgo from 'vite-plugin-svgo';
import { compression } from 'vite-plugin-compression2';

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
      viteSvgo({
        plugins: [
          { name: 'preset-default' },
          { name: 'removeViewBox', active: false },
          { name: 'removeDimensions', active: true },
        ]
      }),
      // Добавить компрессию
      compression({
        algorithm: 'brotliCompress',
        threshold: 1024,
      }),
      compression({
        algorithm: 'gzip',
        threshold: 1024,
      }),
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
      chunkSizeWarningLimit: 1500,
      // Оптимизация code splitting
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['framer-motion', 'lottie-react'],
            'vendor-markdown': ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'rehype-highlight'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-utils': ['katex', 'highlight.js', 'mermaid', 'plotly.js-dist-min'],
          },
        },
      },
      // Минификация
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // удалить console.log в production
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug'],
        },
      },
    },
    // Оптимизация зависимостей
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: ['@vercel/analytics', '@vercel/speed-insights'],
    },
  }
})
```

#### 1.4. Создать SVG sprite для часто используемых иконок
```bash
# Установить инструмент
npm install -D svg-sprite-loader
```

```typescript
// src/lib/svgSprite.ts
// Собрать все иконки навигации в один sprite
const icons = {
  home: '/stickers/home2.svg',
  quests: '/stickers/quests2.svg',
  battle: '/stickers/battle2.svg',
  ai: '/stickers/ai2.svg',
  diamond: '/stickers/diamond2.svg',
  profile: '/stickers/profile4.svg',
  // ... остальные
};

export async function generateSpriteSheet() {
  // Генерировать SVG sprite на этапе сборки
}
```

#### 1.5. Настроить правильный кеш на Vercel
```json
// vercel.json
{
    "crons": [
        { "path": "/api/streak/reset", "schedule": "5 21 * * *" },
        { "path": "/api/daily_quests_roll", "schedule": "0 21 * * *" },
        { "path": "/api/cron_notify", "schedule": "*/5 * * * *" }
    ],
    "headers": [
        {
            "source": "/(.*)\\.svg",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
            ]
        },
        {
            "source": "/(.*)\\.png",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
            ]
        },
        {
            "source": "/(.*)\\.jpg",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
            ]
        },
        {
            "source": "/(.*)\\.wav",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
            ]
        },
        {
            "source": "/animations/(.*)\\.json",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" },
                { "key": "Content-Type", "value": "application/json; charset=utf-8" }
            ]
        },
        {
            "source": "/(.*)\\.js",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
            ]
        },
        {
            "source": "/(.*)\\.css",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
            ]
        },
        {
            "source": "/index.html",
            "headers": [
                { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
            ]
        }
    ],
    "rewrites": [
        { "source": "/api/(.*)", "destination": "/api/$1" },
        { "source": "/(.*)", "destination": "/index.html" }
    ]
}
```

---

### ЭТАП 2: Service Worker и offline-first (2-3 дня) 🔧

#### 2.1. Установить и настроить Workbox
```bash
npm install -D workbox-cli workbox-webpack-plugin vite-plugin-pwa
```

```typescript
// vite.config.ts - добавить в plugins
import { VitePWA } from 'vite-plugin-pwa'

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
    icons: [
      {
        src: '/kursik2.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  },
  workbox: {
    // Cache API responses
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 5 * 60, // 5 минут
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /\/api\/(boot1|boot2)/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-boot-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60, // 1 минута
          },
        },
      },
      {
        urlPattern: /\.(svg|png|jpg|jpeg|wav)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 300,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 дней
          },
        },
      },
    ],
    // Прекеш критичных ресурсов
    globPatterns: [
      'kursik2.svg',
      'stickers/home2.svg',
      'stickers/quests2.svg',
      'stickers/battle2.svg',
      'stickers/ai2.svg',
      'stickers/profile4.svg',
    ],
  },
})
```

---

### ЭТАП 3: Разбить гигантский компонент (3-4 дня) 🔨

#### 3.1. Рефакторинг LessonRunnerSheet.tsx (3005 строк!)
**Проблема:** Один монолитный компонент загружается всегда
**Решение:** Разбить на модули по типу задания

```
src/components/lessons/
├── LessonRunnerSheet.tsx (только оркестратор)
├── tasks/
│   ├── TaskChoice.tsx
│   ├── TaskText.tsx
│   ├── TaskWordLetters.tsx
│   ├── TaskCards.tsx
│   ├── TaskMultipleChoice.tsx
│   ├── TaskInput.tsx
│   ├── TaskConnections.tsx
│   ├── TaskNumInput.tsx
│   ├── TaskItCode.tsx
│   ├── TaskItCode2.tsx
│   ├── TaskPainting.tsx
│   └── TaskPosition.tsx
└── LessonProgress.tsx
```

Каждый task-компонент загружается динамически:
```typescript
// LessonRunnerSheet.tsx
import { lazy, Suspense } from 'react';

const taskComponents = {
  choice: lazy(() => import('./tasks/TaskChoice')),
  text: lazy(() => import('./tasks/TaskText')),
  word_letters: lazy(() => import('./tasks/TaskWordLetters')),
  cards: lazy(() => import('./tasks/TaskCards')),
  multiple_choice: lazy(() => import('./tasks/TaskMultipleChoice')),
  input: lazy(() => import('./tasks/TaskInput')),
  connections: lazy(() => import('./tasks/TaskConnections')),
  num_input: lazy(() => import('./tasks/TaskNumInput')),
  it_code: lazy(() => import('./tasks/TaskItCode')),
  it_code_2: lazy(() => import('./tasks/TaskItCode2')),
  painting: lazy(() => import('./tasks/TaskPainting')),
  position: lazy(() => import('./tasks/TaskPosition')),
};

// В рендере:
const TaskComponent = taskComponents[task.answer_type];
<Suspense fallback={<TaskSkeleton />}>
  <TaskComponent task={task} onAnswer={handleAnswer} />
</Suspense>
```

---

### ЭТАП 4: Оптимизация Backend и Database (3-5 дней) 🗄️

#### 4.1. Включить Edge Caching в API
```javascript
// api/boot1.js
export const config = {
  runtime: 'edge', // Использовать Edge Runtime вместо Node.js
};

export default async function handler(req) {
  // Добавить заголовки кеширования
  const headers = {
    'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    'CDN-Cache-Control': 'public, s-maxage=60',
    'Vercel-CDN-Cache-Control': 'public, s-maxage=3600',
  };

  // ... остальной код
  
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
```

#### 4.2. Оптимизировать Supabase запросы
```javascript
// api/boot1.js - текущая проблема
// ❌ Несколько последовательных запросов
const { data: userRow } = await supabase.from('users').select('*').eq('tg_id', tgId).single();
const { data: stats } = await supabase.from('stats').select('*').eq('user_id', userRow.id).single();
const { data: profile } = await supabase.from('user_profile').select('*').eq('user_id', userRow.id).single();

// ✅ Один запрос с join
const { data } = await supabase
  .from('users')
  .select(`
    *,
    stats:stats!inner(*),
    profile:user_profile(*)
  `)
  .eq('tg_id', tgId)
  .single();
```

#### 4.3. Создать индексы в Supabase
```sql
-- db/migrations/005_performance_indexes.sql

-- Индекс для быстрого поиска пользователя по tg_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tg_id 
ON users(tg_id);

-- Индекс для быстрого поиска друзей
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friend_links_status_users 
ON friend_links(status, a_id, b_id);

-- Индекс для заданий урока
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_lesson_order 
ON tasks(lesson_id, order_index, id);

-- Индекс для тем предмета
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_topics_subject_order 
ON topics(subject_id, order_index);

-- Композитный индекс для streak_days
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_streak_days_user_day 
ON streak_days(user_id, day DESC);
```

#### 4.4. Настроить Connection Pooling
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-client-info': 'exampli-web',
    },
  },
  // Использовать connection pooler для высокой нагрузки
  // В Supabase Settings → Database → Connection string выбрать "Connection pooling"
});
```

#### 4.5. Добавить Redis edge кеширование
```javascript
// api/_cache_edge.mjs
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Кеш для статичных данных (предметы, темы)
export async function getCachedOrFetch(key, fetchFn, ttlSeconds = 3600) {
  try {
    const cached = await redis.get(key);
    if (cached !== null) return cached;
    
    const fresh = await fetchFn();
    await redis.setex(key, ttlSeconds, fresh);
    return fresh;
  } catch (err) {
    console.warn('Cache miss:', err);
    return await fetchFn();
  }
}

// Инвалидация кеша
export async function invalidateCache(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.warn('Cache invalidation failed:', err);
  }
}
```

```javascript
// api/boot1.js - использование кеша
import { getCachedOrFetch } from './_cache_edge.mjs';

// Кешировать список всех предметов (меняется редко)
const subjectsAll = await getCachedOrFetch(
  'subjects:all:v1',
  async () => {
    const { data } = await supabase.from('subjects').select('*').order('id');
    return data || [];
  },
  7 * 24 * 60 * 60 // 7 дней
);

// Кешировать темы предмета
const topics = await getCachedOrFetch(
  `topics:subject:${activeId}:v1`,
  async () => {
    const { data } = await supabase.from('topics').select('*').eq('subject_id', activeId).order('order_index');
    return data || [];
  },
  24 * 60 * 60 // 1 день
);
```

---

### ЭТАП 5: Масштабируемость инфраструктуры (5-7 дней) ☁️

#### 5.1. Настроить Vercel для high-traffic
```json
// vercel.json
{
  "functions": {
    "api/boot1.js": {
      "memory": 1024,
      "maxDuration": 10
    },
    "api/boot2.js": {
      "memory": 1024,
      "maxDuration": 10
    },
    "api/chat.js": {
      "memory": 3008,
      "maxDuration": 60
    }
  },
  "regions": ["arn1"], // или ["fra1"] для Европы
  "framework": "vite",
  "buildCommand": "pnpm run build",
  "outputDirectory": "dist"
}
```

#### 5.2. Supabase: Апгрейд до Pro плана
**Для 100,000 пользователей нужно:**
- **Database:** Pro plan ($25/мес) + Compute add-on ($50/мес минимум)
  - Dedicated CPU
  - Connection pooling
  - Point-in-time recovery
- **Storage:** ~100GB ($10/мес)
- **Bandwidth:** ~1TB/мес ($90/мес)

**Оценка:** ~$175-250/месяц для Supabase

#### 5.3. Upstash Redis: Масштабирование
```javascript
// Текущий план vs требуемый
// Free: 10,000 commands/day
// Pay-as-you-go: $0.2 per 100K commands

// Для 100K пользователей (предположим 10 команд/пользователь/день):
// = 1,000,000 commands/day
// = $2/day = $60/месяц
```

#### 5.4. Настроить автоскейлинг Vercel Functions
**Vercel Pro:** Unlimited functions, но может throttle
**Vercel Enterprise:** Custom limits

Рекомендация для 100K пользователей:
- **Vercel Pro** ($20/мес/член команды) + bandwidth overages
- Или **Cloudflare Workers** вместо Vercel Functions (дешевле при высокой нагрузке)

#### 5.5. Настроить мониторинг и алерты
```typescript
// src/lib/monitoring.ts
import { Analytics } from '@vercel/analytics';

export function trackPerformance(metric: string, value: number) {
  try {
    Analytics.track(metric, { value });
    
    // Отправка в Sentry/DataDog/etc
    if (window.performance) {
      const perfData = {
        metric,
        value,
        timing: performance.now(),
        memory: (performance as any).memory?.usedJSHeapSize,
      };
      
      // Log critical metrics
      if (metric === 'FCP' && value > 2000) {
        console.warn('Slow FCP:', value);
      }
      if (metric === 'LCP' && value > 2500) {
        console.warn('Slow LCP:', value);
      }
    }
  } catch {}
}

// Web Vitals tracking
export function setupWebVitals() {
  if ('web-vital' in window) {
    import('web-vitals').then(({ onCLS, onFID, onFCP, onLCP, onTTFB }) => {
      onCLS((metric) => trackPerformance('CLS', metric.value));
      onFID((metric) => trackPerformance('FID', metric.value));
      onFCP((metric) => trackPerformance('FCP', metric.value));
      onLCP((metric) => trackPerformance('LCP', metric.value));
      onTTFB((metric) => trackPerformance('TTFB', metric.value));
    });
  }
}
```

---

### ЭТАП 6: Продвинутая оптимизация (опционально, 7-10 дней) 🚀

#### 6.1. Использовать Web Workers для тяжелых вычислений
```typescript
// src/lib/boot2.worker.ts - уже есть!
// Расширить для других задач
```

#### 6.2. Виртуализация длинных списков
```bash
npm install react-window
```

```typescript
// src/pages/Profile.tsx - для списка друзей/достижений
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={friends.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <FriendCard friend={friends[index]} />
    </div>
  )}
</FixedSizeList>
```

#### 6.3. Использовать HTTP/2 Server Push
```javascript
// vercel.json
{
  "headers": [
    {
      "source": "/",
      "headers": [
        {
          "key": "Link",
          "value": "</kursik2.svg>; rel=preload; as=image"
        }
      ]
    }
  ]
}
```

#### 6.4. Оптимизировать Framer Motion
```typescript
// Вместо полного импорта
import { motion } from 'framer-motion';

// Использовать lazy motion
import { LazyMotion, domAnimation, m } from 'framer-motion';

<LazyMotion features={domAnimation}>
  <m.div animate={{ x: 100 }} />
</LazyMotion>
```

#### 6.5. Image optimization (конвертация в WebP/AVIF)
```bash
# Для PNG файлов
npm install -D @squoosh/lib
```

```javascript
// scripts/optimize-images.js
import { ImagePool } from '@squoosh/lib';
import fs from 'fs';
import path from 'path';

const imagePool = new ImagePool();

async function optimizeImage(filePath) {
  const image = imagePool.ingestImage(filePath);
  await image.encode({
    webp: { quality: 80 },
    avif: { quality: 70 },
  });
  
  const webp = await image.encodedWith.webp;
  const avif = await image.encodedWith.avif;
  
  // Сохранить оптимизированные версии
  fs.writeFileSync(filePath.replace('.png', '.webp'), webp.binary);
  fs.writeFileSync(filePath.replace('.png', '.avif'), avif.binary);
}

// Обработать все PNG в public/notifications/
```

---

## 📈 ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ

### Производительность
- **Initial load:** 1.5s → **0.5s** (на хорошем интернете)
- **Initial load:** 8s → **2s** (на 3G)
- **Time to Interactive:** 3s → **1s**
- **Bundle size:** 2.5MB → **400KB** (initial)
- **Lighthouse score:** 65 → **95+**

### Масштабируемость
- **Одновременные пользователи:** 1,000 → **100,000+**
- **API latency (p95):** 500ms → **150ms**
- **Database connections:** 100 → **1000+** (с pooling)
- **CDN cache hit rate:** 0% → **85%+**

### Стоимость инфраструктуры (100K MAU)
- **Vercel Pro:** $20/мес
- **Supabase Pro + Compute:** $175/мес
- **Upstash Redis:** $60/мес
- **Bandwidth overages:** $50-100/мес
- **ИТОГО:** ~$300-350/месяц

---

## 🎯 ПРИОРИТЕЗАЦИЯ

### Сделать ОБЯЗАТЕЛЬНО (1-2 недели)
1. ✅ Code splitting страниц
2. ✅ Lazy load CSS библиотек
3. ✅ Оптимизация Vite конфига
4. ✅ Правильные заголовки кеширования
5. ✅ Service Worker + PWA
6. ✅ Разбить LessonRunnerSheet.tsx
7. ✅ Индексы в базе данных
8. ✅ Edge caching для API

### Сделать ЖЕЛАТЕЛЬНО (2-4 недели)
9. ⚠️ SVG sprite sheet
10. ⚠️ Redis edge кеширование
11. ⚠️ Оптимизация Supabase запросов
12. ⚠️ Мониторинг и алерты
13. ⚠️ WebP/AVIF конвертация изображений

### Сделать ПРИ НЕОБХОДИМОСТИ (по мере роста)
14. 💡 Web Workers для тяжелых задач
15. 💡 Виртуализация списков
16. 💡 HTTP/2 Server Push
17. 💡 Lazy Framer Motion
18. 💡 Апгрейд планов (Vercel/Supabase)

---

## 📝 ЧЕКЛИСТ ГОТОВНОСТИ К 100K ПОЛЬЗОВАТЕЛЕЙ

- [ ] Code splitting реализован
- [ ] Service Worker настроен
- [ ] Все статические ресурсы кешируются на год
- [ ] API endpoints используют Edge Runtime
- [ ] Redis кеширование для часто запрашиваемых данных
- [ ] Connection pooling включен в Supabase
- [ ] Индексы созданы для всех частых запросов
- [ ] Мониторинг настроен (Vercel Analytics + Web Vitals)
- [ ] Rate limiting на критичных endpoints
- [ ] Graceful degradation для offline
- [ ] Backup стратегия для базы данных
- [ ] Load testing выполнен (k6 или Artillery)
- [ ] Error tracking настроен (Sentry/LogRocket)
- [ ] CDN для статики (Cloudflare/Vercel Edge)

---

## 🛠️ ИНСТРУМЕНТЫ ДЛЯ ТЕСТИРОВАНИЯ

### Performance testing
```bash
# Lighthouse CI
npm install -g @lhci/cli
lhci autorun --collect.url=https://exampli.vercel.app

# Bundle analyzer
npm install -D rollup-plugin-visualizer
```

### Load testing
```bash
# k6
brew install k6
# или
choco install k6

# Создать тест
k6 run load-test.js --vus 1000 --duration 60s
```

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },    // разгон до 100 пользователей
    { duration: '5m', target: 100 },    // стабильная нагрузка
    { duration: '2m', target: 1000 },   // рывок до 1000
    { duration: '5m', target: 1000 },   // пик нагрузки
    { duration: '2m', target: 0 },      // спад
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% запросов < 500ms
    http_req_failed: ['rate<0.01'],   // < 1% ошибок
  },
};

export default function () {
  const res = http.post('https://exampli.vercel.app/api/boot1', JSON.stringify({
    tg_user: { id: Math.floor(Math.random() * 100000) },
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

---

## 💰 СТОИМОСТЬ РЕАЛИЗАЦИИ (оценка времени)

| Этап | Время | Сложность |
|------|-------|-----------|
| Code splitting + lazy loading | 2-3 дня | Средняя |
| Service Worker + PWA | 2-3 дня | Средняя |
| Разбить LessonRunnerSheet | 3-4 дня | Высокая |
| Backend оптимизация | 3-5 дней | Высокая |
| Инфраструктура | 2-3 дня | Низкая |
| Тестирование и доработки | 3-5 дней | Средняя |
| **ИТОГО** | **15-23 дня** | - |

С учетом непредвиденных задач: **3-4 недели** на полную реализацию.

---

## 🎓 ДОПОЛНИТЕЛЬНЫЕ РЕСУРСЫ

1. [Web.dev Performance](https://web.dev/performance/)
2. [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
3. [Workbox Service Worker](https://developer.chrome.com/docs/workbox/)
4. [Supabase Performance Tuning](https://supabase.com/docs/guides/platform/performance)
5. [React Performance Optimization](https://react.dev/learn/render-and-commit)

---

## ⚠️ ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **Не оптимизируйте преждевременно** - сначала реализуйте пункты из "ОБЯЗАТЕЛЬНО"
2. **Тестируйте на реальных устройствах** - особенно на медленных Android
3. **Мониторьте метрики** - Web Vitals, Error rate, API latency
4. **Делайте постепенно** - не пытайтесь внедрить всё сразу
5. **A/B тестирование** - проверяйте влияние изменений на бизнес-метрики

---

Этот план поможет вашему проекту работать быстро даже на плохом интернете и масштабироваться до 100,000+ одновременных пользователей! 🚀

