let started = false;
const warmedMap: Record<string, string> = (window as any).__exampliSvgWarmMap || {};
try { (window as any).__exampliSvgWarmMap = warmedMap; } catch {}
const inflight: Record<string, Promise<void>> = {};

function requestIdle(cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, timeout = 1200) {
  try {
    const ric = (window as any).requestIdleCallback as ((cb: (d: any) => void, opts?: any) => number) | undefined;
    if (ric) return ric(cb, { timeout });
  } catch {}
  return window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), Math.min(600, Math.max(120, Math.floor(timeout / 3))));
}

async function preloadSvgToMemory(url: string): Promise<void> {
  try {
    if (warmedMap[url]) return; // уже есть
    if (inflight[url]) { await inflight[url]; return; }
    inflight[url] = (async () => {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return;
      const text = await res.text();
      const min = minifySvg(text);
      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(min)}`;
      warmedMap[url] = dataUrl;
    })();
    await inflight[url];
    delete inflight[url];
  } catch {}
}

export function getWarmedSvg(url: string): string | null {
  try { return warmedMap[url] || null; } catch { return null; }
}

export function warmupLoadSvgs(): void {
  if (started) return; started = true;
  try {
    const urls: string[] = [
      '/loads/biology_load1.svg',
      '/loads/chemistry_load1.svg',
      '/loads/english_load1.svg',
      '/loads/french_load1.svg',
      '/loads/geography_load1.svg',
      '/loads/german_load1.svg',
      '/loads/history_load1.svg',
      '/loads/it_load1.svg',
      '/loads/literature_load1.svg',
      '/loads/math_basic_load1.svg',
      '/loads/math_profile_load1.svg',
      '/loads/physics_load1.svg',
      '/loads/rus_load1.svg',
      '/loads/social_science_load1.svg',
      '/loads/spanish_load1.svg',
    ];

    let index = 0;
    const batchSize = 2; // очень щадяще: по 2 иконки на idle-срез

    const step = () => {
      if (index >= urls.length) return;
      requestIdle(async () => {
        const end = Math.min(urls.length, index + batchSize);
        const slice = urls.slice(index, end);
        index = end;
        try { await Promise.all(slice.map((u) => preloadSvgToMemory(u))); } catch {}
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

// Очень лёгкий и безопасный минификатор SVG (безопасный набор правил)
function minifySvg(svg: string): string {
  try {
    let s = svg;
    // убрать XML-декларацию и комментарии
    s = s.replace(/<\?xml[\s\S]*?\?>/g, '');
    s = s.replace(/<!--([\s\S]*?)-->/g, '');
    // убрать metadata/desc/title (часто лишние для иконок)
    s = s.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
    s = s.replace(/<desc[\s\S]*?<\/desc>/gi, '');
    s = s.replace(/<title[\s\S]*?<\/title>/gi, '');
    // схлопнуть пробелы и переносы
    s = s.replace(/\s{2,}/g, ' ');
    s = s.replace(/>\s+</g, '><');
    // убрать лишние пробелы вокруг = в атрибутах
    s = s.replace(/\s*=\s*"/g, '="');
    // финальный trim
    s = s.trim();
    return s;
  } catch { return svg; }
}

