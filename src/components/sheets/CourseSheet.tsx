// src/components/panels/TopicsPanel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';
import { motion } from 'framer-motion';
import { hapticTiny } from '../../lib/haptics';
import { setActiveCourse as storeSetActiveCourse } from '../../lib/courseStore';
import { precacheTopicsForSubject } from '../../lib/boot';

type Subject = { id: number; code: string; title: string; level: string };

type Props =
  // Режим ПАНЕЛИ (Home.tsx): показываем левую выезжающую панель!
  | { open: boolean; onClose: () => void; onPicked?: (s: Subject) => void; onAddClick?: () => void }
  // Режим ВСТАВКИ в TopSheet (HUD.tsx): просто отдаём контент без контейнера
  | { open?: undefined; onClose?: undefined; onPicked?: (s: Subject) => void; onAddClick?: () => void };

const ACTIVE_KEY = 'exampli:activeSubjectCode';

export default function CoursesPanel(props: Props) {
  const { open, onClose, onPicked, onAddClick } = props as {
    open?: boolean;
    onClose?: () => void;
    onPicked?: (s: Subject) => void;
    onAddClick?: () => void;
  };

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // полностью отказались от загрузки при открытии — всё берём из boot/cache

  // --- helpers ---
  // kept for potential future use; currently boot init covers active code
  // const readActiveFromStorage = useCallback(() => {
  //   try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  // }, []);
  const writeActiveToStorage = useCallback((code: string) => {
    try { localStorage.setItem(ACTIVE_KEY, code); } catch {}
  }, []);

  // Локальная инициализация из boot/cache без сетевых запросов
  const loadFromBoot = useCallback(() => {
    try {
      const boot: any = (window as any).__exampliBoot;
      const all: Subject[] = (boot?.subjectsAll || []) as Subject[];
      const user = cacheGet<any>(CACHE_KEYS.user) || boot?.user || {};
      const plusActive = Boolean(user?.plus_until && new Date(String(user.plus_until)).getTime() > Date.now());
      let list: Subject[] = [];
      if (plusActive) {
        list = (boot?.subjects || []) as Subject[];
        if (!list || !list.length) {
          const addedId = user?.added_course;
          if (addedId && Array.isArray(all) && all.length) {
            const found = all.find((s) => String(s.id) === String(addedId));
            list = found ? [found] : [];
          }
        }
      } else {
        // Без подписки — показываем только активный курс
        const activeCodeBoot = boot?.active_code || null;
        if (activeCodeBoot && Array.isArray(all) && all.length) {
          const foundByCode = all.find((s) => s.code === activeCodeBoot);
          if (foundByCode) list = [foundByCode];
        }
        if (!list.length) {
          const addedId = user?.added_course;
          if (addedId && Array.isArray(all) && all.length) {
            const found = all.find((s) => String(s.id) === String(addedId));
            if (found) list = [found];
          }
        }
      }
      setSubjects(list || []);
      const stored = localStorage.getItem(ACTIVE_KEY);
      const code = stored || list?.[0]?.code || null;
      if (code) {
        setActiveCode(code);
        cacheSet(CACHE_KEYS.activeCourseCode, code);
      } else {
        setActiveCode(null);
      }
    } catch {}
  }, []);

  // Инициализация из boot при монтировании (без сети)
  useEffect(() => { loadFromBoot(); }, [loadFromBoot]);
  // Предзагрузка иконок предметов из boot (если прилетели)
  useEffect(() => {
    try {
      const boot: any = (window as any).__exampliBoot;
      const subs: Subject[] = (boot?.subjects || []) as Subject[];
      subs.slice(0, 12).forEach((s) => {
        const img = new Image();
        img.src = `/subjects/${s.code}.svg`;
      });
    } catch {}
  }, []);
  // Мгновенное открытие без загрузки — никаких действий при open

  // Быстрый init уже покрыт loadFromBoot

  // Слушаем внешние события, чтобы обновиться:
  // - после добавления нового курса (subjectsChanged — если решишь диспатчить)
  // - после переключения/выбора курса (courseChanged — для подсветки)
  useEffect(() => {
    const onSubjectsChanged = () => loadFromBoot();
    const onCourseChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ title?: string; code?: string }>;
      if (e.detail?.code) {
        setActiveCode(e.detail.code);
        writeActiveToStorage(e.detail.code);
      }
    };
    window.addEventListener('exampli:subjectsChanged', onSubjectsChanged);
    window.addEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    return () => {
      window.removeEventListener('exampli:subjectsChanged', onSubjectsChanged);
      window.removeEventListener('exampli:courseChanged', onCourseChanged as EventListener);
    };
  }, [loadFromBoot, writeActiveToStorage]);

  // --- UI блоки ---
  const onWheelHoriz = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Преобразуем вертикальную прокрутку колёсиком мыши в горизонтальную
    try {
      const el = listRef.current;
      if (!el) return;
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    } catch {}
  }, []);
  const grid = useMemo(() => {
    if (!subjects.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
          Курс не выбран. Нажми «Добавить» ниже.
        </div>
      );
    }

    return (
      <div
        ref={listRef}
        onWheel={onWheelHoriz}
        className="flex items-stretch gap-3 overflow-x-auto overflow-y-hidden no-scrollbar px-1"
        style={{ touchAction: 'pan-x' }}
      >
        {subjects.map((s) => {
          const active = s.code === activeCode;
          return (
            <motion.button
              key={s.id}
              type="button"
              layout
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                hapticTiny();
                // если нажали на уже активный курс — просто закрыть шторку
                if (s.code === activeCode) {
                  try { window.dispatchEvent(new Event('exampli:closeCourseSheet')); } catch {}
                  return;
                }
                // как при добавлении: закрываем шторку и показываем сплэш без полного boot
                try { window.dispatchEvent(new Event('exampli:closeCourseSheet')); } catch {}
                try { (window as any).__exampliLoadingSubject = { code: String(s.code || '').replace(/^(oge_|ege_)/,'').toLowerCase(), title: s.title }; } catch {}
                try { (window as any).__exampliBootLocked = true; } catch {}
                try { window.dispatchEvent(new Event('exampli:reboot')); } catch {}
                ;(async () => {
                  try {
                    // Прогрев тем
                    try { await precacheTopicsForSubject(s.id); } catch {}
                    // Обновим активный курс и тему
                    const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
                    if (tgId) {
                      try {
                        const { data: topics } = await supabase
                          .from('topics')
                          .select('id,title')
                          .eq('subject_id', s.id)
                          .order('order_index', { ascending: true })
                          .limit(1);
                        const firstTopic: any = (topics as any[])?.[0] || null;
                        await supabase.from('users').update({ added_course: s.id, current_topic: firstTopic?.id ?? null }).eq('tg_id', String(tgId));
                        // локально — сразу подменим текущую тему, чтобы UI не мигал старой
                        try {
                          if (firstTopic?.id) {
                            localStorage.setItem('exampli:currentTopicId', String(firstTopic.id));
                            localStorage.setItem('exampli:currentTopicTitle', String(firstTopic.title || ''));
                            window.dispatchEvent(new Event('exampli:lessonsChanged'));
                          } else {
                            localStorage.removeItem('exampli:currentTopicId');
                            localStorage.removeItem('exampli:currentTopicTitle');
                          }
                        } catch {}
                      } catch {}
                    }
                    // Локально отметим активный курс
                    setActiveCode(s.code);
                    writeActiveToStorage(s.code);
                    storeSetActiveCourse({ code: s.code, title: s.title });
                    // Запускаем управляемый boot, чтобы гарантированно получить темы/уроки нового курса
                    try { window.dispatchEvent(new Event('exampli:startBoot')); } catch {}
                  } finally {
                    // Ничего не делаем — Splash сам закроется после boot
                    try { (window as any).__exampliBootLocked = false; } catch {}
                  }
                })();
              }}
              className="relative flex flex-col items-center text-center px-1"
            >
              <div className="relative z-10">
                <div
                  className={[
                    'grid place-items-center rounded-2xl border bg-transparent',
                    active ? 'border-[2px] border-[#3c73ff]' : 'border-transparent',
                  ].join(' ')}
                  style={{ width: 78, height: 56 }}
                >
                  <img
                    src={`/subjects/${s.code}.svg`}
                    alt={s.title}
                    className="w-[62px] h-auto object-contain relative -translate-y-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              </div>
              <div className="text-[8px] text-muted uppercase tracking-wide mt-1">{s.level}</div>
              <div className="text-[11px] font-semibold leading-tight line-clamp-2 mt-[2px] max-w-[110px]">{s.title}</div>
            </motion.button>
          );
        })}

        {/* Плитка «+ Добавить» */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            hapticTiny();
            if (typeof onAddClick === 'function') onAddClick();
            else window.dispatchEvent(new CustomEvent('exampli:addCourse'));
          }}
          className="relative flex flex-col items-center text-center px-1"
        >
          <div className="grid place-items-center rounded-2xl border border-white/12" style={{ width: 78, height: 56 }}>
            <div className="text-[34px] text-white/70">＋</div>
          </div>
          <div className="text-[10px] text-muted mt-2">Добавить</div>
        </motion.button>
      </div>
    );
  }, [subjects, activeCode, onPicked, onAddClick, writeActiveToStorage]);

  // Режим «панели слева»
  if (typeof open === 'boolean') {
    if (!open) return null;
    return (
      <>
        <div className="side-backdrop" onClick={onClose} />
        <aside className="side-panel">
          <div className="side-panel-header flex items-center justify-center">
            <div className="text-lg font-semibold">Темы</div>
          </div>
          <div className="side-panel-body">
            {grid}
          </div>
        </aside>
      </>
    );
  }

  // Режим «контента для TopSheet» (без контейнера)
  return <div className="pb-1">{grid}</div>;
}