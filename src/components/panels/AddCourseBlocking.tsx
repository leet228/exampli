import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { hapticSelect, hapticSlideClose, hapticSlideReveal } from '../../lib/haptics';

type Subject = { id: number; code: string; title: string; level: string };

export default function AddCourseBlocking({ open, onPicked }: { open: boolean; onPicked: (s: Subject) => void }){
  const [all, setAll] = useState<Subject[]>([]);
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});

  useEffect(() => { if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id,code,title,level')
        .order('level', { ascending: true })
        .order('title', { ascending: true });
      setAll((data as Subject[]) || []);
    })();
  }, [open]);

  const grouped = useMemo(() => {
    const by: Record<string, Subject[]> = {};
    for (const s of all) {
      const key = (s.level || 'Другое').toUpperCase();
      (by[key] ||= []).push(s);
    }
    return by;
  }, [all]);

  return (
    <FullScreenSheet open={open} onClose={() => {}} title="Выбери первый курс" useTelegramBack={false} dismissible={false}>
      <div className="space-y-5 px-4 pb-6">
        {Object.entries(grouped).map(([level, items]) => {
          const isOpen = !!openLevels[level];
          return (
            <div key={level} className="space-y-2">
              <button
                type="button"
                onClick={() => { const n = !isOpen; if (n) hapticSlideReveal(); else hapticSlideClose(); setOpenLevels(() => (n ? { [level]: true } : {})); }}
                className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 border ${isOpen ? 'border-[var(--accent)] bg-[color:var(--accent)]/10' : 'border-white/10 bg-white/5'}`}
                aria-expanded={isOpen}
              >
                <span className="text-sm tracking-wide uppercase font-semibold text-white">{level}</span>
                <span className={`transition-transform duration-200 ${isOpen ? 'rotate-90 text-white' : 'text-muted'}`}>▶</span>
              </button>
              {isOpen && (
                <div className="rounded-2xl bg-[#101b20] border border-white/10 p-2">
                  <div className="grid gap-2">
                    {items.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { hapticSelect(); onPicked(s); }}
                        className="w-full flex items-center justify-between rounded-2xl h-14 px-3 border border-white/10 bg-white/5"
                      >
                        <div className="text-left leading-tight">
                          <div className="font-semibold truncate max-w-[60vw]">{s.title}</div>
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FullScreenSheet>
  );
}


