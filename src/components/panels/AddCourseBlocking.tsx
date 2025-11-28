import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { cacheSet, CACHE_KEYS } from '../../lib/cache';
import FullScreenSheet from '../sheets/FullScreenSheet';import { hapticSelect, hapticSlideClose, hapticSlideReveal, hapticTiny } from '../../lib/haptics';
import { setActiveCourse as storeSetActiveCourse } from '../../lib/courseStore';

type Subject = { id: number; code: string; title: string; level: string };
const UPCOMING_CODES = new Set([
  'ege_german',
  'ege_spanish',
  'oge_german',
  'oge_spanish',
  'ege_french',
  'oge_french',
  'oge_literature',
]);

export default function AddCourseBlocking({ open, onPicked }: { open: boolean; onPicked: (s: Subject) => void }){
  const [all, setAll] = useState<Subject[]>([]);
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pressedId, setPressedId] = useState<number | null>(null);
  // Локальный accent (не берём из CSS)
  const accentColor = '#3c73ff';
  const baseDefault = '#22313a';
  const shadowHeight = 6;
  const darken = (hex: string, amount = 18) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };

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
                className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 border ${isOpen ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 bg-white/5'}`}
                aria-expanded={isOpen}
              >
                <span className="text-sm tracking-wide uppercase font-semibold text-white">{level}</span>
                <span className={`transition-transform duration-200 ${isOpen ? 'rotate-90 text-white' : 'text-muted'}`}>▶</span>
              </button>
              {isOpen && (
                <div className="rounded-2xl bg-[#101b20] border border-white/10 p-2">
                  <div className="grid gap-2">
                    {items.map(s => {
                      const codeNormalized = String(s.code || '').toLowerCase();
                      const isUpcoming = UPCOMING_CODES.has(codeNormalized);
                      const imgSrc = `/subjects/${s.code}.svg`;
                      const isSel = !isUpcoming && selectedId === s.id;
                      return (
                        <motion.button
                          key={s.id}
                          type="button"
                          onPointerDown={() => setPressedId(s.id)}
                          onPointerUp={() => setPressedId(null)}
                          onPointerCancel={() => setPressedId(null)}
                          onClick={async () => {
                            if (isUpcoming) {
                              try { hapticTiny(); } catch {}
                              return;
                            }
                            setSelectedId(s.id);
                            hapticSelect();
                            // мгновенно обновим кэш активного курса, UI переключится, а запись в БД сделает onPicked
                            try { localStorage.setItem('exampli:activeSubjectCode', s.code); } catch {}
                            cacheSet(CACHE_KEYS.activeCourseCode, s.code);
                            // Автовыбор первой темы + запись в БД
                            try {
                              const { data: topics } = await supabase
                                .from('topics')
                                .select('id,title')
                                .eq('subject_id', s.id)
                                .order('order_index', { ascending: true })
                                .limit(1);
                              const firstTopic = (topics as any[])?.[0] || null;
                              // persist to users
                              try {
                                const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
                                if (tgId) {
                                  const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(tgId)).single();
                                  if (user?.id) {
                                    await supabase
                                      .from('users')
                                      .update({ added_course: s.id, current_topic: firstTopic?.id ?? null })
                                      .eq('id', user.id);
                                  }
                                }
                              } catch {}
                              // cache local selection for immediate UI
                              try {
                                if (firstTopic?.id) {
                                  localStorage.setItem('exampli:currentTopicId', String(firstTopic.id));
                                  localStorage.setItem('exampli:currentTopicTitle', String(firstTopic.title || ''));
                                }
                              } catch {}
                              // update TopicsButton immediately
                              try {
                                if (firstTopic?.title) window.dispatchEvent(new CustomEvent('exampli:topicBadge', { detail: { topicTitle: firstTopic?.title } } as any));
                              } catch {}
                            } catch {}
                            setTimeout(() => { onPicked(s); storeSetActiveCourse({ code: s.code, title: s.title }); }, 220);
                          }}
                          className={`relative overflow-hidden w-full flex items-center justify-between rounded-2xl h-14 px-3 border ${
                            isSel ? 'bg-white/5' : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                          style={{
                            borderColor: isSel ? accentColor : undefined,
                            backgroundColor: isSel ? 'rgba(60,115,255,0.10)' : undefined,
                          }}
                          animate={{
                            y: pressedId === s.id ? shadowHeight : 0,
                            boxShadow: pressedId === s.id
                              ? `0px 0px 0px ${isSel ? darken(accentColor, 18) : darken(baseDefault, 18)}`
                              : `0px ${shadowHeight}px 0px ${isSel ? darken(accentColor, 18) : darken(baseDefault, 18)}`,
                          }}
                          transition={{ duration: 0 }}
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={imgSrc}
                              alt={s.title}
                              className="w-14 h-14 object-contain shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="text-left leading-tight">
                              <div className="flex items-center gap-2 max-w-[60vw]">
                                <div
                                  className="font-semibold truncate flex-1"
                                  style={{ color: isSel ? accentColor : undefined }}
                                >
                                  {s.title}
                                </div>
                                {isUpcoming && (
                                  <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/40 whitespace-nowrap">
                                    СКОРО
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className={`w-2.5 h-2.5 rounded-full ${isSel ? 'bg-[var(--accent)]' : 'bg-white/20'}`} />

                          {/* subtle selection flash */}
                          {isSel && !isUpcoming && (
                            <motion.span
                              className="absolute inset-0 pointer-events-none"
                              initial={{ backgroundColor: 'rgba(255,255,255,0.0)' }}
                              animate={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                              transition={{ duration: 0.2 }}
                            />
                          )}
                        </motion.button>
                      );
                    })}
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

