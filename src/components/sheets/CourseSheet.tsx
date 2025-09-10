// src/components/panels/TopicsPanel.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';
import { motion } from 'framer-motion';
import { hapticTiny } from '../../lib/haptics';
import { setActiveCourse as storeSetActiveCourse } from '../../lib/courseStore';

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
      let list: Subject[] = (boot?.subjects || []) as Subject[];
      if (!list || !list.length) {
        const user = cacheGet<any>(CACHE_KEYS.user);
        const addedId = user?.added_course;
        const all: Subject[] = (boot?.subjectsAll || []) as Subject[];
        if (addedId && Array.isArray(all) && all.length) {
          const found = all.find((s) => s.id === addedId);
          list = found ? [found] : [];
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
        // Обновляем локальный список предметов под выбранный курс, чтобы плитка обновилась без перезагрузки
        try {
          const boot: any = (window as any).__exampliBoot || {};
          const all: Subject[] = (boot?.subjectsAll || []) as Subject[];
          const found = all.find((s) => s.code === e.detail?.code);
          if (found) {
            setSubjects([found]);
            // поддержим глобальный снапшот, чтобы другие места видели новый курс
            try { (window as any).__exampliBoot = { ...boot, subjects: [found] }; } catch {}
          }
        } catch {}
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
  const grid = useMemo(() => {
    if (!subjects.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
          Курс не выбран. Нажми «Добавить» ниже.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-3">
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
                setActiveCode(s.code);
                writeActiveToStorage(s.code);
                if (typeof onPicked === 'function') onPicked(s);
                storeSetActiveCourse({ code: s.code, title: s.title });
                const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
                if (tgId) {
                  void supabase.from('users').update({ added_course: s.id }).eq('tg_id', String(tgId));
                }
              }}
              className="relative flex flex-col items-center text-center px-1"
            >
              <div className="relative z-10">
                <div
                  className={[
                    'grid place-items-center rounded-2xl border bg-transparent',
                    active ? 'border-[2px] border-[#3c73ff]' : 'border-white/12',
                  ].join(' ')}
                  style={{ width: 78, height: 56 }}
                >
                  <img
                    src={`/subjects/${s.code}.svg`}
                    alt={s.title}
                    className="w-[72px] h-auto object-contain relative -translate-y-6"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wide mt-1">{s.level}</div>
              <div className="text-sm font-semibold leading-tight line-clamp-2 mt-[2px] max-w-[110px]">{s.title}</div>
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