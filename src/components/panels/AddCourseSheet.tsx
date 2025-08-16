// src/components/sheets/AddCourseSheet.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { addUserSubject } from '../../lib/userState';

type Subject = { id: number; code: string; title: string; level: string };

export default function AddCourseSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (s: Subject) => void; // чтобы обновить шапку/дорогу
}) {
  const [all, setAll] = useState<Subject[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);

  // --- Telegram BackButton интеграция ---
  const handleTgBack = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    // Безопасный доступ к Telegram WebApp API
    const tg = (window as any)?.Telegram?.WebApp;
    const back = tg?.BackButton;

    if (open && back) {
      try {
        // навешиваем обработчик один раз на открытие
        back.onClick(handleTgBack);
        back.show();
      } catch {}
    }

    // на закрытие/анмаунт — снимаем обработчик и скрываем
    return () => {
      if (back) {
        try {
          back.offClick(handleTgBack);
          back.hide();
        } catch {}
      }
    };
  }, [open, handleTgBack]);

  // --- загрузка предметов как и раньше ---
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id,code,title,level')
        .order('level', { ascending: true })
        .order('title', { ascending: true });
      setAll((data as Subject[]) || []);
      setPickedId(null);
    })();
  }, [open]);

  const grouped = useMemo(() => {
    const by: Record<string, Subject[]> = {};
    for (const s of all) {
      const key = (s.level || 'Другое').toUpperCase();
      by[key] = by[key] || [];
      by[key].push(s);
    }
    return by;
  }, [all]);

  const picked = useMemo(() => all.find((s) => s.id === pickedId) || null, [all, pickedId]);

  const save = async () => {
    if (!picked) return;
    await addUserSubject(picked.code);
    onAdded(picked);
    onClose();
    window.dispatchEvent(
      new CustomEvent('exampli:courseChanged', {
        detail: { title: picked.title, code: picked.code },
      }),
    );
  };

  // ------------------------------------------------------------
  // ПАНЕЛЬ (full-height) вместо "шторки":
  // ------------------------------------------------------------
  return (
    <>
      {/* Подложка */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Слайдящаяся панель снизу — НА ВЕСЬ ЭКРАН */}
      <section
        className={`fixed inset-x-0 bottom-0 top-0 z-[61] flex flex-col
        transform transition-transform duration-300 will-change-transform
        ${open ? 'translate-y-0' : 'translate-y-full'}
        bg-[color:var(--bg,#0b0b0c)]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-course-title"
      >
        {/* Хедер панели */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[color:var(--bg,#0b0b0c)]">
          {/* Локальная back-кнопка (на случай запуска вне Telegram) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Назад"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <h2 id="add-course-title" className="text-base font-semibold">
            Курсы
          </h2>

          <div className="ml-auto" />

          {/* Кнопка закрытия */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Контент панели */}
        <div className="flex-1 overflow-y-auto px-4 pb-36 pt-4">
          {/* группы: ЕГЭ / ОГЭ */}
          <div className="space-y-5">
            {Object.entries(grouped).map(([level, items]) => (
              <div key={level}>
                <div className="px-1 pb-2 text-xs tracking-wide text-muted uppercase">{level}</div>
                <div className="grid gap-2">
                  {items.map((s) => {
                    const active = s.id === pickedId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setPickedId(s.id)}
                        className={`flex items-center justify-between rounded-2xl px-4 py-3 border
                          ${active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5'}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">📘</div>
                          <div className="text-left">
                            <div className="font-semibold">{s.title}</div>
                            <div className="text-[11px] text-muted">{s.level}</div>
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
        </div>

        {/* Футер с CTA закреплён у низа */}
        <div className="pointer-events-none sticky bottom-0 z-10 mt-auto w-full bg-gradient-to-t from-[color:var(--bg,#0b0b0c)] via-[color:var(--bg,#0b0b0c)]/95 to-transparent">
          <div className="pointer-events-auto px-4 pb-[env(safe-area-inset-bottom)] pt-3">
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
        </div>
      </section>
    </>
  );
}
