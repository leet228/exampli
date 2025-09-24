import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import BottomSheet from './BottomSheet';
import { cacheGet, CACHE_KEYS } from '../../lib/cache';

// Контент для верхней шторки HUD и для нижней шторки (переиспользуемый)
export function StreakSheetContent() {
  const [streak, setStreak] = useState(0);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [view, setView] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dir, setDir] = useState<1 | -1>(1);
  const [minMonth, setMinMonth] = useState<Date | null>(null);
  const [createdAt, setCreatedAt] = useState<Date | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // быстрый снимок из boot-кэша, чтобы число совпадало с HUD
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats);
      if (cs?.streak != null) setStreak(Number(cs.streak));
    } catch {}
    // last_active_at и timezone из boot user-кэша
    try {
      const u = cacheGet<any>(CACHE_KEYS.user) || (window as any)?.__exampliBoot?.user || null;
      if (u?.last_active_at) setLastActiveAt(String(u.last_active_at));
      if (u?.timezone) setTimezone(String(u.timezone));
    } catch {}
    // created_at тоже берём из boot/user кэша (без запросов к БД)
    try {
      const u = cacheGet<any>(CACHE_KEYS.user) || (window as any)?.__exampliBoot?.user || null;
      if (u?.created_at) {
        const cd = new Date(String(u.created_at));
        setCreatedAt(cd);
        setMinMonth(new Date(cd.getFullYear(), cd.getMonth(), 1));
      }
    } catch {}
  }, []);

  // Реакция на обновление статы в рантайме (после прохождения урока)
  useEffect(() => {
    const onStatsChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ streak?: number; last_active_at?: string } & Record<string, any>>;
      if (typeof e.detail?.streak === 'number') setStreak(e.detail.streak);
      if (typeof e.detail?.last_active_at === 'string') setLastActiveAt(e.detail.last_active_at);
    };
    window.addEventListener('exampli:statsChanged', onStatsChanged as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onStatsChanged as EventListener);
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
        {(() => {
          const s = Number(streak || 0);
          let icon = '/stickers/dead_fire.svg';
          if (s > 0) {
            const toParts = (d: Date | null) => {
              if (!d) return null;
              try {
                const fmt = new Intl.DateTimeFormat((timezone || undefined) as any, { timeZone: (timezone || undefined) as any, year: 'numeric', month: 'numeric', day: 'numeric' });
                const parts = fmt.formatToParts(d);
                const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
                const m = Number(parts.find(p => p.type === 'month')?.value || NaN) - 1;
                const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
                if ([y, m, dd].some(n => !Number.isFinite(n))) return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
                return { y, m, d: dd };
              } catch { return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; }
            };
            const now = new Date();
            const la = lastActiveAt ? new Date(String(lastActiveAt)) : null;
            const tp = toParts(now)!;
            const lp = toParts(la);
            const todayStart = new Date(tp.y, tp.m, tp.d).getTime();
            const lastStart = lp ? new Date(lp.y, lp.m, lp.d).getTime() : null;
            const diffDays = (lastStart == null) ? Infinity : Math.round((todayStart - lastStart) / 86400000);
            if (diffDays <= 1) icon = '/stickers/fire.svg';
            else if (diffDays === 2) icon = '/stickers/ice_version.svg';
            else icon = '/stickers/dead_fire.svg';
          }
          return <img src={icon} alt="streak" className="w-[112px] h-[112px] opacity-60 select-none" />;
        })()}
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
          <div className="w-5 h-5 rounded-full" style={{ background: '#f6b73c' }} />
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
          if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy)) {
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
          <AnimatePresence custom={dir} initial={false} mode="wait">
            <motion.div
              key={`${year}-${month}`}
              custom={dir}
              variants={{
                enter: (d: 1 | -1) => ({ x: d > 0 ? '100%' : '-100%' }),
                center: { x: 0 },
                exit: (d: 1 | -1) => ({ x: d > 0 ? '-100%' : '100%' }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: [0.22,1,0.36,1] }}
              className="grid grid-cols-7 gap-2"
            >
              {cells.map((c, i) => {
                if (c.day == null) return <div key={`e${i}`} />;
                const d = c.day;
                const isBeforeFirstUse = (() => {
                  if (!createdAt) return false;
                  return createdAt.getFullYear() === year && createdAt.getMonth() === month && d < createdAt.getDate();
                })();
                const cls = isBeforeFirstUse
                  ? 'h-10 rounded-2xl border border-white/5 flex items-center justify-center text-sm text-white/35'
                  : 'h-10 rounded-2xl border border-white/10 flex items-center justify-center text-sm text-white/90';
                return <div key={d} className={cls}>{d}</div>;
              })}
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