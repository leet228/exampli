// src/components/HUD.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';
import TopSheet from './sheets/TopSheet';
import AddCourseSheet from './panels/AddCourseSheet';
import AddCourseBlocking from './panels/AddCourseBlocking';
import { setUserSubjects } from '../lib/userState';
import { getActiveCourse, subscribeActiveCourse, setActiveCourse as storeSetActiveCourse } from '../lib/courseStore';
import CoursesPanel from './sheets/CourseSheet';
// CoinSheet более не используется; переход на страницу подписки

type Subject = { id: number; code: string; title: string; level: string };

export default function HUD() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [courseTitle, setCourseTitle] = useState('Курс');
  const [courseCode, setCourseCode] = useState<string | null>(null);
  const [iconOk, setIconOk] = useState<boolean>(true);
  const [streak, setStreak] = useState(0);
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
      .select('id, streak, energy, coins')
      .eq('tg_id', String(tgId))
      .single();

    if (user) {
      setStreak(user.streak ?? 0);
      setEnergy((user.energy ?? 25) as number);
      setCoins(user.coins ?? 0);
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
    const refresh = async () => { if (alive) await loadUserSnapshot(); };

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

    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    window.addEventListener('exampli:subjectsChanged', refresh as unknown as EventListener);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
      window.removeEventListener('exampli:subjectsChanged', refresh as unknown as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
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
                  className="w-[64px] h-[48px] object-contain"
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
              className="justify-self-center flex items-center gap-0 text-sm text-[color:var(--muted)]"
              aria-label="Стрик"
            >
              <img src="/stickers/dead_fire.svg" alt="" aria-hidden className="w-9 h-9" />
              <span className="tabular-nums font-bold text-lg -ml-1 text-[color:var(--muted)]">{streak}</span>
            </button>

            {/* Коины (иконка + число справа) */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                try { sessionStorage.setItem('exampli:highlightCoins','1'); } catch {}
                window.dispatchEvent(new Event('exampli:highlightCoins'));
                navigate('/subscription');
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
        <EnergySheetBody value={energy} onOpenSubscription={() => { setOpen(null); location.assign('/subscription'); }} />
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

function StreakSheetBody() {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      setStreak(cs?.streak ?? 0);
    } catch {}
  }, []);
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <>
      <div className="card">
        <div className="text-3xl font-bold">🔥 {streak}</div>
        <div className="text-sm text-muted">дней подряд</div>
      </div>
      <div className="grid grid-cols-7 gap-2 mt-4">
        {days.map((d) => (
          <div
            key={d}
            className={`h-9 rounded-xl flex items-center justify-center text-sm border ${
              d <= streak ? 'bg-white/10 border-white/10' : 'border-white/5'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
    </>
  );
}

function EnergySheetBody({ value, onOpenSubscription }: { value: number; onOpenSubscription: () => void }) {
  const percent = Math.max(0, Math.min(100, Math.round((value / 25) * 100)));
  return (
    <>
      <div className="progress"><div style={{ width: `${percent}%` }} /></div>
      <div className="mt-2 text-sm text-muted">{value}/25</div>
      <div className="grid gap-3 mt-5">
        <button type="button" className="card text-left" onClick={onOpenSubscription}>
          <div className="font-semibold">Безлимит (демо)</div>
          <div className="text-sm text-muted">Нажми, чтобы открыть «Абонемент»</div>
        </button>
        <button type="button" className="btn w-full" onClick={onOpenSubscription}>+ Пополнить / Оформить</button>
      </div>
    </>
  );
}