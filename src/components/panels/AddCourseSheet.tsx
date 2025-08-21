import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { addUserSubject } from '../../lib/userState';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { hapticTiny, hapticSelect } from '../../lib/haptics';

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
  const [all, setAll] = useState<Subject[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);

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

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Курсы">
      {/* Контент с дополнительным нижним отступом, чтобы не прятался под кнопкой */}
      <div className="space-y-5 pb-44">
        {Object.entries(grouped).map(([level, items]) => (
          <div key={level}>
            <div className="px-1 pb-2 text-xs tracking-wide text-muted uppercase">{level}</div>
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
                    className={`flex items-center justify-between rounded-2xl h-14 px-3 border
                      ${
                        active
                          ? 'border-[var(--accent)] bg-[color:var(--accent)]/10'
                          : 'border-white/10 bg-white/5'
                      }
                    `}
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
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        active ? 'bg-[var(--accent)]' : 'bg-white/20'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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