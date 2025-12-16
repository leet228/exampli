let started = false;
const warmedMap: Record<string, string> = (window as any).__exampliSvgWarmMap || {};
try { (window as any).__exampliSvgWarmMap = warmedMap; } catch {}
const inflight: Record<string, Promise<void>> = {};
const inflightImg: Record<string, Promise<void>> = {};
// отмечаем ТОЛЬКО успешные загрузки (onload). Если был onerror — не отмечаем, чтобы можно было ретраить.
const httpPreloaded: Record<string, 1> = {};
const inflightCourseCritical: Record<string, Promise<void>> = {};
const inflightAllSvgs: { started: boolean; p: Promise<void> | null } = { started: false, p: null };

type SvgManifest = { svgs?: string[] } | null;
let manifestSvgs: string[] | null = null;
let manifestPromise: Promise<string[]> | null = null;

let onboardingStarted = false;
let afterMainStarted = false;
let courseWarmStartedFor: string | null = null;
let baseUrlsCache: string[] | null = null;
let baseUrlsPromise: Promise<string[]> | null = null;

function getStartParam(): string {
  try { return String((window as any)?.Telegram?.WebApp?.initDataUnsafe?.start_param || '').trim().toLowerCase(); } catch { return ''; }
}

function getQueryParam(name: string): string {
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get(name) || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function isColdMode(): boolean {
  // Telegram deep-link: t.me/<bot>?startapp=cold
  const sp = getStartParam();
  if (sp === 'cold' || sp === 'coldstart' || sp === 'cold_start') return true;
  // Browser/dev: ?cold=1
  const qp = getQueryParam('cold');
  if (qp === '1' || qp === 'true' || qp === 'yes') return true;
  return false;
}

const COLD_SESSION = (() => {
  if (!isColdMode()) return '';
  try {
    const ssKey = 'exampli:cold_session';
    const prev = window?.sessionStorage?.getItem(ssKey);
    if (prev) return prev;
    const v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try { window?.sessionStorage?.setItem(ssKey, v); } catch {}
    return v;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
})();

export function isColdAssetsMode(): boolean {
  return Boolean(COLD_SESSION);
}

export function assetUrl(url: string): string {
  try {
    if (!COLD_SESSION) return url;
    if (!url) return url;
    // Don't touch data URLs / blobs
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}cold=${encodeURIComponent(COLD_SESSION)}`;
  } catch {
    return url;
  }
}

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
      const r = await fetch(assetUrl('/svg-manifest.json'), { cache: (COLD_SESSION ? 'no-store' : 'force-cache') as RequestCache });
      if (r.ok) {
        const js = (await r.json()) as SvgManifest;
        if (js && Array.isArray(js.svgs)) return js.svgs.filter((u) => typeof u === 'string') as string[];
      }
    } catch {}
    // 2) fallback: serverless endpoint (same payload)
    try {
      const r = await fetch(assetUrl('/api/list_svgs'), { cache: (COLD_SESSION ? 'no-store' : 'force-cache') as RequestCache });
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
    // Ключ прогрева — исходный URL (без cold-параметров), чтобы "готово?" работало стабильно
    // и повторные вызовы не перекачивали одно и то же.
    const u = assetUrl(url);
    if (httpPreloaded[url] || httpPreloaded[u]) return Promise.resolve();
    if (inflightImg[u]) return inflightImg[u];
    let ok = false;
    inflightImg[u] = new Promise<void>((res) => {
      try {
        const img = new Image();
        img.onload = () => { ok = true; res(); };
        img.onerror = () => { ok = false; res(); };
        (img as any).decoding = 'async';
        try { (img as any).fetchPriority = priority; } catch {}
        img.src = u;
      } catch {
        res();
      }
    }).then(() => {
      if (ok) {
        httpPreloaded[url] = 1;
        httpPreloaded[u] = 1;
      }
      delete inflightImg[u];
    });
    return inflightImg[u];
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
        // во время онбординга/сплэша — максимально мягко и последовательно
        : { batch: 1, delayMs: 70, priority: 'low' }
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
        // Важно: для первого захода важнее "дорога" выбранного курса, AI можно догреть сразу следом.
        await runQueue(road, { batch: 4, delayMs: 55, priority: 'high' });
        await runQueue(ai, { batch: 3, delayMs: 35, priority: 'high' });
      } catch {}
    })().finally(() => {
      try { delete inflightCourseCritical[norm]; } catch {}
    });
    return inflightCourseCritical[norm];
  } catch {
    return Promise.resolve();
  }
}

// "На всякий случай": прогреть ВСЕ SVG из manifest (в фоне, без ожидания).
// Повторные вызовы не создают дубли, а ретраят то, что падало ранее (см. httpPreloaded).
export function warmupAllSvgs(): void {
  try { void preloadAllSvgs(); } catch {}
}

export function preloadAllSvgs(): Promise<void> {
  try {
    if (inflightAllSvgs.p) return inflightAllSvgs.p;
    inflightAllSvgs.started = true;
    inflightAllSvgs.p = (async () => {
      try {
        const svgs = await loadSvgManifest();
        const remaining = (svgs || []).filter((u) => u && !httpPreloaded[u]);
        if (!remaining.length) return;
        // Под сплэшем можно чуть агрессивнее, но всё равно батчами
        await runQueue(remaining, { batch: 10, delayMs: 30, priority: 'high' });
      } catch {}
    })().finally(() => {
      // даём возможность запускать повторно позже (например, после смены курса/переоткрытия)
      inflightAllSvgs.p = null;
    });
    return inflightAllSvgs.p;
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
      const remainingRaw = svgs.filter((u) => {
        if (!u) return false;
        if (isExcluded(u)) return false;
        // road_pic выбранного курса уже прогрели на этапе course-critical
        if (norm && u.startsWith(`/road_pic/${norm}`)) return false;
        return true;
      });
      // Приоритет догрузки после main: сначала road_pic остальных курсов, потом всё остальное.
      const roadsOther = remainingRaw.filter((u) => u.startsWith('/road_pic/'));
      const remaining = [...roadsOther, ...remainingRaw.filter((u) => !u.startsWith('/road_pic/'))];
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

