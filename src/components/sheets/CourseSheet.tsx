// src/components/CourseSheet.tsx
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  apiUser,
  apiUserCourses,
  apiSetCurrentCourse,
  type Course,
} from '../../lib/api';

const ACTIVE_ID_KEY = 'exampli:activeCourseId';

type Props = {
  onPicked?: (title: string, course?: Course) => void; // чтобы обновить заголовок HUD
  onAddClick?: () => void;                              // открыть нижнюю шторку добавления
};

export default function CourseSheet({ onPicked, onAddClick }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // загрузка курсов пользователя и определение активного
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [u, list] = await Promise.all([apiUser(), apiUserCourses()]);
        setCourses(list || []);

        // порядок приоритета: LS → users.current_course_id → первый из списка
        let id: number | null = null;
        try {
          const v = localStorage.getItem(ACTIVE_ID_KEY);
          if (v) id = Number(v);
        } catch {}

        if (!id && u?.current_course_id) id = u.current_course_id;
        if (!id && list?.length) id = list[0].id;

        setActiveId(id ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

    if (!courses.length) {
      return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
          Курсы не выбраны. Нажми «Добавить курс» ниже.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-3">
        {courses.map((c) => {
          const active = c.id === activeId;
          return (
            <motion.button
              key={c.id}
              type="button"
              layout
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                setActiveId(c.id);
                try { localStorage.setItem(ACTIVE_ID_KEY, String(c.id)); } catch {}
                await apiSetCurrentCourse(c.id);

                // уведомим остальной UI
                window.dispatchEvent(
                  new CustomEvent('exampli:courseChanged', {
                    detail: { id: c.id, title: c.title, code: c.code },
                  })
                );

                onPicked?.(c.title, c);
              }}
              className={[
                'relative aspect-square rounded-2xl border flex flex-col items-center justify-center text-center px-2 transition',
                active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5 hover:bg-white/10',
              ].join(' ')}
            >
              <AnimatePresence>
                {active && (
                  <motion.span
                    layoutId="course-active-glow"
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
                <div className="text-xs font-semibold leading-tight line-clamp-2">{c.title}</div>
                <div className="text-[10px] text-muted mt-0.5">{c.level}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
    );
  }, [courses, activeId, loading, onPicked]);

  return (
    <div className="pb-1">
      {grid}

      {/* Кнопка «Добавить курс» — откроет нижнюю шторку AddCourseSheet (если проброшен колбэк) */}
      <div className="mt-3">
        <button
          type="button"
          className="btn-outline w-full"
          onClick={() => {
            if (onAddClick) onAddClick();
            else window.dispatchEvent(new CustomEvent('exampli:addCourse'));
          }}
        >
          + Добавить курс
        </button>
      </div>
    </div>
  );
}
