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
  onAdded: (s: Subject) => void;
}) {
  // ВАЖНО: ранний возврат до любых хуков — чтобы порядок хуков не менялся между рендерами
  if (!open) return null;

  const [all, setAll] = useState<Subject[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);

  // Telegram BackButton
  const handleTgBack = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    const back = tg?.BackButton;
    if (!back) return;

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
  }, [handleTgBack]);

  // загрузка предметов при открытии панели
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id,code,title,level')
        .order('level', { ascending: true })
        .order('title', { ascending: true });
      setAll((data as Subject[]) || []);
      setPickedId(null);
    })();
  }, []);

  const grouped = useMemo(() => {
    const by: Record<string, Subject[]> = {};
    for (const s of all) {
      const key = (s.level || 'Другое').toUpperCase();
      (by[key] ||= []).push(s);
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

  return (
    <>
      {/* Подложка (без onClick — закрываем только Telegram BackButton) */}
      <div className="fixed inset-0 z-[60] bg-black/40" aria-hidden="true" />

      {/* Полноэкранная панель */}
      <section
        className="fixed inset-x-0 bottom-0 top-0 z-[61] flex flex-col bg-[color:var(--bg,#0b0b0c)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-course-title"
      >
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-white/10 bg-[color:var(--bg,#0b0b0c)]">
          <h2 id="add-course-title" className="text-base font-semibold">
            Курсы
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-36 pt-4">
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
