// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';
import TopSheet from './sheets/TopSheet';
import AddCourseSheet from './panels/AddCourseSheet';
import AddCourseBlocking from './panels/AddCourseBlocking';
import { setUserSubjects, syncEnergy } from '../lib/userState';
import { getActiveCourse, subscribeActiveCourse, setActiveCourse as storeSetActiveCourse } from '../lib/courseStore';
import CoursesPanel from './sheets/CourseSheet';
// CoinSheet более не используется; переход на страницу подписки
import { StreakSheetContent } from './sheets/StreakSheet';

type Subject = { id: number; code: string; title: string; level: string };

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [courseTitle, setCourseTitle] = useState('Курс');
  const [courseCode, setCourseCode] = useState<string | null>(null);
  const [iconOk, setIconOk] = useState<boolean>(true);
  const [streak, setStreak] = useState(0);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [energy, setEnergy] = useState(25);

  // коины (счётчик); при клике — переход на подписку с подсветкой
  const [coins, setCoins] = useState(0);

  // какая верхняя шторка открыта
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);

  // нижняя шторка «Добавить курс»
  const [addOpen, setAddOpen] = useState(false);

  const loadUserSnapshot = useCallback(async () => {
    const ACTIVE_KEY = 'exampli:activeSubjectCode';
    // быстрый путь: попробуем взять статы из кэша (boot положил их туда)
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      if (cs) {
        setStreak(cs.streak ?? 0);
        setEnergy(cs.energy ?? 25);
        setCoins(cs.coins ?? 0);
      }
    } catch {}
    // быстрый путь: достанем last_active_at и timezone из boot user-кэша
    try {
      const cu = cacheGet<any>(CACHE_KEYS.user) || (window as any)?.__exampliBoot?.user || null;
      if (cu) {
        if (cu.last_active_at != null) setLastActiveAt(String(cu.last_active_at));
        if (cu.timezone != null) setTimezone(String(cu.timezone));
      }
    } catch {}
    const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!tgId) {
      // офф-телеграм режим: попробуем взять код из localStorage
      try {
        const stored = localStorage.getItem(ACTIVE_KEY) || cacheGet<string>(CACHE_KEYS.activeCourseCode) || '';
        if (stored) {
          setCourseCode(stored);
          setIconOk(true);
          const { data: subj } = await supabase
            .from('subjects')
            .select('title')
            .eq('code', stored)
            .single();
          const t = subj?.title as string | undefined;
          if (t) setCourseTitle(t);
        }
      } catch {}
      return;
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, streak, energy, coins, last_active_at, timezone')
      .eq('tg_id', String(tgId))
      .single();

    if (user) {
      setStreak(user.streak ?? 0);
      setEnergy((user.energy ?? 25) as number);
      setCoins(user.coins ?? 0);
      setLastActiveAt((user as any)?.last_active_at ?? null);
      setTimezone((user as any)?.timezone ?? null);
    }

    if (user?.id) {
      // читаем выбранный курс: сперва кешированный user, затем база
      const cachedU = cacheGet<any>(CACHE_KEYS.user);
      let addedId: number | null | undefined = cachedU?.added_course;
      if (addedId == null) {
        const { data: u2 } = await supabase
          .from('users')
          .select('added_course')
          .eq('id', user.id)
          .single();
        addedId = (u2 as any)?.added_course as number | null | undefined;
      }
      if (addedId) {
        const { data: subj } = await supabase
          .from('subjects')
          .select('title, code')
          .eq('id', addedId)
          .single();
        const title = subj?.title as string | undefined;
        const code  = subj?.code  as string | undefined;
        if (title) setCourseTitle(title);
        if (code) {
          setCourseCode(code);
          setIconOk(true);
          try { localStorage.setItem(ACTIVE_KEY, code); } catch {}
          cacheSet(CACHE_KEYS.activeCourseCode, code);
        }
      } else {
        // если в users нет added_course — попробуем boot-кэш, затем localStorage
        const boot = (window as any).__exampliBoot as any | undefined;
        const bootCode = boot?.subjects?.[0]?.code as string | undefined;
        const bootTitle = boot?.subjects?.[0]?.title as string | undefined;
        if (bootCode) {
          setCourseCode(bootCode);
          if (bootTitle) setCourseTitle(bootTitle);
          setIconOk(true);
          try { localStorage.setItem(ACTIVE_KEY, bootCode); } catch {}
        } else {
          try {
            const stored = localStorage.getItem(ACTIVE_KEY) || cacheGet<string>(CACHE_KEYS.activeCourseCode) || '';
            if (stored) {
              setCourseCode(stored);
              setIconOk(true);
              const { data: subj2 } = await supabase
                .from('subjects')
                .select('title')
                .eq('code', stored)
                .single();
              const t = subj2?.title as string | undefined;
              if (t) setCourseTitle(t);
            }
          } catch {}
        }
      }
    }
  }, []);

  useEffect(() => {
    // начальная инициализация из courseStore (моментально)
    const snap = getActiveCourse();
    if (snap?.code) {
      setCourseCode(snap.code);
      if (snap.title) setCourseTitle(snap.title);
      setIconOk(true);
    }

    // подписка на изменения активного курса
    const unsub = subscribeActiveCourse((c) => {
      if (c?.code) {
        setCourseCode(c.code);
        if (c.title) setCourseTitle(c.title);
        setIconOk(true);
      }
    });

    let alive = true;
    const refresh = async () => {
      if (!alive) return;
      // синхронизируем энергию (ленивая регенерация) и затем обновим снапшот
      try { await syncEnergy(0); } catch {}
      await loadUserSnapshot();
    };

    refresh();

    const onCourseChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string; code?: string }>;
      if (e.detail?.title) setCourseTitle(e.detail.title);
      if (e.detail?.code) {
        setCourseCode(e.detail.code);
        setIconOk(true);
        try { localStorage.setItem('exampli:activeSubjectCode', e.detail.code); } catch {}
        cacheSet(CACHE_KEYS.activeCourseCode, e.detail.code);
      }
    };

    const onVisible = () => { if (!document.hidden) refresh(); };
    const onStatsChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ energy?: number; coins?: number; streak?: number }>;
      const ne = e.detail?.energy;
      if (typeof ne === 'number') {
        setEnergy(ne);
        try {
          const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
          cacheSet(CACHE_KEYS.stats, { ...cs, energy: ne });
        } catch {}
      }
      const ns = e.detail?.streak;
      if (typeof ns === 'number') {
        setStreak(ns);
        try {
          const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
          cacheSet(CACHE_KEYS.stats, { ...cs, streak: ns });
        } catch {}
      }
      const nc = e.detail?.coins;
      if (typeof nc === 'number') {
        setCoins(nc);
        try {
          const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
          cacheSet(CACHE_KEYS.stats, { ...cs, coins: nc });
        } catch {}
      }
      const la = (e as any).detail?.last_active_at as string | undefined;
      if (typeof la === 'string') {
        setLastActiveAt(la);
        try {
          const cu = cacheGet<any>(CACHE_KEYS.user) || {};
          cacheSet(CACHE_KEYS.user, { ...cu, last_active_at: la });
        } catch {}
      }
    };

    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    window.addEventListener('exampli:subjectsChanged', refresh as unknown as EventListener);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('exampli:statsChanged', onStatsChanged as EventListener);

    return () => {
      alive = false;
      window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
      window.removeEventListener('exampli:subjectsChanged', refresh as unknown as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('exampli:statsChanged', onStatsChanged as EventListener);
      try { unsub(); } catch {}
    };
  }, [loadUserSnapshot]);

  // последовательно: закрыть TopSheet → на следующий кадр открыть AddCourseSheet
  const openAddCourse = () => {
    setOpen(null);
    requestAnimationFrame(() => setAddOpen(true));
  };

  // подпинываем плавающие элементы (баннер) пересчитать позицию
  useEffect(() => {
    window.dispatchEvent(new Event('exampli:overlayToggled'));
  }, [addOpen, open]);

  // Слушаем глобальное событие, чтобы открыть AddCourseSheet после онбординга
  useEffect(() => {
    const handler = () => {
      (window as any).__exampliAfterOnboarding = true;
      setAddOpen(true);
    };
    window.addEventListener('exampli:openAddCourse', handler);
    return () => window.removeEventListener('exampli:openAddCourse', handler);
  }, []);

  return (
    <>
      {/* Верхний HUD — фон как у всей страницы */}
      <div className="hud-fixed bg-[var(--bg)]">
        <div ref={anchorRef} className="max-w-xl mx-auto px-5 py-0">
          {/* 4 равные колонки: Курс — Стрик — Коины — Энергия */}
          <div className="grid grid-cols-4 items-center">
            {/* Курс (слева) */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(prev => prev === 'course' ? null : 'course'); }}
              className="flex items-center gap-2"
              aria-label="Выбрать курс"
            >
              {courseCode && iconOk ? (
                <img
                  src={`/subjects/${courseCode}.svg`}
                  alt=""
                  className="w-[56px] h-[44px] object-contain"
                  onError={() => setIconOk(false)}
                />
              ) : (
                <span className="text-lg">🧩</span>
              )}
              {(!courseCode || !iconOk) && (
                <span className="truncate max-w-[160px]">{courseTitle}</span>
              )}
            </button>

            {/* Стрик */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(prev => prev === 'streak' ? null : 'streak'); }}
              className="justify-self-start ml-2 flex items-center gap-0 text-sm text-[color:var(--muted)]"
              aria-label="Стрик"
            >
              {(() => {
                // Вычисляем состояние иконки: fire (есть активность сегодня), almost_dead_fire (можно увеличить сегодня), dead_fire (0)
                const s = Number(streak || 0);
                let icon = '/stickers/dead_fire.svg';
                let streakColorClass = 'text-[color:var(--muted)]';
                if (s > 0) {
                  // определим diffDays относительно last_active_at
                  const toParts = (d: Date | null) => {
                    if (!d) return null;
                    try {
                      const fmt = new Intl.DateTimeFormat((timezone || undefined) as any, { timeZone: (timezone || undefined) as any, year: 'numeric', month: 'numeric', day: 'numeric' });
                      const parts = fmt.formatToParts(d);
                      const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
                      const m = Number(parts.find(p => p.type === 'month')?.value || NaN) - 1;
                      const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
                      if ([y, m, dd].some(n => !Number.isFinite(n))) return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
                      return { y, m, d: dd };
                    } catch { return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; }
                  };
                  const now = new Date();
                  const la = lastActiveAt ? new Date(String(lastActiveAt)) : null;
                  const tp = toParts(now)!;
                  const lp = toParts(la);
                  const todayStart = new Date(tp.y, tp.m, tp.d).getTime();
                  const lastStart = lp ? new Date(lp.y, lp.m, lp.d).getTime() : null;
                  const diffDays = (lastStart == null) ? Infinity : Math.round((todayStart - lastStart) / 86400000);
                  if (diffDays <= 0) { icon = '/stickers/fire.svg'; streakColorClass = 'text-[#f6b73c]'; }
                  else if (diffDays === 1) { icon = '/stickers/almost_dead_fire.svg'; streakColorClass = 'text-[#f6b73c]'; }
                  else { icon = '/stickers/dead_fire.svg'; streakColorClass = 'text-[color:var(--muted)]'; }
                }
                return <>
                  <img src={icon} alt="" aria-hidden className="w-9 h-9" />
                  <span className={["tabular-nums font-bold text-lg -ml-1", streakColorClass].join(' ')}>{streak}</span>
                </>;
              })()}
            </button>

            {/* Коины (иконка + число справа) */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                // Сначала закрываем любую открытую верхнюю шторку, затем переходим
                setOpen(null);
                // Немного подождём кадр, чтобы портал успел скрыться
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    try { sessionStorage.setItem('exampli:highlightCoins','1'); } catch {}
                    window.dispatchEvent(new Event('exampli:highlightCoins'));
                    navigate('/subscription');
                  });
                });
              }}
              className="justify-self-center flex items-center gap-1 text-sm text-[color:var(--muted)]"
              aria-label="Коины"
            >
              <img src="/stickers/coin_cat.svg" alt="" aria-hidden className="w-8 h-8" />
              <span className="tabular-nums font-bold text-lg text-yellow-400">{coins}</span>
            </button>

            {/* Энергия (справа) */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(prev => prev === 'energy' ? null : 'energy'); }}
              className="justify-self-end flex items-center gap-1 text-sm text-[color:var(--muted)]"
              aria-label="Энергия"
            >
              <img
                src={`/stickers/battery/${Math.max(0, Math.min(25, energy))}.svg`}
                alt=""
                aria-hidden
                className="w-9 h-9"
              />
              <span
                className={[
                  'tabular-nums font-bold text-base',
                  energy <= 0 ? 'text-gray-400' : (energy <= 5 ? 'text-red-400' : 'text-green-400')
                ].join(' ')}
              >
                {energy}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Верхние шторки */}
      <TopSheet
        open={open === 'course'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title=""
        variant="course"
        arrowX={anchorRef.current?.querySelector('button[aria-label="Выбрать курс"]')?.getBoundingClientRect().left
          ? (anchorRef.current!.querySelector('button[aria-label="Выбрать курс"]') as HTMLElement).getBoundingClientRect().left + ((anchorRef.current!.querySelector('button[aria-label="Выбрать курс"]') as HTMLElement).offsetWidth / 2)
          : undefined}
      >
        <CoursesPanel
          onPicked={async (s: Subject) => {
            await setUserSubjects([s.code]);
            storeSetActiveCourse({ code: s.code, title: s.title });
            setOpen(null);
          }}
          onAddClick={openAddCourse}
        />
      </TopSheet>

      <TopSheet
        open={open === 'streak'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title=""
        variant="streak"
        arrowX={anchorRef.current?.querySelector('button[aria-label="Стрик"]')?.getBoundingClientRect().left
          ? (anchorRef.current!.querySelector('button[aria-label="Стрик"]') as HTMLElement).getBoundingClientRect().left + ((anchorRef.current!.querySelector('button[aria-label="Стрик"]') as HTMLElement).offsetWidth / 2)
          : undefined}
      >
        <StreakSheetBody />
      </TopSheet>

      <TopSheet
        open={open === 'energy'}
        onClose={() => setOpen(null)}
        anchor={anchorRef}
        title=""
        variant="energy"
        arrowX={anchorRef.current?.querySelector('button[aria-label="Энергия"]')?.getBoundingClientRect().left
          ? (anchorRef.current!.querySelector('button[aria-label="Энергия"]') as HTMLElement).getBoundingClientRect().left + ((anchorRef.current!.querySelector('button[aria-label="Энергия"]') as HTMLElement).offsetWidth / 2)
          : undefined}
      >
        <EnergySheetBody value={energy} isOpen={open === 'energy'} onOpenSubscription={async () => { setOpen(null); location.assign('/subscription'); }} />
      </TopSheet>

      {/* Кошелёк удалён — используем страницу подписки */}

      {/* Выбор курса: после онбординга — блокирующий полноэкранный; иначе — обычная шторка */}
      {((window as any).__exampliAfterOnboarding === true) ? (
        <AddCourseBlocking
          open={addOpen}
          onPicked={(s) => {
            void setUserSubjects([s.code]);
            storeSetActiveCourse({ code: s.code, title: s.title });
            (window as any).__exampliAfterOnboarding = false;
            setAddOpen(false);
          }}
        />
      ) : (
        <AddCourseSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdded={(s) => {
            storeSetActiveCourse({ code: s.code, title: s.title });
            setAddOpen(false);
          }}
          sideEffects={true}
        />
      )}
    </>
  );
}

/* ================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ================== */

function StreakSheetBody() { return <StreakSheetContent />; }

function EnergySheetBody({ value, onOpenSubscription, isOpen }: { value: number; onOpenSubscription: () => void; isOpen?: boolean }) {
  const [energy, setEnergy] = useState(value);
  const [fullAt, setFullAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  useEffect(() => {
    let timer: any;
    // моментальный снэпшот из кэша (если есть) — до RPC
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      if (cs?.energy != null) setEnergy(Number(cs.energy));
      if (cs?.energy_full_at != null) setFullAt(String(cs.energy_full_at));
    } catch {}
    (async () => {
      const res = await syncEnergy(0);
      if (res?.energy != null) setEnergy(res.energy);
      if (res?.full_at) setFullAt(res.full_at);
    })();
    timer = setInterval(async () => {
      setNowTick(Date.now());
      // раз в минуту подтягиваем с сервера, чтобы сразу отображать full_at после трат
      const res = await syncEnergy(0);
      if (res?.energy != null) setEnergy(res.energy);
      if (res?.full_at != null) setFullAt(res.full_at);
    }, 60000);
    const onSynced = (e: any) => { if (e?.detail?.full_at !== undefined) setFullAt(e.detail.full_at); };
    window.addEventListener('exampli:energySynced', onSynced as EventListener);
    return () => { clearInterval(timer); window.removeEventListener('exampli:energySynced', onSynced as EventListener); };
  }, []);

  // Каждый раз при открытии шторки — форсим свежую синхронизацию
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const res = await syncEnergy(0);
      if (res?.energy != null) setEnergy(res.energy);
      if (res?.full_at != null) setFullAt(res.full_at);
    })();
  }, [isOpen]);

  useEffect(() => { setEnergy(value); }, [value]);

  const percent = Math.max(0, Math.min(100, Math.round((energy / 25) * 100)));
  const iconName = energy >= 25 ? 'full' : 'none';

  const fullLeft = (() => {
    if (!fullAt) return '';
    const ms = new Date(fullAt).getTime() - nowTick;
    if (ms <= 0) return '';
    const totalMin = Math.ceil(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m} МИН`;
    if (m === 0) return `${h} Ч`;
    return `${h} Ч ${m} МИН`;
  })();

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-2xl font-extrabold">Энергия</div>
        {energy < 25 && fullLeft && (
          <div className="font-extrabold flex items-center gap-[2px] mr-4 translate-y-[4px]" style={{ color: '#454241' }}>
            <img src="/stickers/energy.svg" alt="" aria-hidden className="block w-8 h-8 opacity-80 shrink-0" />
            <span className="leading-none">{fullLeft}</span>
          </div>
        )}
      </div>
      <div className="mt-4 relative">
        {/* Трек (уменьшенная ширина, чтобы оставить больше воздуха справа) */}
        <div className="relative h-7 rounded-full bg-white/10 overflow-hidden" style={{ width: 'calc(100% - 20px)' }}>
          <div
            className="absolute left-0 top-0 h-full"
            style={{ width: `${percent}%`, background: '#3c73ff', borderTopLeftRadius: 9999, borderBottomLeftRadius: 9999 }}
          />
          <div className="absolute inset-0 flex items-center justify-center font-extrabold">{energy}/25</div>
        </div>
        {/* Иконка поверх, крупнее полосы, чтобы визуально "обрезать" край */}
        <img
          src={`/stickers/battery/${iconName}.svg`}
          alt=""
          aria-hidden
          className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 pointer-events-none"
          style={{ zIndex: 2 }}
        />
      </div>

      <div className="grid gap-3 mt-6">
        <button type="button" className="card text-left" onClick={onOpenSubscription}>
          <div className="font-semibold">Безлимит (демо)</div>
          <div className="text-sm text-muted">Нажми, чтобы открыть «Абонемент»</div>
        </button>
        <button type="button" className="btn w-full" onClick={onOpenSubscription}>+ Пополнить / Оформить</button>
      </div>
    </>
  );
}