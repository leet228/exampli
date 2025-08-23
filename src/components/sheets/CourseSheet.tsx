// src/components/panels/TopicsPanel.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticTiny } from '../../lib/haptics';

type Subject = { id: number; code: string; title: string; level: string };

type Props =
  // Режим ПАНЕЛИ (Home.tsx): показываем левую выезжающую панель
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
  const [loading, setLoading] = useState(false);

  // --- helpers ---
  const readActiveFromStorage = useCallback(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  }, []);
  const writeActiveToStorage = useCallback((code: string) => {
    try { localStorage.setItem(ACTIVE_KEY, code); } catch {}
  }, []);

  // Загрузка выбранного курса пользователя из users.added_course
  const loadUserSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!tgId) { setSubjects([]); return; }

      // читаем из кэша, если пусто — берём из базы и пишем в кэш
      let user: any | null = cacheGet<any>(CACHE_KEYS.user);
      if (!user || user.added_course == null) {
        const fresh = await supabase.from('users').select('id, added_course').eq('tg_id', String(tgId)).single();
        user = fresh.data as any;
        if (user) cacheSet(CACHE_KEYS.user, user, 5 * 60_000);
      }
      const addedId = (user as any)?.added_course as number | null | undefined;
      if (!user?.id || !addedId) { setSubjects([]); setActiveCode(null); return; }

      const { data } = await supabase
        .from('subjects')
        .select('id, code, title, level')
        .eq('id', addedId)
        .limit(1);

      const list = (data as Subject[]) || [];
      setSubjects(list);

      // активным становится именно этот добавленный курс
      const code = list[0]?.code || null;
      if (code) { setActiveCode(code); cacheSet(CACHE_KEYS.activeCourseCode, code, 10 * 60_000); }
    } finally {
      setLoading(false);
    }
  }, [readActiveFromStorage]);

  // Когда компонент в режиме левой панели — грузим только когда она открыта
  // Когда это контент для TopSheet — грузим сразу
  useEffect(() => {
    if (typeof open === 'boolean') {
      if (open) void loadUserSubjects();
    } else {
      void loadUserSubjects();
    }
  }, [open, loadUserSubjects]);

  // Слушаем внешние события, чтобы обновиться:
  // - после добавления нового курса (subjectsChanged — если решишь диспатчить)
  // - после переключения/выбора курса (courseChanged — для подсветки)
  useEffect(() => {
    const onSubjectsChanged = () => loadUserSubjects();
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
  }, [loadUserSubjects, writeActiveToStorage]);

  // --- UI блоки ---
  const grid = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>
      );
    }

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
                hapticTiny(); // вибрация кнопки при выборе курса
                setActiveCode(s.code);
                writeActiveToStorage(s.code);
                if (typeof onPicked === 'function') onPicked(s);
                window.dispatchEvent(new CustomEvent('exampli:courseChanged', {
                  detail: { title: s.title, code: s.code },
                }));
              }}
              className={[
                'relative aspect-square rounded-2xl border flex flex-col items-center justify-center text-center px-2 transition',
                active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10',
              ].join(' ')}
            >
              {/* свечащийся маркер активного */}
              <AnimatePresence>
                {active && (
                  <motion.span
                    layoutId="subject-active-glow"
                    className="absolute inset-0 rounded-2xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    style={{ boxShadow: '0 0 0 2px var(--accent), 0 10px 30px rgba(59,130,246,0.35) inset' }}
                  />
                )}
              </AnimatePresence>

              <div className="relative z-10">
                <div className="text-2xl mb-1">📘</div>
                <div className="text-xs font-semibold leading-tight line-clamp-2">{s.title}</div>
                <div className="text-[10px] text-muted mt-0.5">{s.level}</div>
              </div>
            </motion.button>
          );
        })}

        {/* Плитка «+ Добавить» */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            hapticTiny(); // та же вибрация на плюсик
            if (typeof onAddClick === 'function') onAddClick();
            else window.dispatchEvent(new CustomEvent('exampli:addCourse'));
          }}
          className="aspect-square rounded-2xl border border-dashed border-white/15 bg-white/5 hover:bg-white/10 flex items-center justify-center"
        >
          <div className="flex flex-col items-center">
            <div className="text-2xl">＋</div>
            <div className="text-[10px] text-muted mt-1">Добавить</div>
          </div>
        </motion.button>
      </div>
    );
  }, [subjects, activeCode, loading, onPicked, onAddClick, writeActiveToStorage]);

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