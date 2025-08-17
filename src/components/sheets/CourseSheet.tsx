'use client';

import { useEffect, useMemo, useState } from 'react';
import BottomSheet from './BottomSheet';
import { AnimatePresence, motion } from 'framer-motion';
import {
  apiCourses,
  apiAddCourseToUser,
  apiSetCurrentCourse,
  type Course,
} from '../../lib/api';

export default function CourseSheet({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (title: string) => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [expanded, setExpanded] = useState<'ОГЭ' | 'ЕГЭ' | null>(null);
  const [selected, setSelected] = useState<Course | null>(null);

  const tg = (typeof window !== 'undefined'
    ? (window as any).Telegram?.WebApp
    : undefined);

  // загрузка курсов из новой БД (таблица courses)
  useEffect(() => {
    if (!open) return;
    (async () => {
      const data = await apiCourses();
      setCourses(Array.isArray(data) ? data : []);
      setSelected(null);
    })();
  }, [open]);

  // Telegram BackButton
  useEffect(() => {
    if (!tg) return;
    if (!open) return;
    tg.BackButton.show();
    const handler = () => onClose();
    tg.onEvent('backButtonClicked', handler);
    return () => {
      tg.offEvent('backButtonClicked', handler);
      tg.BackButton.hide();
    };
  }, [open, onClose, tg]);

  // группировка по уровню (ЕГЭ/ОГЭ)
  const grouped = useMemo(() => {
    const by = (lvl: string) =>
      courses.filter((c) => (c.level || '').toUpperCase().includes(lvl));
    return {
      ОГЭ: by('ОГЭ'),
      ЕГЭ: by('ЕГЭ'),
    };
  }, [courses]);

  async function addSelected() {
    if (!selected) return;
    // добавляем курс пользователю и делаем его текущим
    await apiAddCourseToUser({ course_id: selected.id });
    await apiSetCurrentCourse(selected.id);
    try {
      localStorage.setItem('exampli:activeCourseId', String(selected.id));
    } catch {}
    // уведомим остальной UI
    window.dispatchEvent(
      new CustomEvent('exampli:courseChanged', {
        detail: { id: selected.id, title: selected.title, code: selected.code },
      })
    );
    onPicked(selected.title);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Курсы">
      <div className="space-y-4">
        {(['ОГЭ', 'ЕГЭ'] as const).map((cat) => (
          <CategoryBlock
            key={cat}
            title={cat}
            items={grouped[cat]}
            expanded={expanded === cat}
            onToggle={() => setExpanded(expanded === cat ? null : cat)}
            selectedId={selected?.id ?? null}
            onSelect={(c) => setSelected(c)}
          />
        ))}

        {/* если в обеих группах пусто — мягкая заглушка */}
        {(!grouped.ОГЭ.length && !grouped.ЕГЭ.length) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            Курсы ещё не добавлены.
          </div>
        )}

        {/* CTA */}
        <button
          onClick={addSelected}
          disabled={!selected}
          className={`w-full h-12 rounded-2xl font-semibold transition
            ${selected ? 'bg-blue-500 text-white active:scale-[0.99]' : 'bg-white/10 text-white/60'}
          `}
        >
          ДОБАВИТЬ
        </button>

        {/* “крестик телеги”: закрыть мини-апп при необходимости */}
        <button
          type="button"
          onClick={() => {
            if (tg?.close) tg.close();
            else onClose();
          }}
          className="mx-auto block text-sm text-white/50 hover:text-white"
        >
          Закрыть
        </button>
      </div>
    </BottomSheet>
  );
}

/* ===== Вспомогательный компонент ===== */

type CategoryBlockProps = {
  title: string;
  items: Course[];
  expanded: boolean;
  onToggle: () => void;
  selectedId: number | null;
  onSelect: (c: Course) => void;
};

function CategoryBlock({
  title,
  items,
  expanded,
  onToggle,
  selectedId,
  onSelect,
}: CategoryBlockProps) {
  return (
    <div className="rounded-3xl border border-white/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.06] hover:bg-white/[0.09] text-white"
      >
        <span className="font-semibold">{title}</span>
        <span
          style={{ transition: 'transform .18s' }}
          className="text-white/60"
        >
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="divide-y divide-white/10"
          >
            {items.length === 0 ? (
              <div className="px-4 py-3 text-sm text-white/60">
                Пока нет курсов в этой категории.
              </div>
            ) : (
              items.map((c) => {
                const active = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c)}
                    className={`w-full flex items-center justify-between px-4 py-3 transition
                      ${
                        active
                          ? 'bg-blue-500/10 text-white ring-1 ring-blue-500'
                          : 'text-white/90 hover:bg-white/[0.06]'
                      }
                    `}
                  >
                    <div className="text-left">
                      <div className="font-medium">{c.title}</div>
                      <div className="text-[11px] text-white/50">{c.code}</div>
                    </div>
                    <div className="text-xl">📘</div>
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
