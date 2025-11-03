import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticSelect, hapticTiny } from '../lib/haptics';
import { cacheGet, CACHE_KEYS, cacheSet } from '../lib/cache';
import { supabase } from '../lib/supabase';

type QuestT = { code: string; difficulty: 'easy'|'medium'|'hard'; title: string; target: number; chest: string };

export default function PostLesson() {
  const navigate = useNavigate();
  const { state } = useLocation() as any;
  const before = (state?.before || null) as any;
  const [step, setStep] = React.useState<'promo'|'streakWeek'|'quests'>('promo');

  // Определяем PLUS
  const isPlus = (() => {
    try { const pu = (cacheGet<any>(CACHE_KEYS.user)?.plus_until) || (window as any)?.__exampliBoot?.user?.plus_until; return Boolean(pu && new Date(String(pu)).getTime() > Date.now()); } catch { return false; }
  })();

  // Вычисляем, был ли стрик уже сегодня ДО урока — по снапшоту до урока
  const hadStreakTodayBefore = React.useMemo(() => {
    try { return Boolean(before?.streakToday); } catch { return false; }
  }, [before]);

  // Проверяем: все ли квесты уже выполнены на текущий момент
  const allQuestsDone = React.useMemo(() => {
    try {
      const meta = cacheGet<any>(CACHE_KEYS.dailyQuests) || { quests: [] };
      const prog = cacheGet<Record<string, any>>(CACHE_KEYS.dailyQuestsProgress) || {};
      const codes: string[] = (Array.isArray(meta.quests) ? meta.quests : []).map((q: any) => String(q.code));
      if (codes.length === 0) return false;
      return codes.every((c) => {
        const p = prog[c];
        const s = String(p?.status || 'in_progress');
        return s === 'completed' || s === 'claimed';
      });
    } catch { return false; }
  }, []);

  // Начальная развилка шагов (возможен мгновенный выход)
  React.useEffect(() => {
    const skipPromo = isPlus;
    if (skipPromo) {
      if (hadStreakTodayBefore) {
        if (allQuestsDone) { navigate('/'); return; }
        setStep('quests');
      } else {
        setStep('streakWeek');
      }
    } else {
      // показываем промо как было
      setStep('promo');
    }
  }, [isPlus, hadStreakTodayBefore, allQuestsDone, navigate]);

  const onAfterPromo = React.useCallback(() => {
    if (hadStreakTodayBefore) {
      if (allQuestsDone) { navigate('/'); return; }
      setStep('quests');
    } else {
      setStep('streakWeek');
    }
  }, [hadStreakTodayBefore, allQuestsDone, navigate]);

  return (
    <div className="fixed inset-0 z-[9999]" style={{ background: 'var(--bg)' }}>
      {step === 'promo' && (
        <PromoPlus onSkip={onAfterPromo} />
      )}
      {step === 'streakWeek' && (
        <StreakWeek
          before={before}
          onContinue={() => { if (allQuestsDone) { navigate('/'); } else { setStep('quests'); } }}
        />
      )}
      {step === 'quests' && (
        <QuestsBlock onDone={() => { try { hapticSelect(); } catch {}; navigate('/'); }} before={before} />
      )}
    </div>
  );
}

function PromoPlus({ onSkip }: { onSkip: () => void }) {
  const navigate = useNavigate();
  const [pct, setPct] = React.useState<number>(0);
  React.useEffect(() => {
    let raf = 0; const start = performance.now();
    const loop = (t: number) => { const p = Math.min(1, (t - start) / 5000); setPct(p); if (p < 1) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ready = pct >= 0.999;
  return (
    <div className="absolute inset-0" style={{ background: '#01347a' }}>
      <img src="/subs/sub_pic.svg" alt="PLUS" className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none" style={{ transform: 'translateY(100px)' }} />
      {!ready && (
        <div className="absolute left-5 w-14 h-14" style={{ top: 120 }}>
          <div className="relative w-14 h-14 rounded-full" style={{ background: `conic-gradient(#fff ${Math.round(pct*360)}deg, rgba(255,255,255,0.25) 0)` }}>
            <div className="absolute inset-1 rounded-full" style={{ background: '#01347a' }} />
          </div>
        </div>
      )}
      {ready && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-28 w-[min(92%,680px)] px-4">
          <PressCta onClick={() => { try { hapticSelect(); } catch {}; navigate('/subscription'); }}>КУПИТЬ ПОДПИСКУ</PressCta>
          <button type="button" className="w-full mt-4 font-extrabold tracking-wider text-[#2f5bff]" onClick={() => { try { hapticTiny(); } catch {}; onSkip(); }} style={{ background: 'transparent' }}>НЕТ СПАСИБО</button>
        </div>
      )}
    </div>
  );
}

function StreakWeek({ before, onContinue }: { before: any; onContinue: () => void }) {
  // Стадии: 1) пауза 3.0с (тряска + tiny); 2) трансформация стрика; 3) слайд вверх + показ недели; 4) подсветка сегодняшнего круга; 5) кнопка
  const [stage, setStage] = React.useState<1|2|3|4|5>(1);
  const [icon, setIcon] = React.useState<string>('/stickers/dead_fire.svg');
  const [num, setNum] = React.useState<number>(0);
  const [skip, setSkip] = React.useState<boolean>(false);
  const startRef = React.useRef<number>(0);
  const WAIT_MS = 3000;

  // Инициализация стартового вида и запуск таймингов — по streak_days
  React.useEffect(() => {
    const yKind = String(before?.yKind || '');
    const prev = Math.max(0, Number(before?.streak ?? 0));
    let startIcon = '/stickers/dead_fire.svg';
    if (yKind === 'active') startIcon = '/stickers/almost_dead_fire.svg';
    else if (yKind === 'freeze') startIcon = '/stickers/frozen_fire.svg';
    setIcon(startIcon); setNum(prev); startRef.current = prev;
    const t = setTimeout(() => setStage(2), WAIT_MS);
    return () => clearTimeout(t);
  }, [before, onContinue]);

  // Во время стадии 1 (3.0с) — тряска и частые tiny-хаптики (~100/сек → ~300 за 3с)
  React.useEffect(() => {
    if (stage !== 1) return;
    const pulses = Math.max(1, Math.round(WAIT_MS / 10));
    const step = Math.max(5, Math.floor(WAIT_MS / pulses));
    let sent = 0;
    const id = setInterval(() => { try { hapticTiny(); } catch {} sent += 1; if (sent >= pulses) clearInterval(id as any); }, step);
    return () => clearInterval(id as any);
  }, [stage]);

  // Стадия 2: трансформация (огонь + инкремент), затем 0.5с пауза → стадия 3
  React.useEffect(() => {
    if (stage !== 2) return;
    setIcon('/stickers/fire.svg');
    const start = startRef.current; const final = Math.max(1, start + 1);
    let frame = 0; const frames = 28; const step = (final - start) / frames;
    const id = setInterval(() => { frame += 1; setNum(frame >= frames ? final : Math.round(start + step*frame)); if (frame >= frames) { clearInterval(id as any); setTimeout(() => setStage(3), 500); } }, 32);
    return () => clearInterval(id as any);
  }, [stage]);
  // Неделя
  const week = React.useMemo(() => {
    try {
      const tz = 'Europe/Moscow';
      const now = new Date();
      const day = now.getDay() || 7; // Mon=1..7
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1));
      const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      const pad = (n: number) => String(n).padStart(2, '0');
      const toIso = (d: Date) => { const p = fmt.formatToParts(d); const y = Number(p.find(x=>x.type==='year')?.value||0); const m = pad(Number(p.find(x=>x.type==='month')?.value||0)); const dd = pad(Number(p.find(x=>x.type==='day')?.value||0)); return `${y}-${m}-${dd}`; };
      const all = (cacheGet<any[]>(CACHE_KEYS.streakDaysAll) || []) as any[];
      const labels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      const days = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const iso = toIso(d);
        const rec = (all || []).find(r => String(r?.day || '') === iso);
        const kind = String(rec?.kind || '');
        return { label: labels[i], iso, kind } as { label: string; iso: string; kind: ''|'active'|'freeze' };
      });
      return days;
    } catch { return Array.from({ length: 7 }).map((_,i)=>({ label: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i], iso: '', kind: '' as any })); }
  }, []);

  const [highlightIdx, setHighlightIdx] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (stage === 3) {
      const t = setTimeout(() => { const now = new Date(); const idx = (now.getDay() || 7) - 1; setHighlightIdx(idx); setStage(4); }, 500); return () => clearTimeout(t);
    }
    if (stage === 4) { const t = setTimeout(() => setStage(5), 500); return () => clearTimeout(t); }
  }, [stage]);

  return (
    <div className="absolute inset-0 grid place-items-center">
      {/* Стрик: показываем и уводим вверх, если не пропускаем */}
      {!skip && (
        <motion.div initial={false} animate={{ y: stage >= 3 ? -140 : 0 }} transition={{ duration: 0.5, ease: 'easeInOut' }} className="flex flex-col items-center gap-6">
          <motion.div
            animate={stage === 1 ? { rotate: [0,-1.5,1.5,-1.5,1.5,0], x: [0,-2,2,-2,2,0], y: [0,1,-1,1,-1,0] } : { rotate: 0, x: 0, y: 0 }}
            transition={{ duration: 0.5, repeat: stage === 1 ? Infinity : 0, repeatType: 'loop', ease: 'easeInOut' }}
            className="flex flex-col items-center gap-6"
          >
            <img src={icon} alt="streak" className="w-40 h-40 select-none" />
            <div className="text-[96px] leading-none font-extrabold tabular-nums" style={{ color: '#fbbf24', textShadow: '0 8px 0 rgba(0,0,0,0.18)' }}>{num}</div>
          </motion.div>
        </motion.div>
      )}
      {/* Неделя */}
      <AnimatePresence>
        {(stage >= 3) && (
          <motion.div key="week" initial={{ y: 180, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="absolute bottom-36">
            <div className="flex items-center justify-center gap-3">
              {week.map((d, i) => {
                const base = d.kind === 'active' ? '#f59e0b' : (d.kind === 'freeze' ? '#60a5fa' : 'rgba(255,255,255,0.15)');
                const active = i === highlightIdx;
                return (
                  <div key={i} className="w-10">
                    <div className="text-center text-[12px] text-white/80 mb-1 font-extrabold">{d.label}</div>
                    <motion.div className="w-10 h-10 rounded-full grid place-items-center" initial={false} animate={{ backgroundColor: active ? '#f59e0b' : base }} transition={{ duration: 0.5 }}>
                      {active || d.kind === 'active' ? '✓' : ''}
                    </motion.div>
                  </div>
                );
              })}
            </div>
            {stage >= 5 && <FixedContinue onClick={() => { try { hapticSelect(); } catch {}; onContinue(); }} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuestsBlock({ onDone, before }: { onDone: () => void; before: any }) {
  const [quests, setQuests] = React.useState<QuestT[]>([]);
  const [progress, setProgress] = React.useState<Record<string, { progress: number; target: number; status: string }>>({});
  const [coins, setCoins] = React.useState<number>(() => { try { return Number(cacheGet<any>(CACHE_KEYS.stats)?.coins || 0); } catch { return 0; } });
  const [revealIdx, setRevealIdx] = React.useState<number>(-1);
  const BAR_MS = 1000; // длительность анимации прогресса одной карточки
  React.useEffect(() => {
    try {
      const meta = cacheGet<any>(CACHE_KEYS.dailyQuests) || { quests: [] };
      const chestByDiff: Record<string, string> = { easy: '/quests/chest1.svg', medium: '/quests/chest2.svg', hard: '/quests/chest3.svg' };
      const list: QuestT[] = (Array.isArray(meta.quests) ? meta.quests : []).map((q: any) => ({ code: String(q.code), difficulty: String(q.difficulty) as any, title: String(q.title || ''), target: Number(q.target || 1), chest: chestByDiff[String(q.difficulty)] || '/quests/chest1.svg' }));
      setQuests(orderByDiff(list));
      const prog = cacheGet<Record<string, any>>(CACHE_KEYS.dailyQuestsProgress) || {};
      const m: any = {}; for (const k of Object.keys(prog)) m[k] = { progress: Number(prog[k]?.progress || 0), target: Number(prog[k]?.target || 1), status: String(prog[k]?.status || 'in_progress') };
      setProgress(m);
    } catch {}
    const id = setTimeout(() => setRevealIdx(0), 500); return () => clearTimeout(id);
  }, []);

  // Подготовим карту наград для квестов, которые стали выполненными ПОСЛЕ урока
  const awardsByCode = React.useMemo(() => {
    const metaBefore = before?.quests || {};
    const awardByDiff: Record<string, number> = { easy: 15, medium: 30, hard: 60 };
    const map: Record<string, number> = {};
    for (const q of quests) {
      const was = metaBefore[q.code];
      const now = progress[q.code];
      const wasDone = was && (String(was.status) === 'completed' || String(was.status) === 'claimed');
      const isDone = now && (String(now.status) === 'completed' || String(now.status) === 'claimed');
      if (!wasDone && isDone) map[q.code] = awardByDiff[q.difficulty] || 0;
    }
    return map;
  }, [quests, progress, before]);

  // Последовательно: бар (во время — многократные tiny) → (если стал completed) select + монеты → следующий
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (revealIdx < 0 || revealIdx >= quests.length) return;
      const current = quests[revealIdx];
      // Пропускаем ТОЛЬКО если задание было выполнено ДО урока (по снапшоту before)
      const was = (before?.quests || {})[current.code] || ({ status: 'in_progress' } as any);
      const wasDoneBefore = String(was.status || '') === 'completed' || String(was.status || '') === 'claimed';
      if (wasDoneBefore) { if (!cancelled) setRevealIdx(i => i + 1); return; }
      // Во время анимации прогресса даём ~10 tiny хаптиков
      const pulses = 10; const step = Math.max(40, Math.floor(BAR_MS / pulses));
      let sent = 0;
      const pulseId = setInterval(() => {
        try { hapticTiny(); } catch {}
        sent += 1; if (sent >= pulses) clearInterval(pulseId as any);
      }, step);
      await new Promise((r) => setTimeout(r, BAR_MS));
      if (cancelled) return;
      const award = current ? (awardsByCode[current.code] || 0) : 0;
      if (award > 0) {
        try { hapticSelect(); } catch {}
        await animateAddCoins(award);
      }
      if (!cancelled) setRevealIdx((i) => i + 1);
    })();
    return () => { cancelled = true; };
  }, [revealIdx, quests, awardsByCode]);

  const animateAddCoins = React.useCallback(async (delta: number) => {
    const start = Number(coins || 0); const end = start + Math.max(0, delta);
    let frame = 0; const frames = 36; const step = (end - start) / frames;
    await new Promise<void>((resolve) => {
      const id = setInterval(() => {
        frame += 1; const val = frame >= frames ? end : Math.round(start + step * frame);
        setCoins(val);
        try { window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { coins: val } } as any)); } catch {}
        if (frame >= frames) { clearInterval(id as any); resolve(); }
      }, 40);
    });
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats) || {}; cacheSet(CACHE_KEYS.stats, { ...cs, coins: end });
      const boot: any = (window as any).__exampliBoot || {}; (window as any).__exampliBoot = { ...boot, stats: { ...(boot?.stats || {}), coins: end } };
    } catch {}
    // Запишем в базу актуальное число монет
    try {
      let uid = (cacheGet<any>(CACHE_KEYS.user)?.id) || null;
      if (!uid) {
        const tg = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
        if (tg) { const { data } = await supabase.from('users').select('id').eq('tg_id', String(tg)).maybeSingle(); uid = (data as any)?.id || null; }
      }
      if (uid) { await supabase.from('users').update({ coins: end }).eq('id', uid as any); }
    } catch {}
  }, [coins]);

  const doneAll = revealIdx >= quests.length;

  return (
    <div className="absolute inset-0">
      {/* Фиксированные монеты сверху справа */}
      <div className="fixed right-4 top-28 z-50">
        <div className="flex items-center gap-1">
          <img src="/stickers/coin_cat.svg" alt="" className="w-6 h-6 select-none" />
          <span className="text-yellow-300 font-extrabold tabular-nums">{coins}</span>
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 pt-60 pb-28 grid gap-8">
        {quests.map((m, i) => {
          const p = progress[m.code] || { progress: 0, target: m.target, status: 'in_progress' };
          const prev = (before?.quests || {})[m.code] || { progress: 0, target: m.target, status: 'in_progress' };
          const max = Math.max(1, Number(p.target || m.target));
          const val = Math.max(0, Math.min(max, Number(p.progress || 0)));
          const prevMax = Math.max(1, Number(prev?.target || m.target));
          const prevVal = Math.max(0, Math.min(prevMax, Number(prev?.progress || 0)));
          const done = (() => { const s = String(p.status || ''); return s === 'completed' || s === 'claimed'; })();
          const openedChest = (() => { try { return String(m.chest).replace(/\.svg$/, '_opened.svg'); } catch { return m.chest; } })();
          const chestSrc = done ? openedChest : m.chest;
          const pct = Math.round((val / max) * 100);
          const prevPct = Math.round((prevVal / prevMax) * 100);
          const isCurrent = i === revealIdx;
          const isRevealed = i < revealIdx;
          return (
            <div key={`quest-${i}`} className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-semibold text-[17px] leading-snug">{m.title}</div>
                  <div className="mt-2 relative h-5 rounded-full bg-white/10 overflow-hidden">
                    {isCurrent ? (
                      <motion.div className="h-full" initial={{ width: `${prevPct}%` }} animate={{ width: `${pct}%` }} transition={{ duration: BAR_MS / 1000, ease: 'easeOut' }} style={{ background: 'linear-gradient(90deg, #86efac 0%, #a3e635 100%)' }} />
                    ) : isRevealed ? (
                      <div className="h-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #86efac 0%, #a3e635 100%)' }} />
                    ) : (
                      <div className="h-full" style={{ width: `${prevPct}%`, background: 'linear-gradient(90deg, #86efac 0%, #a3e635 100%)' }} />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white font-bold">
                      {isCurrent ? (
                        <NumberTween from={prevVal} to={val} max={max} durationMs={BAR_MS} />
                      ) : isRevealed ? (
                        <>{`${val} / ${max}`}</>
                      ) : (
                        <>{`${prevVal} / ${max}`}</>
                      )}
                    </div>
                  </div>
                </div>
                <img src={chestSrc} alt="" className="w-12 h-12" />
              </div>
            </div>
          );
        })}
      </div>
      {doneAll && <FixedContinue onClick={() => onDone()} />}
    </div>
  );
}

function orderByDiff(list: QuestT[]): QuestT[] {
  const order = { easy: 1, medium: 2, hard: 3 } as Record<string, number>;
  return [...list].sort((a, b) => (order[a.difficulty] || 99) - (order[b.difficulty] || 99));
}

function PressCta({ children, onClick, disabled = false }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  const base = '#3c73ff';
  const dark = shade(base, 0.25);
  const press = 6;
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={() => { if (!disabled) { try { hapticSelect(); } catch {} onClick?.(); } }}
      whileTap={{ y: disabled ? 0 : press, boxShadow: disabled ? `0 0 0 0 ${dark}` : `0 0 0 0 ${dark}` }}
      transition={{ duration: 0 }}
      className={`w-full rounded-2xl text-white font-extrabold tracking-wider py-3 text-center ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      style={{ background: base, boxShadow: disabled ? 'none' : `0 ${press}px 0 0 ${dark}` }}
    >
      {children}
    </motion.button>
  );
}

function shade(hex: string, amount: number) {
  try {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
    let r = (num >> 16) & 0xff; let g = (num >> 8) & 0xff; let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r * (1 - amount))));
    g = Math.max(0, Math.min(255, Math.floor(g * (1 - amount))));
    b = Math.max(0, Math.min(255, Math.floor(b * (1 - amount))));
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return hex; }
}

function NumberTween({ from, to, max, durationMs = 1000 }: { from: number; to: number; max: number; durationMs?: number }) {
  const [val, setVal] = React.useState<number>(from);
  React.useEffect(() => {
    const start = Number(from || 0); const end = Number(to || 0);
    if (start === end) { setVal(end); return; }
    let frame = 0; const frames = Math.max(1, Math.round(durationMs / 40)); const step = (end - start) / frames;
    const id = setInterval(() => {
      frame += 1; const next = frame >= frames ? end : Math.round(start + step * frame);
      setVal(next);
      if (frame >= frames) clearInterval(id as any);
    }, 40);
    return () => clearInterval(id as any);
  }, [from, to, durationMs]);
  return <>{`${val} / ${max}`}</> as any;
}

function FixedContinue({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 24px)', width: 'min(92vw, 680px)', zIndex: 50, paddingLeft: 16, paddingRight: 16 }}>
      <PressCta onClick={onClick} disabled={disabled}>ПРОДОЛЖИТЬ</PressCta>
    </div>
  );
}


