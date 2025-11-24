import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { cacheSet, cacheGet, CACHE_KEYS } from '../../lib/cache';
import { hapticTiny, hapticSelect, hapticSlideReveal, hapticSlideClose } from '../../lib/haptics';
import { setActiveCourse as storeSetActiveCourse } from '../../lib/courseStore';
import { precacheTopicsForSubject } from '../../lib/boot';

type Subject = { id: number; code: string; title: string; level: string };
const UPCOMING_CODES = new Set([
  'ege_german',
  'ege_spanish',
  'oge_german',
  'oge_spanish',
  'ege_french',
  'oge_french',
]);

export default function AddCourseSheet({
  open,
  onClose,
  onAdded,
  useTelegramBack = true,
  sideEffects,
  initialOpenLevels,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (s: Subject) => void;
  useTelegramBack?: boolean;
  sideEffects?: boolean;
  initialOpenLevels?: string[];
}) {
  const [all, setAll] = useState<Subject[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [pressedId, setPressedId] = useState<number | null>(null);
  const [ctaPressed, setCtaPressed] = useState<boolean>(false);
  const [openLevels, setOpenLevels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    // сперва пробуем взять из boot/cache
    try {
      const boot: any = (window as any).__exampliBoot;
      const cached = boot?.subjectsAll as Subject[] | undefined;
      if (cached && cached.length) {
        setAll(cached);
        setPickedId(null);
        // Если задан список уровней для предварительного раскрытия — применим
        if (Array.isArray(initialOpenLevels) && initialOpenLevels.length) {
          const map: Record<string, boolean> = {};
          initialOpenLevels.forEach((lvl) => { map[String(lvl).toUpperCase()] = true; });
          setOpenLevels(map);
        }
        return;
      }
    } catch {}
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id,code,title,level')
        .order('level', { ascending: true })
        .order('title', { ascending: true });
      setAll((data as Subject[]) || []);
      setPickedId(null);
      if (Array.isArray(initialOpenLevels) && initialOpenLevels.length) {
        const map: Record<string, boolean> = {};
        initialOpenLevels.forEach((lvl) => { map[String(lvl).toUpperCase()] = true; });
        setOpenLevels(map);
      }
    })();
  }, [open, initialOpenLevels]);

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

  // Локальный accent (не берём из CSS)
  const accentColor = '#3c73ff';
  const shadowHeight = 6;
  const darken = (hex: string, amount = 18) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };
  const baseDefault = '#22313a';
  const hexToRgba = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Retry helper с экспоненциальной задержкой
  const retryWithBackoff = async <T,>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T | null> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === maxRetries - 1) {
          console.warn('[AddCourse] Max retries reached:', err);
          return null;
        }
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  };

  const save = async () => {
    if (!picked) return;
    
    // СРАЗУ обновляем локальный кеш (оптимистично)
    try {
      const prev = JSON.parse(localStorage.getItem('exampli:' + 'user') || '{}');
      localStorage.setItem('exampli:' + 'user', JSON.stringify({ 
        v: { ...(prev?.v||{}), id: (prev?.v?.id||null), added_course: picked.id }, 
        e: null 
      }));
    } catch {}
    
    // запишем выбранный курс в users.added_course и сразу выберем первую тему
    const tgId: number | undefined = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (tgId) {
      // Получаем user с retry
      const userResult = await retryWithBackoff(async () => {
        const { data, error } = await supabase
          .from('users')
          .select('id, plus_until')
          .eq('tg_id', String(tgId))
          .single();
        if (error) throw error;
        return data;
      });
      
      const user = userResult;
      
      if (user?.id) {
        // Сначала пробуем загрузить темы из кеша
        let firstTopic: any = null;
        try {
          const cachedTopics = cacheGet<any[]>(CACHE_KEYS.topicsBySubject(picked.id));
          if (cachedTopics && cachedTopics.length) {
            firstTopic = cachedTopics[0];
          }
        } catch {}
        
        // Если нет в кеше - грузим с сервера с retry
        if (!firstTopic) {
          const topicsResult = await retryWithBackoff(async () => {
            const { data, error } = await supabase
              .from('topics')
              .select('id,title,order_index')
              .eq('subject_id', picked.id)
              .order('order_index', { ascending: true })
              .limit(1);
            if (error) throw error;
            return data;
          });
          firstTopic = (topicsResult as any[])?.[0] || null;
        }
        
        // Параллельно: обновление users + добавление в chosen (если PLUS)
        await Promise.allSettled([
          // Обновить users с retry
          retryWithBackoff(async () => {
            const { error } = await supabase
              .from('users')
              .update({ added_course: picked.id, current_topic: firstTopic?.id ?? null })
              .eq('id', user.id);
            if (error) throw error;
          }),
          
          // Добавить в chosen (если есть PLUS)
          (async () => {
            try {
              const plusActive = Boolean(user?.plus_until && new Date(String(user.plus_until)).getTime() > Date.now());
              if (plusActive) {
                await retryWithBackoff(async () => {
                  const { error } = await supabase.rpc('rpc_chosen_add', { 
                    p_user_id: user.id, 
                    p_subject_id: picked.id 
                  });
                  if (error) throw error;
                });
              }
            } catch {}
          })(),
        ]);
        
        // Загружаем уроки с retry и кешируем
        if (firstTopic?.id) {
          // Сначала пробуем из кеша
          let lessons: any[] = [];
          try {
            const cachedLessons = cacheGet<any[]>(CACHE_KEYS.lessonsByTopic(firstTopic.id));
            if (cachedLessons && cachedLessons.length) {
              lessons = cachedLessons;
            }
          } catch {}
          
          // Если нет - грузим с сервера
          if (!lessons.length) {
            const lessonsResult = await retryWithBackoff(async () => {
              const { data, error } = await supabase
                .from('lessons')
                .select('id, topic_id, order_index')
                .eq('topic_id', firstTopic.id)
                .order('order_index', { ascending: true });
              if (error) throw error;
              return data;
            });
            lessons = (lessonsResult as any[]) || [];
          }
          
          // Кешируем уроки
          try {
            if (lessons.length) {
              cacheSet(CACHE_KEYS.lessonsByTopic(firstTopic.id), lessons as any);
              window.dispatchEvent(new Event('exampli:lessonsChanged'));
            }
          } catch {}
          
          // cache local selection for immediate UI
          try {
            localStorage.setItem('exampli:currentTopicId', String(firstTopic.id));
            localStorage.setItem('exampli:currentTopicTitle', String(firstTopic.title || ''));
          } catch {}
          try {
            window.dispatchEvent(new CustomEvent('exampli:topicBadge', { 
              detail: { topicTitle: firstTopic?.title } 
            } as any));
          } catch {}
        }
      }
    }

    onAdded(picked);
    onClose();
    
    // Сразу обновим глобальный снапшот boot, чтобы шторка курсов увидела новый курс без перезагрузки
    try {
      const boot: any = (window as any).__exampliBoot || {};
      const listAll: Subject[] = (boot?.subjectsAll || []) as Subject[];
      const hasInAll = Array.isArray(listAll) && listAll.some((s) => s.id === picked.id);
      (window as any).__exampliBoot = {
        ...boot,
        subjects: (() => {
          try {
            const current: any[] = Array.isArray(boot?.subjects) ? [...boot.subjects] : [];
            const idx = current.findIndex((s: any) => String(s.id) === String(picked.id));
            if (idx >= 0) {
              const ex = current.splice(idx, 1)[0];
              current.push(ex);
            } else {
              current.push(picked);
              if (current.length > 4) current.splice(0, current.length - 4);
            }
            return current;
          } catch { return [picked]; }
        })(),
        subjectsAll: hasInAll ? listAll : [...(listAll || []), picked],
      };
    } catch {}
    
    // оповестим UI (и сохраним снимок) через store
    window.dispatchEvent(new CustomEvent('exampli:subjectsChanged'));
    storeSetActiveCourse({ code: picked.code, title: picked.title });

    // (сплэш и прогрев теперь вызываются в onClick — здесь не трогаем)
  };

  const portalTarget = (sideEffects === false)
    ? (document.getElementById('prewarm-ac') || null)
    : null; // null => document.body (самый верхний слой)

  return (
    <FullScreenSheet
      open={open}
      onClose={onClose}
      title="Курсы"
      useTelegramBack={useTelegramBack}
      sideEffects={sideEffects ?? false}
      portalTarget={portalTarget}
    >
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
                  isOpen ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 bg-white/5'
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
                    const codeNormalized = String(s.code || '').toLowerCase();
                    const isUpcoming = UPCOMING_CODES.has(codeNormalized);
                    const active = !isUpcoming && s.id === pickedId;
                    const imgSrc = `/subjects/${s.code}.svg`;
                    return (
                      <motion.button
                        key={s.id}
                        type="button"
                        onPointerDown={() => setPressedId(s.id)}
                        onPointerUp={() => setPressedId(null)}
                        onPointerCancel={() => setPressedId(null)}
                        onClick={() => {
                          if (isUpcoming) {
                            try { hapticTiny(); } catch {}
                            return;
                          }
                          hapticSelect();
                          setPickedId(s.id);
                        }}
                        className={`w-full flex items-center justify-between rounded-2xl h-14 px-3 border ${
                          active ? 'bg-white/5' : 'border-white/10 bg-white/5'
                        }`}
                        style={{
                          borderColor: active ? accentColor : undefined,
                          backgroundColor: active ? 'rgba(60, 115, 255, 0.10)' : undefined,
                        }}
                        animate={{
                          y: pressedId === s.id ? shadowHeight : 0,
                          boxShadow: pressedId === s.id
                            ? `0px 0px 0px ${active ? darken(accentColor, 18) : darken(baseDefault, 18)}`
                            : `0px ${shadowHeight}px 0px ${active ? darken(accentColor, 18) : darken(baseDefault, 18)}`,
                        }}
                        transition={{ duration: 0 }}
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
                            <div className="flex items-center gap-2 max-w-[60vw]">
                              <div
                                className="font-semibold truncate flex-1"
                                style={{ color: active ? accentColor : undefined }}
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
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: active ? accentColor : 'rgba(255,255,255,0.2)' }} />
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

      {/* Sticky CTA: без блюра и прозрачности, фон как у панели */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-[var(--surface,#131f24)] border-t border-white/10">
        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+40px)]">
          <motion.button
            type="button"
            disabled={!picked}
            onPointerDown={() => { if (picked) setCtaPressed(true); }}
            onPointerUp={() => setCtaPressed(false)}
            onPointerCancel={() => setCtaPressed(false)}
            onClick={async () => {
              if (!picked) return;
              hapticSelect();
              // показываем сплэш на «отпускание» и блокируем автобут
            try { (window as any).__exampliLoadingSubject = { code: String(picked.code || '').replace(/^(oge_|ege_)/,'').toLowerCase(), title: picked.title }; } catch {}
            try { (window as any).__exampliBootLocked = true; } catch {}
            try { window.dispatchEvent(new Event('exampli:reboot')); } catch {}
              // параллельно: кэш тем/иконок и запись нового курса в БД/лок кэши
              try {
                await Promise.all([
                  precacheTopicsForSubject(picked.id),
                  save(),
                ]);
              } finally {
                // запускаем управляемый boot — Splash закроется сам
                try { window.dispatchEvent(new Event('exampli:startBoot')); } catch {}
              }
            }}
            className="w-full rounded-2xl py-4 font-semibold text-white"
            animate={{
              y: picked && ctaPressed ? shadowHeight : 0,
              boxShadow: picked ? (ctaPressed ? `0px 0px 0px ${darken(accentColor, 18)}` : `0px ${shadowHeight}px 0px ${darken(accentColor, 18)}`) : 'none',
            }}
            transition={{ duration: 0 }}
            style={{
              background: picked ? accentColor : '#37464f',
              border: '1px solid rgba(0,0,0,0.08)',
              color: picked ? '#fff' : 'rgba(255,255,255,0.6)',
              cursor: picked ? 'pointer' : 'not-allowed',
            }}
          >
            {picked ? 'Добавить' : 'Выбери курс'}
          </motion.button>
        </div>
      </div>
    </FullScreenSheet>
  );
}