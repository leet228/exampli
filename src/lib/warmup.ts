let started = false;
const warmedMap: Record<string, string> = (window as any).__exampliSvgWarmMap || {};
try { (window as any).__exampliSvgWarmMap = warmedMap; } catch {}
const inflight: Record<string, Promise<void>> = {};
const inflightImg: Record<string, Promise<void>> = {};
const httpPreloaded: Record<string, 1> = {};
const inflightCourseCritical: Record<string, Promise<void>> = {};

type SvgManifest = { svgs?: string[] } | null;
let manifestSvgs: string[] | null = null;
let manifestPromise: Promise<string[]> | null = null;

let onboardingStarted = false;
let afterMainStarted = false;
let courseWarmStartedFor: string | null = null;
let baseUrlsCache: string[] | null = null;
let baseUrlsPromise: Promise<string[]> | null = null;

function requestIdle(cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, timeout = 1200) {
  try {
    const ric = (window as any).requestIdleCallback as ((cb: (d: any) => void, opts?: any) => number) | undefined;
    if (ric) return ric(cb, { timeout });
  } catch {}
  return window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), Math.min(600, Math.max(120, Math.floor(timeout / 3))));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function normalizeCourseCode(code: string): string {
  try {
    return String(code || '').toLowerCase().replace(/^(oge_|ege_)/, '');
  } catch {
    return '';
  }
}

async function loadSvgManifest(): Promise<string[]> {
  if (Array.isArray(manifestSvgs) && manifestSvgs.length) return manifestSvgs;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    // 1) fastest path: static public file
    try {
      const r = await fetch('/svg-manifest.json', { cache: 'force-cache' });
      if (r.ok) {
        const js = (await r.json()) as SvgManifest;
        if (js && Array.isArray(js.svgs)) return js.svgs.filter((u) => typeof u === 'string') as string[];
      }
    } catch {}
    // 2) fallback: serverless endpoint (same payload)
    try {
      const r = await fetch('/api/list_svgs', { cache: 'force-cache' });
      if (r.ok) {
        const js = (await r.json()) as SvgManifest;
        if (js && Array.isArray(js.svgs)) return js.svgs.filter((u) => typeof u === 'string') as string[];
      }
    } catch {}
    return [];
  })().then((list) => {
    manifestSvgs = list || [];
    return manifestSvgs;
  });
  return manifestPromise;
}

function preloadImageToHttpCache(url: string, priority: 'low' | 'high' | 'auto' = 'low'): Promise<void> {
  try {
    if (!url) return Promise.resolve();
    if (httpPreloaded[url]) return Promise.resolve();
    if (inflightImg[url]) return inflightImg[url];
    inflightImg[url] = new Promise<void>((res) => {
      try {
        const img = new Image();
        img.onload = () => res();
        img.onerror = () => res();
        (img as any).decoding = 'async';
        try { (img as any).fetchPriority = priority; } catch {}
        img.src = url;
      } catch {
        res();
      }
    }).then(() => {
      httpPreloaded[url] = 1;
      delete inflightImg[url];
    });
    return inflightImg[url];
  } catch {
    return Promise.resolve();
  }
}

async function runQueue(urls: string[], opts?: { batch?: number; delayMs?: number; priority?: 'low' | 'high' | 'auto' }): Promise<void> {
  const batch = Math.max(1, Math.min(12, opts?.batch ?? 4));
  const delayMs = Math.max(0, opts?.delayMs ?? 90);
  const priority = opts?.priority ?? 'low';
  const uniq = Array.from(new Set((urls || []).filter(Boolean)));
  for (let i = 0; i < uniq.length; i += batch) {
    const slice = uniq.slice(i, i + batch);
    try { await Promise.all(slice.map((u) => preloadImageToHttpCache(u, priority))); } catch {}
    if (delayMs) await sleep(delayMs);
  }
}

async function getBaseSvgsList(): Promise<string[]> {
  if (Array.isArray(baseUrlsCache) && baseUrlsCache.length) return baseUrlsCache;
  if (baseUrlsPromise) return baseUrlsPromise;
  baseUrlsPromise = (async () => {
    const svgs = await loadSvgManifest();
    const byPrefix = (p: string) => svgs.filter((u) => u.startsWith(p));
    const base: string[] = [
      '/kursik2.svg',
      ...byPrefix('/stickers/'),
      ...byPrefix('/subjects/'),
      ...byPrefix('/topics/'),
      ...byPrefix('/profile/'),
      ...byPrefix('/shop/'),
      ...byPrefix('/quests/'),
      ...byPrefix('/battle/'),
    ];
    return Array.from(new Set(base.filter(Boolean)));
  })().then((list) => {
    baseUrlsCache = list || [];
    return baseUrlsCache;
  });
  return baseUrlsPromise;
}

// Awaitable прогрев "всего ДО ai/road_pic": kursik2 + stickers + subjects + topics + profile + shop + quests + battle.
// Если eager=true — догоняем быстрее (без задержек, большим батчем).
// Всегда resolve (даже если часть не загрузилась), чтобы UI не завис.
export function preloadBaseSvgs(opts?: { eager?: boolean }): Promise<void> {
  const eager = opts?.eager === true;
  return (async () => {
    try {
      const base = await getBaseSvgsList();
      // пробуем грузить только то, что ещё не отмечено как загруженное нашим прогревом
      const remaining = base.filter((u) => !httpPreloaded[u]);
      if (!remaining.length) return;
      await runQueue(remaining, eager
        ? { batch: 10, delayMs: 0, priority: 'high' }
        : { batch: 4, delayMs: 80, priority: 'low' }
      );
    } catch {}
  })();
}

// Awaitable прогрев критичных SVG для выбранного курса:
// - /ai/*
// - /road_pic/<course>*
// Всегда resolve (даже при ошибках сети), чтобы не блокировать UI навсегда.
export function preloadCourseCriticalSvgs(courseCode: string): Promise<void> {
  try {
    const norm = normalizeCourseCode(courseCode);
    if (!norm) return Promise.resolve();
    if (inflightCourseCritical[norm]) return inflightCourseCritical[norm];
    inflightCourseCritical[norm] = (async () => {
      try {
        const svgs = await loadSvgManifest();
        const ai = svgs.filter((u) => u.startsWith('/ai/'));
        const road = svgs.filter((u) => u.startsWith(`/road_pic/${norm}`));
        // Важно: сначала ai, потом road_pic выбранного курса
        await runQueue(ai, { batch: 3, delayMs: 40, priority: 'high' });
        await runQueue(road, { batch: 4, delayMs: 60, priority: 'high' });
      } catch {}
    })().finally(() => {
      try { delete inflightCourseCritical[norm]; } catch {}
    });
    return inflightCourseCritical[norm];
  } catch {
    return Promise.resolve();
  }
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

// ---------------------------
// Новое: "list_svg" очереди загрузки из public
// ---------------------------

// 1) Во время онбординга: только базовые папки (без loads/road_pic/ai)
export function warmupOnboardingSvgs(): void {
  if (onboardingStarted) return;
  onboardingStarted = true;
  try {
    // fire-and-forget (мягкий режим)
    void preloadBaseSvgs({ eager: false });
  } catch {}
}

// 2) После выбора курса (ещё до главного экрана): ai + road_pic только выбранного курса
export function warmupCourseCriticalSvgs(courseCode: string): void {
  try {
    const norm = normalizeCourseCode(courseCode);
    if (!norm) return;
    if (courseWarmStartedFor === norm) return;
    courseWarmStartedFor = norm;
    // fire-and-forget
    void preloadCourseCriticalSvgs(norm);
  } catch {}
}

// 3) Уже когда показали главный экран: догружаем всё остальное (включая road_pic остальных курсов; loads греется отдельно warmupLoadSvgs)
export function warmupAfterMainSvgs(activeCourseCode?: string | null): void {
  if (afterMainStarted) return;
  afterMainStarted = true;
  try {
    (async () => {
      const svgs = await loadSvgManifest();
      const norm = activeCourseCode ? normalizeCourseCode(activeCourseCode) : '';
      const excludePrefixes = new Set<string>([
        '/loads/',        // отдельная прогревалка в warmupLoadSvgs()
      ]);
      const isExcluded = (u: string) => {
        for (const p of excludePrefixes) if (u.startsWith(p)) return true;
        return false;
      };
      const remaining = svgs.filter((u) => {
        if (!u) return false;
        if (isExcluded(u)) return false;
        // road_pic выбранного курса уже прогрели на этапе course-critical
        if (norm && u.startsWith(`/road_pic/${norm}`)) return false;
        return true;
      });
      // Очень мягко: в idle, небольшими порциями
      let idx = 0;
      const batch = 4;
      const step = () => {
        if (idx >= remaining.length) return;
        requestIdle(async () => {
          const slice = remaining.slice(idx, idx + batch);
          idx += batch;
          try { await Promise.all(slice.map((u) => preloadImageToHttpCache(u, 'low'))); } catch {}
          window.setTimeout(step, 140);
        }, 1200);
      };
      window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(step)), 350);
    })();
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

