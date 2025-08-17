import { useEffect, useMemo, useState, useCallback } from 'react';
import FullScreenSheet from '../sheets/FullScreenSheet';
import {
  apiCourses,
  apiAddCourseToUser,
  apiSetCurrentCourse,
  type Course,
} from '../../lib/api';

export default function AddCourseSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (c: Course) => void; // чтобы обновить шапку/дорогу
}) {
  const [all, setAll] = useState<Course[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);

  // Загружаем курсы при открытии
  useEffect(() => {
    if (!open) return;
    (async () => {
      const data = await apiCourses();
      setAll(data || []);
      setPickedId(null);
    })();
  }, [open]);

  // Группировка по level (ЕГЭ / ОГЭ / и т.д.)
  const grouped = useMemo(() => {
    const by: Record<string, Course[]> = {};
    for (const c of all) {
      const key = (c.level || 'Другое').toUpperCase();
      (by[key] ||= []).push(c);
    }
    return by;
  }, [all]);

  const picked = useMemo(
    () => all.find((c) => c.id === pickedId) || null,
    [all, pickedId]
  );

  // Telegram BackButton
  const handleTgBack = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    const back = tg?.BackButton;
    if (!back) return;
    if (open) {
      try {
        back.onClick(handleTgBack);
        back.show();
      } catch {}
      return () => {
        try {
          back.offClick(handleTgBack);
          back.hide();
        } catch {}
      };
    } else {
      try { back.hide(); } catch {}
    }
  }, [open, handleTgBack]);

  const save = async () => {
    if (!picked) return;
    // добавляем курс пользователю и делаем его текущим
    await apiAddCourseToUser({ course_id: picked.id });
    await apiSetCurrentCourse(picked.id);

    // событие для обновления UI
    window.dispatchEvent(
      new CustomEvent('exampli:courseChanged', {
        detail: { id: picked.id, title: picked.title, code: picked.code },
      })
    );

    onAdded(picked);
    onClose();
  };

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Курсы">
      <div className="space-y-5">
        {Object.entries(grouped).map(([level, items]) => (
          <div key={level}>
            <div className="px-1 pb-2 text-xs tracking-wide text-muted uppercase">{level}</div>
            <div className="grid gap-2">
              {items.map((c) => {
                const active = c.id === pickedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPickedId(c.id)}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 border
                      ${active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">📘</div>
                      <div className="text-left">
                        <div className="font-semibold">{c.title}</div>
                        <div className="text-[11px] text-muted">{c.code}{c.level ? ` · ${c.level}` : ''}</div>
                      </div>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-[var(--accent)]' : 'bg-white/20'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-6">
        <button
          type="button"
          disabled={!picked}
          onClick={save}
          className={`w-full rounded-2xl py-4 font-semibold transition
            ${picked ? 'btn' : 'btn-outline opacity-60 cursor-not-allowed'}
          `}
        >
          {picked ? 'Добавить' : 'Выбери курс'}
        </button>
      </div>
    </FullScreenSheet>
  );
}
