// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { hapticTiny } from '../lib/haptics';
import { useNavigate } from 'react-router-dom';
import FullScreenSheet from './sheets/FullScreenSheet';
import { supabase } from '../lib/supabase';
import { rewardEnergy } from '../lib/userState';
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
  // Пульс иконки энергии после пополнения
  const [energyPulseKey, setEnergyPulseKey] = useState<number>(0);

  const [courseTitle, setCourseTitle] = useState('Курс');
  const [courseCode, setCourseCode] = useState<string | null>(null);
  const [iconOk, setIconOk] = useState<boolean>(true);
  const [streak, setStreak] = useState(0);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [lastStreakDay, setLastStreakDay] = useState<string | null>(null);
  const [yesterdayFrozen, setYesterdayFrozen] = useState<boolean>(false);
  const [energy, setEnergy] = useState(25);
  // Признак активной подписки (PLUS)
  const [isPlus, setIsPlus] = useState<boolean>(false);

  // коины (счётчик); при клике — переход на подписку с подсветкой
  const [coins, setCoins] = useState(0);

  // какая верхняя шторка открыта
  const [open, setOpen] = useState<'course' | 'streak' | 'energy' | null>(null);

  // Слушаем глобальный "пульс" энергии и дергаем анимацию иконки
  useEffect(() => {
    const onPulse = () => setEnergyPulseKey(k => k + 1);
    window.addEventListener('exampli:energyPulse', onPulse);
    return () => window.removeEventListener('exampli:energyPulse', onPulse);
  }, []);

  // Открыть шторку энергии по глобальному событию
  useEffect(() => {
    const openEnergyHandler = () => setOpen('energy');
    window.addEventListener('exampli:openEnergy', openEnergyHandler as unknown as EventListener);
    return () => window.removeEventListener('exampli:openEnergy', openEnergyHandler as unknown as EventListener);
  }, []);

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
    // last_streak_day из boot‑кэша (если был положен на этапе boot)
    try {
      const lsd = cacheGet<string>(CACHE_KEYS.lastStreakDay) || (window as any)?.__exampliBoot?.last_streak_day || null;
      if (lsd) setLastStreakDay(String(lsd));
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
      // Определим в МСК, был ли вчера freeze-день
      try {
        const tz = 'Europe/Moscow';
        const toIso = (date: Date) => {
          const f = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
          const parts = f.formatToParts(date);
          const yy = Number(parts.find(p => p.type === 'year')?.value || NaN);
          const mm = Number(parts.find(p => p.type === 'month')?.value || NaN);
          const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${yy}-${pad(mm)}-${pad(dd)}`;
        };
        const now = new Date();
        const yesterdayIso = toIso(new Date(now.getTime() - 86400000));
        const { data: sd } = await supabase
          .from('streak_days')
          .select('kind')
          .eq('user_id', user.id)
          .eq('day', yesterdayIso)
          .maybeSingle();
        setYesterdayFrozen(String(sd?.kind || '') === 'freeze');
      } catch {
        setYesterdayFrozen(false);
      }
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
      const e = evt as CustomEvent<{ energy?: number; coins?: number; streak?: number; last_streak_day?: string }>;
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
      const lsd = e.detail?.last_streak_day;
      if (typeof lsd === 'string') {
        setLastStreakDay(lsd);
        try { cacheSet(CACHE_KEYS.lastStreakDay, lsd); } catch {}
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
    // Когда boot2 положит streakDaysAll, подхватим yesterdayFrozen без запроса к БД
    const onStreakDaysLoaded = (evt: Event) => {
      try {
        const e = evt as CustomEvent<{ yesterday_frozen?: boolean } & any>;
        if (typeof e.detail?.yesterday_frozen === 'boolean') setYesterdayFrozen(Boolean(e.detail.yesterday_frozen));
      } catch {}
    };
    window.addEventListener('exampli:streakDaysLoaded', onStreakDaysLoaded as EventListener);

    return () => {
      alive = false;
      window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
      window.removeEventListener('exampli:subjectsChanged', refresh as unknown as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('exampli:statsChanged', onStatsChanged as EventListener);
      window.removeEventListener('exampli:streakDaysLoaded', onStreakDaysLoaded as EventListener);
      try { unsub(); } catch {}
    };
  }, [loadUserSnapshot]);

  // Следим за признаком подписки через кэш и события
  useEffect(() => {
    const onPlus = (evt: Event) => {
      const e = evt as CustomEvent<{ plus_until?: string } & any>;
      if (e.detail?.plus_until !== undefined) {
        try { setIsPlus(Boolean(e.detail.plus_until && new Date(e.detail.plus_until).getTime() > Date.now())); } catch {}
      }
    };
    window.addEventListener('exampli:statsChanged', onPlus as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onPlus as EventListener);
  }, []);

  // Initialize PLUS status from boot data once available to avoid stale local cache
  useEffect(() => {
    const onBoot = (evt: Event) => {
      try {
        const e = evt as CustomEvent<any>;
        const pu0 = e?.detail?.user?.plus_until as string | undefined;
        if (pu0 !== undefined) setIsPlus(Boolean(pu0 && new Date(String(pu0)).getTime() > Date.now()));
      } catch {}
    };
    window.addEventListener('exampli:bootData', onBoot as EventListener);
    return () => window.removeEventListener('exampli:bootData', onBoot as EventListener);
  }, []);

  // последовательно: закрыть TopSheet → на следующий кадр открыть AddCourseSheet
  const openAddCourse = () => {
    setOpen(null);
    requestAnimationFrame(() => setAddOpen(true));
  };

  // подпинываем плавающие элементы (баннер) пересчитать позицию
  useEffect(() => {
    window.dispatchEvent(new Event('exampli:overlayToggled'));
  }, [addOpen, open]);

  // Закрыть CourseSheet по внутреннему событию (клик по уже активному курсу)
  useEffect(() => {
    const close = () => setOpen((prev) => (prev === 'course' ? null : prev));
    window.addEventListener('exampli:closeCourseSheet', close);
    return () => window.removeEventListener('exampli:closeCourseSheet', close);
  }, []);

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
                // Иконка: строго по last_streak_day с расчётом «сегодня/вчера/иначе» в МСК. Число всегда = streak.
                const s = Number(streak || 0);
                let icon = '/stickers/dead_fire.svg';
                let streakColorClass = 'text-[color:var(--muted)]';
                let display = s;
                if (s > 0) {
                  // вычислим today/yesterday в МСК корректно через форматтер в TZ
                  const tz = 'Europe/Moscow';
                  const toIso = (date: Date) => {
                    try {
                      const f = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
                      const parts = f.formatToParts(date);
                      const yy = Number(parts.find(p => p.type === 'year')?.value || NaN);
                      const mm = Number(parts.find(p => p.type === 'month')?.value || NaN);
                      const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
                      const pad = (n: number) => String(n).padStart(2, '0');
                      return `${yy}-${pad(mm)}-${pad(dd)}`;
                    } catch {
                      const yy = date.getUTCFullYear(); const mm = date.getUTCMonth() + 1; const dd = date.getUTCDate();
                      const pad = (n: number) => String(n).padStart(2, '0');
                      return `${yy}-${pad(mm)}-${pad(dd)}`;
                    }
                  };
                  const now = new Date();
                  const todayIso = toIso(now);
                  const yesterdayIso = toIso(new Date(now.getTime() - 86400000));
                  const lastIso = (lastStreakDay ? String(lastStreakDay) : null);
                  if (lastIso === todayIso) { icon = '/stickers/fire.svg'; streakColorClass = 'text-[#f6b73c]'; }
                  else if (lastIso === yesterdayIso) {
                    // если вчера freeze — показываем frozen_fire и подсвечиваем число сине-голубым
                    icon = yesterdayFrozen ? '/stickers/frozen_fire.svg' : '/stickers/almost_dead_fire.svg';
                    streakColorClass = yesterdayFrozen ? 'text-[#5cc8ff]' : 'text-[#f6b73c]';
                  }
                  else { icon = '/stickers/dead_fire.svg'; streakColorClass = 'text-[color:var(--muted)]'; }
                } else {
                  display = 0;
                }
                return <>
                  <img src={icon} alt="" aria-hidden className="w-9 h-9" />
                  <span className={["tabular-nums font-bold text-lg -ml-1", streakColorClass].join(' ')}>{display}</span>
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
              {isPlus ? (
                <img src="/stickers/battery/plus_energy_www.svg" alt="" aria-hidden className="w-[56px] h-[44px] object-contain" />
              ) : (
                <>
                  <motion.img
                    src={`/stickers/battery/${Math.max(0, Math.min(25, energy))}.svg`}
                    alt=""
                    aria-hidden
                    className="w-9 h-9"
                    key={energyPulseKey}
                    initial={{ scale: 1 }}
                    animate={energyPulseKey ? { scale: [1, 2.4, 1] } : { scale: 1 }}
                    transition={{ duration: 1, times: [0, 0.5, 1], ease: 'easeInOut' }}
                  />
                  <span
                    className={[
                      'tabular-nums font-bold text-base',
                      energy <= 0 ? 'text-gray-400' : (energy <= 5 ? 'text-red-400' : 'text-green-400')
                    ].join(' ')}
                  >
                    {energy}
                  </span>
                </>
              )}
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
        <EnergySheetBody
          value={energy}
          isOpen={open === 'energy'}
          onOpenSubscription={async () => { setOpen(null); navigate('/subscription'); }}
          openGate={() => { setOpen(null); navigate('/subscription-gate'); }}
          onCloseSheet={() => setOpen(null)}
          isPlus={isPlus}
        />
      </TopSheet>

      {/* Кошелёк удалён — используем страницу подписки ввв*/}

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

function EnergySheetBody({ value, onOpenSubscription, isOpen, openGate, onCloseSheet, isPlus = false }: { value: number; onOpenSubscription: () => void; isOpen?: boolean; openGate?: () => void; onCloseSheet: () => void; isPlus?: boolean }) {
  const [energy, setEnergy] = useState(value);
  const [coins, setCoins] = useState<number>(0);
  const [toppingUp, setToppingUp] = useState<boolean>(false);
  const [fullAt, setFullAt] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [showSubsOverlay, setShowSubsOverlay] = useState(false);
  useEffect(() => {
    try {
      const need = sessionStorage.getItem('exampli:openEnergy');
      if (need === '1' && isOpen !== true) {
        // текущий EnergySheet будет открыт извне; просто очищаем флаг
        sessionStorage.removeItem('exampli:openEnergy');
      }
    } catch {}
  }, [isOpen]);

  useEffect(() => {
    let timer: any;
    // моментальный снэпшот из кэша (если есть) — до RPC
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      if (cs?.energy != null) setEnergy(Number(cs.energy));
      if (cs?.energy_full_at != null) setFullAt(String(cs.energy_full_at));
      if (cs?.coins != null) setCoins(Number(cs.coins));
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
    const onStatsChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ energy?: number; coins?: number }>;
      if (typeof e.detail?.energy === 'number') setEnergy(Number(e.detail.energy));
      if (typeof e.detail?.coins === 'number') setCoins(Number(e.detail.coins));
    };
    window.addEventListener('exampli:statsChanged', onStatsChanged as EventListener);
    return () => {
      clearInterval(timer);
      window.removeEventListener('exampli:energySynced', onSynced as EventListener);
      window.removeEventListener('exampli:statsChanged', onStatsChanged as EventListener);
    };
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

  const percent = isPlus ? 100 : Math.max(0, Math.min(100, Math.round((energy / 25) * 100)));
  const iconName = energy >= 25 ? 'full' : 'none';
  const canTopUp = coins >= 500 && energy < 25;

  async function handleTopUp() {
    if (toppingUp || !canTopUp) return;
    setToppingUp(true);
    try {
      const newEnergy = 25;
      const newCoins = Math.max(0, Number(coins) - 500);
      // 1) Оптимистично обновим локальный кэш и уведомим UI
      try {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, energy: newEnergy, coins: newCoins, energy_full_at: null });
      } catch {}
      try { window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: newEnergy, coins: newCoins } } as any)); } catch {}
      try { window.dispatchEvent(new CustomEvent('exampli:energySynced', { detail: { energy: newEnergy, next_at: null, full_at: null } } as any)); } catch {}

      // 2) Сервер: атомарно сбрасываем очередь трат, ставим energy=25 и списываем 500
      try {
        const tgIdRaw: any = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.tg_id) || null;
        const tgId = tgIdRaw != null ? String(tgIdRaw) : null;
        const userId = (() => { try { return String(cacheGet<any>(CACHE_KEYS.user)?.id || ''); } catch { return ''; } })();
        const r = await fetch('/api/energy_topup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tg_id: tgId, user_id: userId || null })
        });
        if (r.ok) {
          try {
            const js = await r.json();
            const energySrv = Number(js?.energy ?? newEnergy);
            const coinsSrv = Number(js?.coins ?? newCoins);
            const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
            cacheSet(CACHE_KEYS.stats, { ...cs, energy: energySrv, coins: coinsSrv, energy_full_at: null });
            window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: energySrv, coins: coinsSrv } } as any));
            window.dispatchEvent(new CustomEvent('exampli:energySynced', { detail: { energy: energySrv, next_at: null, full_at: null } } as any));
          } catch {}
        }
      } catch {}
      // 3) Закрываем шторку и почти сразу (через 100мс) триггерим пульс на иконке энергии
      try {
        onCloseSheet();
        setTimeout(() => {
          try { window.dispatchEvent(new CustomEvent('exampli:energyPulse')); } catch {}
        }, 5);
      } catch {}
    } finally {
      setToppingUp(false);
    }
  }

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
            style={{
              width: `${percent}%`,
              background: isPlus
                ? 'linear-gradient(90deg, #22e3b1 0%, #3c73ff 50%, #d45bff 100%)'
                : '#3c73ff',
              borderTopLeftRadius: 9999,
              borderBottomLeftRadius: 9999,
            }}
          />
          {!isPlus && (
            <div className="absolute inset-0 flex items-center justify-center font-extrabold">{energy}/25</div>
          )}
        </div>
        {/* Иконка поверх: обычная батарейка или бесконечность при PLUS */}
        {isPlus ? (
          <img
            src="/stickers/battery/infin_progress_bar.svg"
            alt="∞"
            aria-hidden
            className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 pointer-events-none"
            style={{ zIndex: 2 }}
          />
        ) : (
          <img
            src={`/stickers/battery/${iconName}.svg`}
            alt=""
            aria-hidden
            className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-20 pointer-events-none"
            style={{ zIndex: 2 }}
          />
        )}
      </div>

      {isPlus ? (
        <div className="mt-6 mb-2">
          <img src="/stickers/cat_energy.svg" alt="PLUS Energy" className="block w-full h-auto" />
        </div>
      ) : (
        <>
          <div className="mt-12">
            <PlusInfinityButton onClick={() => { try { hapticTiny(); } catch {}; (openGate || (() => location.assign('/subscription-gate')))(); }} />
          </div>
          <div className="mt-5 mb-3">
            <TopUpEnergyButton onClick={handleTopUp} disabled={!canTopUp || toppingUp} />
          </div>
        </>
      )}

      {/* Открываем отдельную страницу-гейт, чтобы гарантированно перекрыть всё */}
      {showSubsOverlay && (location.href = '/subscription-gate') as unknown as null}
    </>
  );
}

function PlusInfinityButton({ onClick }: { onClick: () => void }) {
  const baseColor = '#0e1829'; // чуть темнее
  const pressHeight = 3; // ниже высота кнопки
  const shadowColor = lightenHex(baseColor, 0.35); // светлее основного (по просьбе)

  return (
    <motion.button
      whileTap={{ y: pressHeight, boxShadow: `0 0 0 0 ${shadowColor}` }}
      transition={{ duration: 0 }}
      onClick={onClick}
      className="relative w-full rounded-2xl px-5 py-3 text-white select-none overflow-hidden"
      style={{ background: baseColor, boxShadow: `0 ${pressHeight}px 0 0 ${shadowColor}` }}
      type="button"
      aria-label="PLUS Unbegrenzt"
    >
      {/* Верхняя лента с градиентом и надписью PLUS */}
      <div
        className="absolute left-0 right-0 top-0 h-8 rounded-t-2xl px-4 flex items-center font-extrabold tracking-wider text-white text-[20px]"
        style={{ background: 'linear-gradient(90deg,#a855f7 0%,#3b82f6 50%,#10b981 100%)' }}
      >
        PLUS
      </div>

      <div className="flex items-center gap-4 mt-8">
        <img src="/stickers/battery/infin_energy.svg" alt="∞" className="w-[68px] h-[56px] rounded-xl" />
        <div className="flex-1 text-left">
          <div className="text-lg font-extrabold">Безлимит</div>
        </div>
      </div>
    </motion.button>
  );
}

function TopUpEnergyButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const baseColor = '#0e1829';
  const pressHeight = 3;
  const shadowColor = lightenHex(baseColor, 0.35);
  return (
    <motion.button
      whileTap={disabled ? undefined : { y: pressHeight, boxShadow: `0 0 0 0 ${shadowColor}` }}
      transition={{ duration: 0 }}
      onClick={disabled ? undefined : onClick}
      type="button"
      className={`relative w-full rounded-2xl px-5 py-3 select-none overflow-hidden flex items-center justify-between ${disabled ? 'cursor-not-allowed' : 'text-white'}`}
      style={{
        background: disabled ? darkenHex(baseColor, 0.45) : baseColor,
        boxShadow: disabled ? 'none' : `0 ${pressHeight}px 0 0 ${shadowColor}`,
        color: disabled ? 'rgba(255,255,255,0.55)' : undefined,
        filter: disabled ? 'grayscale(0.35)' : undefined,
      }}
      aria-label="Пополнить энергию"
      disabled={disabled}
    >
      <div className="flex items-center gap-3">
        <img src="/stickers/battery/25.svg" alt="25" className="w-[72px] h-[72px]" />
        <div className="font-semibold">Пополнить</div>
      </div>
      <div className="flex items-center gap-2">
        <img src="/stickers/coin_cat.svg" alt="" className="h-8 w-8" />
        <div className={`font-extrabold tabular-nums text-xl ${disabled ? 'text-white/60' : 'text-yellow-300'}`}>500</div>
      </div>
    </motion.button>
  );
}

function darkenHex(hex: string, amount: number): string {
  try {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r * (1 - amount))));
    g = Math.max(0, Math.min(255, Math.floor(g * (1 - amount))));
    b = Math.max(0, Math.min(255, Math.floor(b * (1 - amount))));
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return hex; }
}

function lightenHex(hex: string, amount: number): string {
  try {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r + (255 - r) * amount)));
    g = Math.max(0, Math.min(255, Math.floor(g + (255 - g) * amount)));
    b = Math.max(0, Math.min(255, Math.floor(b + (255 - b) * amount)));
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return hex; }
}

function EnergySubscribeCta({ onClick }: { onClick: () => void }) {
  const base = '#3b5bff';
  const dark = darkenHex(base, 0.25);
  const press = 6;
  return (
    <motion.button
      type="button"
      whileTap={{ y: press, boxShadow: `0 0 0 0 ${dark}` }}
      transition={{ duration: 0 }}
      onClick={onClick}
      className="w-full rounded-full text-white font-extrabold tracking-wider py-3 text-center"
      style={{ background: base, boxShadow: `0 ${press}px 0 0 ${dark}` }}
    >
      КУПИТЬ ПОДПИСКУ
    </motion.button>
  );
}

// Legacy overlay (не используется, оставлен на случай возврата)
function EnergySubscribeOverlay(_props: { onClose: () => void; onBuy: () => void }) { return null; }