let started = false;
const warmedMap: Record<string, string> = (window as any).__exampliSvgWarmMap || {};
try { (window as any).__exampliSvgWarmMap = warmedMap; } catch {}

function requestIdle(cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, timeout = 1200) {
  try {
    const ric = (window as any).requestIdleCallback as ((cb: (d: any) => void, opts?: any) => number) | undefined;
    if (ric) return ric(cb, { timeout });
  } catch {}
  return window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), Math.min(600, Math.max(120, Math.floor(timeout / 3))));
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      // Попробуем через <link rel="preload">, если поддерживается
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
      // Дополнительно создадим объект Image для заполнения кэша точно
      const img = new Image();
      (img as any).decoding = 'async';
      (img as any).loading = 'eager';
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    } catch { resolve(); }
  });
}

async function preloadSvgToMemory(url: string): Promise<void> {
  try {
    if (warmedMap[url]) return; // уже есть
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return;
    const text = await res.text();
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(text)}`;
    warmedMap[url] = dataUrl;
  } catch {}
}

export function getWarmedSvg(url: string): string | null {
  try { return warmedMap[url] || null; } catch { return null; }
}

export function warmupLoadSvgs(): void {
  if (started) return; started = true;
  try {
    const urls: string[] = [
      '/loads/biology_load.svg',
      '/loads/chemistry_load.svg',
      '/loads/english_load.svg',
      '/loads/french_load.svg',
      '/loads/geography_load.svg',
      '/loads/german_load.svg',
      '/loads/history_load.svg',
      '/loads/it_load.svg',
      '/loads/literature_load.svg',
      '/loads/math_basic_load.svg',
      '/loads/math_profile_load.svg',
      '/loads/physics_load.svg',
      '/loads/rus_load.svg',
      '/loads/social_science_load.svg',
      '/loads/spanish_load.svg',
    ];

    let index = 0;
    const batchSize = 2; // очень щадяще: по 2 иконки на idle-срез

    const step = () => {
      if (index >= urls.length) return;
      requestIdle(async () => {
        const end = Math.min(urls.length, index + batchSize);
        const slice = urls.slice(index, end);
        index = end;
        try { await Promise.all(slice.map((u) => Promise.all([preloadImage(u), preloadSvgToMemory(u)]))); } catch {}
        // планируем следующий батч с лёгкой паузой
        window.setTimeout(step, 180);
      });
    };

    // старт немного позже, когда главная отрендерилась
    window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(step));
    }, 400);
  } catch {}
}

