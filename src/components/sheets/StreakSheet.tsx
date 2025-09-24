import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import BottomSheet from './BottomSheet';
import { cacheGet, CACHE_KEYS } from '../../lib/cache';
import { supabase } from '../../lib/supabase';

// Контент для верхней шторки HUD и для нижней шторки (переиспользуемый)
export function StreakSheetContent() {
  const [streak, setStreak] = useState(0);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dir, setDir] = useState<1 | -1>(1);
  const [minMonth, setMinMonth] = useState<Date | null>(null);
  const [createdAt, setCreatedAt] = useState<Date | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [monthData, setMonthData] = useState<Record<string, { days: Record<number, 'active' | 'freeze'>; active: number; freeze: number; loaded: boolean }>>({});

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
      if (u?.id) setUserId(String(u.id));
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
      if (typeof e.detail?.last_active_at === 'string') { setLastActiveAt(e.detail.last_active_at); try { void loadMonth(view.getFullYear(), view.getMonth(), true); } catch {} }
    };
    window.addEventListener('exampli:statsChanged', onStatsChanged as EventListener);
    return () => window.removeEventListener('exampli:statsChanged', onStatsChanged as EventListener);
  }, []);

  const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const toIsoDate = (d: Date) => {
    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  async function resolveUserId(): Promise<string | null> {
    if (userId) return userId;
    try {
      const tgId: string | null = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id ? String((window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id) : null;
      if (tgId) {
        const { data } = await supabase.from('users').select('id').eq('tg_id', tgId).maybeSingle();
        const uid = (data as any)?.id ? String((data as any).id) : null;
        if (uid) { setUserId(uid); return uid; }
      }
    } catch {}
    try { const uid = (cacheGet<any>(CACHE_KEYS.user)?.id) || (window as any)?.__exampliBoot?.user?.id || null; if (uid) { setUserId(String(uid)); return String(uid); } } catch {}
    return null;
  }

  async function loadMonth(y: number, m: number, force = false): Promise<void> {
    const key = monthKey(y, m);
    if (!force && monthData[key]?.loaded) return;
    const uid = await resolveUserId(); if (!uid) return;
    const first = new Date(y, m, 1); const last = new Date(y, m + 1, 0);
    const { data } = await supabase
      .from('streak_days')
      .select('day, kind')
      .eq('user_id', uid)
      .gte('day', toIsoDate(first))
      .lte('day', toIsoDate(last));
    const days: Record<number, 'active' | 'freeze'> = {}; let active = 0; let freeze = 0;
    (data || []).forEach((r: any) => {
      const d = new Date(String(r.day)); const dn = d.getDate(); const k = (String(r.kind || '').toLowerCase() === 'freeze') ? 'freeze' : 'active';
      days[dn] = k as any; if (k === 'active') active += 1; else freeze += 1;
    });
    setMonthData(prev => ({ ...prev, [key]: { days, active, freeze, loaded: true } }));
  }

  useEffect(() => { void loadMonth(view.getFullYear(), view.getMonth(), false); }, []);
  useEffect(() => { void loadMonth(view.getFullYear(), view.getMonth(), false); }, [view]);

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
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="flex-1 text-left pl-1">
          <div className="inline-block align-middle">
            <div className="text-[64px] leading-none font-extrabold tabular-nums" style={{ marginLeft: -4 }}>{streak}</div>
            <div className="mt-1 text-base">дней подряд!</div>
          </div>
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
        {(() => {
          const key = `${year}-${String(month + 1).padStart(2, '0')}`;
          const cur = (monthData as any)?.[key] || { active: 0 };
          if (!cur.active) return null;
          const isGood = Number(cur.active) < 10;
          const text = isGood ? 'ХОРОШО' : 'ЗАМЕЧАТЕЛЬНО';
          const color = isGood ? '#f6b73c' : '#22c55e';
          const bg = isGood ? 'rgba(246,183,60,0.15)' : 'rgba(34,197,94,0.15)';
          const brd = isGood ? 'rgba(246,183,60,0.30)' : 'rgba(34,197,94,0.30)';
          return (
            <span className="text-[11px] font-extrabold px-2 py-[2px] rounded-md" style={{ background: bg, color, border: `1px solid ${brd}` }}>{text}</span>
          );
        })()}
      </div>

      {/* Сводки */}
      {(() => { const currentKey = monthKey(year, month); const currentMonth = monthData[currentKey] || { days: {}, active: 0, freeze: 0, loaded: false }; return (
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-2">
          <div className="w-5 h-5 rounded-full" style={{ background: '#f6b73c' }} />
          <div className="text-sm"><span className="font-semibold">{currentMonth.active}</span> дней</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-center gap-2">
          <div className="w-5 h-5 rounded-full" style={{ background: '#5cc8ff' }} />
          <div className="text-sm"><span className="font-semibold">{currentMonth.freeze}</span> заморозок</div>
        </div>
      </div> ); })()}

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
              {/* Соединяющие сегменты */}
              {(() => {
                const currentKey = monthKey(year, month); const currentMonth = monthData[currentKey] || { days: {} } as any;
                const rows: Array<Array<{ day: number | null }>> = []; for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
                const segs: Array<{ row: number; start: number; end: number }> = [];
                rows.forEach((row, rowIdx) => {
                  let start: number | null = null;
                  for (let col = 0; col < row.length; col++) {
                    const d = row[col]?.day; const marked = d != null && !!currentMonth.days[d as number];
                    if (marked && start == null) start = col + 1;
                    const isLast = col === row.length - 1;
                    if ((!marked && start != null) || (marked && isLast)) { const end = (marked && isLast) ? col + 1 : col; if (start <= end) segs.push({ row: rowIdx + 1, start, end }); start = null; }
                  }
                });
                const rowsCount = Math.ceil(cells.length / 7);
                return (
                  <div className="absolute inset-0 grid grid-cols-7 gap-2 pointer-events-none" style={{ gridAutoRows: '2.5rem' }}>
                    {Array.from({ length: rowsCount }).map((_, i) => <div key={`rh-${i}`} className="hidden" />)}
                    {segs.map((s, idx) => (
                      <div key={`seg-${idx}`} className="rounded-xl" style={{ gridColumn: `${s.start} / ${s.end + 1}`, gridRow: s.row, background: 'rgba(246,183,60,0.12)' }} />
                    ))}
                  </div>
                );
              })()}
              {cells.map((c, i) => {
                if (c.day == null) return <div key={`e${i}`} />;
                const d = c.day;
                const isBeforeFirstUse = (() => {
                  if (!createdAt) return false;
                  return createdAt.getFullYear() === year && createdAt.getMonth() === month && d < createdAt.getDate();
                })();
                const currentKey = monthKey(year, month); const currentMonth = monthData[currentKey] || { days: {} } as any;
                const kind = currentMonth.days[d as number] as ('active' | 'freeze' | undefined);
                if (isBeforeFirstUse) return <div key={d} className="h-10 rounded-2xl border border-white/5 flex items-center justify-center text-sm text-white/35">{d}</div>;
                if (kind === 'active') return <div key={d} className="h-10 rounded-2xl border flex items-center justify-center text-sm font-extrabold" style={{ borderColor: 'rgba(246,183,60,0.45)', background: 'rgba(246,183,60,0.16)', color: '#f6b73c' }}>{d}</div>;
                if (kind === 'freeze') return <div key={d} className="h-10 rounded-2xl border flex items-center justify-center text-sm font-extrabold" style={{ borderColor: 'rgba(86,200,255,0.45)', background: 'rgba(86,200,255,0.16)', color: '#5cc8ff' }}>{d}</div>;
                return <div key={d} className="h-10 rounded-2xl border border-white/10 flex items-center justify-center text-sm text-white/90">{d}</div>;
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