import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import BottomSheet from './BottomSheet';
import { supabase } from '../../lib/supabase';
import { cacheGet, CACHE_KEYS } from '../../lib/cache';

// Контент для верхней шторки HUD и для нижней шторки (переиспользуемый)
export function StreakSheetContent() {
  const [streak, setStreak] = useState(0);
  const [view, setView] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dir, setDir] = useState<1 | -1>(1);
  const [minMonth, setMinMonth] = useState<Date | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // быстрый снимок из boot-кэша, чтобы число совпадало с HUD
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      if (cs?.streak != null) setStreak(Number(cs.streak));
    } catch {}
    (async () => {
      try {
        const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (!id) return;
        const { data: user } = await supabase
          .from('users')
          .select('streak, created_at')
          .eq('tg_id', String(id))
          .single();
        if (user?.streak != null) setStreak(Number(user.streak));
        if ((user as any)?.created_at) {
          const cd = new Date((user as any).created_at as string);
          setMinMonth(new Date(cd.getFullYear(), cd.getMonth(), 1));
        }
      } catch {}
    })();
  }, []);

  // Конструируем календарь на выбранный месяц (понедельник — первый)
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0).getDate();
  const startIdx = ((first.getDay() + 6) % 7); // 0..6, где 0 = понедельник
  const cells = useMemo(() => {
    const items: Array<{ day: number | null }> = [];
    for (let i = 0; i < startIdx; i++) items.push({ day: null });
    for (let d = 1; d <= last; d++) items.push({ day: d });
    return items;
  }, [startIdx, last]);

  // Название месяца в русской «самостоятельной» форме
  const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthRu = RU_MONTHS[month];

  function addMonths(base: Date, delta: number): Date {
    return new Date(base.getFullYear(), base.getMonth() + delta, 1);
  }

  const canGoPrev = useMemo(() => {
    if (!minMonth) return true;
    const prev = addMonths(view, -1);
    return prev.getTime() >= minMonth.getTime();
  }, [view, minMonth]);

  function goPrev() {
    if (!canGoPrev) return;
    setDir(-1);
    setView((v) => addMonths(v, -1));
  }

  function goNext() {
    setDir(1);
    setView((v) => addMonths(v, 1));
  }

  return (
    <div>
      {/* Верхний блок с числом и иконкой */}
      <div className="flex items-start justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div>
          <div className="text-[64px] leading-none font-extrabold tabular-nums">{streak}</div>
          <div className="-mt-1 text-base">дней подряд!</div>
        </div>
        <img src="/stickers/dead_fire.svg" alt="dead fire" className="w-[112px] h-[112px] opacity-60 select-none" />
      </div>

      {/* Заголовок месяца и бейдж */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            className={["text-white/60 text-xl leading-none", canGoPrev ? '' : 'opacity-30 pointer-events-none'].join(' ')}
            onClick={goPrev}
          >
            ‹
          </button>
          <div className="text-xl font-extrabold">{monthRu} {year}</div>
          <button
            type="button"
            aria-label="Следующий месяц"
            className="text-white/60 text-xl leading-none"
            onClick={goNext}
          >
            ›
          </button>
        </div>
        <span className="text-[11px] font-extrabold bg-yellow-500/15 text-yellow-300 px-2 py-[2px] rounded-md border border-yellow-400/30">ХОРОШО</span>
      </div>

      {/* Сводки */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-2">
          <div className="w-5 h-5 grid place-items-center rounded-full" style={{ background: '#f6b73c', color: '#000' }}>✔</div>
          <div className="text-sm"><span className="font-semibold">0</span> дней</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-2">
          <div className="w-5 h-5 rounded-full" style={{ background: '#5cc8ff' }} />
          <div className="text-sm"><span className="font-semibold">0</span> заморозок</div>
        </div>
      </div>

      {/* Календарь */}
      <div
        className="mt-3 rounded-2xl border border-white/10 p-3 overflow-hidden"
        onPointerDown={(e) => { swipeStart.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const s = swipeStart.current; swipeStart.current = null; if (!s) return;
          const dx = e.clientX - s.x; const dy = e.clientY - s.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) goNext(); else goPrev();
          }
        }}
      >
        <div className="grid grid-cols-7 text-center text-xs text-white/60 mb-2">
          {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div style={{ position: 'relative', height: 'auto' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${year}-${month}`}
              initial={{ x: dir > 0 ? 56 : -56, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir > 0 ? -56 : 56, opacity: 0 }}
              transition={{ duration: .9, ease: [0.22,1,0.36,1] }}
              className="grid grid-cols-7 gap-2"
            >
              {cells.map((c, i) => (
                c.day == null
                  ? <div key={`e${i}`} />
                  : <div key={c.day} className="h-10 rounded-2xl border border-white/10 flex items-center justify-center text-sm text-white/90">{c.day}</div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Обёртка нижней шторкой (совместимо со старым использованием)
export default function StreakSheet({ open, onClose }: { open: boolean; onClose: () => void }){
  return (
    <BottomSheet open={open} onClose={onClose} title="Стрик">
      <StreakSheetContent />
    </BottomSheet>
  );
}