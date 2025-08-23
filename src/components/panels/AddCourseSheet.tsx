import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { cacheSet, CACHE_KEYS } from '../../lib/cache';
import { hapticTiny, hapticSelect, hapticSlideReveal, hapticSlideClose } from '../../lib/haptics';
import { setActiveCourse as storeSetActiveCourse } from '../../lib/courseStore';

type Subject = { id: number; code: string; title: string; level: string };

export default function AddCourseSheet({
  open,
  onClose,
  onAdded,
  useTelegramBack = true,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (s: Subject) => void;
  useTelegramBack?: boolean;
}) {
  const [all, setAll] = useState<Subject[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});

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
    // запишем выбранный курс в users.added_course
    const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('tg_id', String(tgId))
        .single();
      if (user?.id) {
        await supabase
          .from('users')
          .update({ added_course: picked.id })
          .eq('id', user.id);
      }
    }

    onAdded(picked);
    onClose();
    // оповестим UI (и сохраним снимок) через store
    window.dispatchEvent(new CustomEvent('exampli:subjectsChanged'));
    storeSetActiveCourse({ code: picked.code, title: picked.title });
    // обновим кеш пользователя (added_course обновился)
    try {
      const prev = JSON.parse(localStorage.getItem('exampli:' + 'user') || '{}');
      const tgId2: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      // записываем только те поля, что нужны потребителям
      localStorage.setItem('exampli:' + 'user', JSON.stringify({ v: { ...(prev?.v||{}), id: (prev?.v?.id||null), added_course: picked.id }, e: Date.now() + 5*60_000 }));
    } catch {}
  };

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Курсы" useTelegramBack={useTelegramBack}>
      {/* Контент с дополнительным нижним отступом, чтобы не прятался под кнопкой */}
      <div className="space-y-5 pb-44 px-4">
        {Object.entries(grouped).map(([level, items]) => {
          const isOpen = !!openLevels[level];
          return (
            <div key={level} className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  const next = !isOpen;
                  if (next) hapticSlideReveal(); else hapticSlideClose();
                  setOpenLevels(() => (next ? { [level]: true } : {}));
                }}
                className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 border ${
                  isOpen ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5'
                }`}
                aria-expanded={isOpen}
              >
                <span className="text-sm tracking-wide uppercase font-semibold text-white">{level}</span>
                <span className={`transition-transform duration-200 ${isOpen ? 'rotate-90 text-white' : 'text-muted'}`}>▶</span>
              </button>

              {isOpen && (
                <div className="rounded-2xl bg-[#101b20] border border-white/10 p-2">
                  <div className="grid gap-2">
                  {items.map((s) => {
                    const active = s.id === pickedId;
                    const imgSrc = `/subjects/${s.code}.svg`;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          hapticSelect();
                          setPickedId(s.id);
                        }}
                        className={`w-full flex items-center justify-between rounded-2xl h-14 px-3 border ${
                          active ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={imgSrc}
                            alt={s.title}
                            className="w-14 h-14 object-contain shrink-0"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div className="text-left leading-tight">
                            <div className="font-semibold truncate max-w-[60vw]">{s.title}</div>
                          </div>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-[var(--accent)]' : 'bg-white/20'}`} />
                      </button>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky CTA: без блюра и прозрачности, фон как у панели */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-[color:var(--surface,#131f24)] border-t border-white/10">
        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+40px)]">
          <button
            type="button"
            disabled={!picked}
            onClick={() => { hapticSelect(); save(); }}
            className={`w-full rounded-2xl py-4 font-semibold transition
              ${picked ? 'btn' : 'bg-[#37464f] text-white/60 cursor-not-allowed'}
            `}
          >
            {picked ? 'Добавить' : 'Выбери курс'}
          </button>
        </div>
      </div>
    </FullScreenSheet>
  );
}