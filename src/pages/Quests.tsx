import React, { useEffect, useState } from 'react';
import { cacheGet, CACHE_KEYS } from '../lib/cache';

function Progress({ value = 0, max = 1 }) {
  const safeMax = Math.max(1, Number(max || 0));
  const pct = Math.max(0, Math.min(100, Math.round((Number(value || 0) / safeMax) * 100)));
  return (
    <div className="relative h-5 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #86efac 0%, #a3e635 100%)' }} />
      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white font-bold">
        {`${value} / ${max}`}
      </div>
    </div>
  );
}

type QuestT = { code: string; difficulty: 'easy'|'medium'|'hard'; title: string; target: number; chest: string };

export default function Quests() {
  const [quests, setQuests] = useState<QuestT[]>([]);
  const [progress, setProgress] = useState<Record<string, { progress: number; target: number; status: string; claimed_at?: string|null }>>({});
  const [timerText, setTimerText] = useState<string>('');
  const [timerColor, setTimerColor] = useState<string>('text-white');

  // Выбираем иконку кота в HUD по выполнению квестов за сегодня (только из кэша/state)
  const catSrc = (() => {
    try {
      const done = { easy: false, medium: false, hard: false } as Record<'easy'|'medium'|'hard', boolean>;
      for (const q of quests) {
        const p = progress[q.code] || { progress: 0, target: q.target, status: 'in_progress' };
        const isDone = String(p.status) === 'completed' || String(p.status) === 'claimed';
        if (isDone) { done[q.difficulty] = true; }
      }
      const e = done.easy, m = done.medium, h = done.hard;
      // Комбинации
      if (e && m && h) return '/quests/quest_cat3.svg'; // нет отдельной 123, покажем «3» как максимально редкую
      if (e && m) return '/quests/quest_cat12.svg';
      if (m && h) return '/quests/quest_cat23.svg';
      if (e && h) return '/quests/quest_cat13.svg';
      if (e) return '/quests/quest_cat1.svg';
      if (m) return '/quests/quest_cat2.svg';
      if (h) return '/quests/quest_cat3.svg';
      return '/quests/quest_cat.svg';
    } catch {
      return '/quests/quest_cat.svg';
    }
  })();

  useEffect(() => {
    // Таймер до полуночи по МСК
    const compute = () => {
      try {
        const now = Date.now();
        const mskOffset = 3 * 60 * 60 * 1000; // UTC+3
        const mskNow = new Date(now + mskOffset);
        const nextMidnightUtc = Date.UTC(mskNow.getUTCFullYear(), mskNow.getUTCMonth(), mskNow.getUTCDate() + 1, 0, 0, 0) - mskOffset;
        const diff = Math.max(0, nextMidnightUtc - now);
        if (diff <= 60 * 60 * 1000) {
          const min = Math.max(0, Math.floor(diff / 60000));
          setTimerText(`${min} мин`);
          setTimerColor('text-red-500');
        } else {
          const hrs = Math.max(0, Math.floor(diff / 3600000));
          setTimerText(`${hrs} ч`);
          setTimerColor(hrs <= 3 ? 'text-red-500' : 'text-white');
        }
      } catch {
        setTimerText('');
        setTimerColor('text-white');
      }
    };
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const meta = cacheGet<any>(CACHE_KEYS.dailyQuests) || { day: null, quests: [] };
      const prog = cacheGet<Record<string, any>>(CACHE_KEYS.dailyQuestsProgress) || {};
      const chestByDiff: Record<string, string> = { easy: '/quests/chest1.svg', medium: '/quests/chest2.svg', hard: '/quests/chest3.svg' };
      const list: QuestT[] = (Array.isArray(meta.quests) ? meta.quests : []).map((q: any) => ({
        code: String(q.code),
        difficulty: String(q.difficulty) as any,
        title: String(q.title || ''),
        target: Number(q.target || 1),
        chest: chestByDiff[String(q.difficulty)] || '/quests/chest1.svg',
      }));
      setQuests(orderByDifficulty(list));
      setProgress(prog || {});
    } catch {}
    const onProg = (e: any) => {
      try {
        // Всегда обновляем метаданные квестов из кэша (могли прийти фоном во время boot)
        const meta = cacheGet<any>(CACHE_KEYS.dailyQuests) || { day: null, quests: [] };
        const chestByDiff: Record<string, string> = { easy: '/quests/chest1.svg', medium: '/quests/chest2.svg', hard: '/quests/chest3.svg' };
        const list: QuestT[] = (Array.isArray(meta.quests) ? meta.quests : []).map((q: any) => ({
          code: String(q.code),
          difficulty: String(q.difficulty) as any,
          title: String(q.title || ''),
          target: Number(q.target || 1),
          chest: chestByDiff[String(q.difficulty)] || '/quests/chest1.svg',
        }));
        setQuests(orderByDifficulty(list));

        // Обновляем прогресс, если он пришёл в событии; иначе синхронизируем из кэша
        const arr = Array.isArray(e?.detail?.updated) ? e.detail.updated : [];
        if (arr.length) {
          setProgress((prev) => {
            const next = { ...prev } as any;
            arr.forEach((p: any) => { next[String(p.code)] = p; });
            return next;
          });
        } else {
          const prog = cacheGet<Record<string, any>>(CACHE_KEYS.dailyQuestsProgress) || {};
          setProgress(prog);
        }
      } catch {}
    };
    window.addEventListener('exampli:dailyQuestsProgress', onProg as EventListener);
    return () => window.removeEventListener('exampli:dailyQuestsProgress', onProg as EventListener);
  }, []);

  return (
    <div>
      {/* Фиксированный зелёный HUD во всю ширину (включая safe-area) */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: 0,
          height: 'calc(var(--hud-top) + var(--hud-h) + 72px)',
          background: 'linear-gradient(180deg, #22c55e 0%, #a3e635 100%)',
          zIndex: 'var(--z-hud)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 'env(safe-area-inset-top)'
        }}
      >
        <img src={catSrc} alt="" style={{ width: '200px', height: 'auto', pointerEvents: 'none', opacity: 0.98, marginTop: 20 }} />
      </div>

      {/* Контент страницы */}
      <div className="max-w-xl mx-auto px-4 pt-28 pb-6 grid gap-6">
        <div>
          {/* Заголовок и таймер */}
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-white/70">ЕЖЕДНЕВНЫЕ ЗАДАНИЯ</div>
            <div className={`text-[12px] font-extrabold ${timerColor}`}>{timerText}</div>
          </div>
          <div className="mt-4" />
          <div className="grid gap-8">
            {quests.map((m, i) => {
              const p = progress[m.code] || { progress: 0, target: m.target, status: 'in_progress' };
              const isMinutes = /minutes_studied/i.test(String((cacheGet<any>(CACHE_KEYS.dailyQuests)?.quests || []).find((q:any)=>q.code===m.code)?.metric_key || ''));
              const rawTarget = Math.max(1, Number(p.target || m.target));
              const max = rawTarget;
              const val = Math.max(0, Math.min(max, Number(p.progress || 0)));
              const timeSec = (() => { try { const map = cacheGet<Record<string, number>>(CACHE_KEYS.dailyQuestsTimeSeconds) || {}; return Number(map[m.code] || (isMinutes ? (val % 60) : 0)); } catch { return 0; } })();
              const done = (() => { const s = String(p.status || ''); return s === 'completed' || s === 'claimed'; })();
              const openedChest = (() => { try { return String(m.chest).replace(/\.svg$/, '_opened.svg'); } catch { return m.chest; } })();
              const chestSrc = done ? openedChest : m.chest;
              return (
              <div key={i} className="">
                <div className="flex items-center gap-3">
                  <div className="flex-1 pr-2">
                    <div className="font-semibold text-[17px] leading-snug">{m.title}</div>
                    <div className="mt-2">
                      {isMinutes ? (
                        <TimeProgress valueMin={Math.floor(val / 60)} valueSec={val % 60} targetMin={Math.floor(max / 60)} />
                      ) : (
                        <Progress value={val} max={max} />
                      )}
                    </div>
                  </div>
                  <img src={chestSrc} alt="" className="w-12 h-12 mt-4" />
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function orderByDifficulty(list: QuestT[]): QuestT[] {
  const order = { easy: 1, medium: 2, hard: 3 } as Record<string, number>;
  return [...list].sort((a, b) => (order[a.difficulty] || 99) - (order[b.difficulty] || 99));
}

function TimeProgress({ valueMin, valueSec, targetMin }: { valueMin: number; valueSec: number; targetMin: number }) {
  const total = Math.max(0, (valueMin || 0) + Math.min(59, valueSec || 0) / 60);
  const pct = Math.max(0, Math.min(100, Math.round((total / Math.max(1, targetMin || 1)) * 100)));
  const disp = `${Math.max(0, Math.floor(valueMin || 0))}:${String(Math.max(0, Math.min(59, valueSec || 0))).padStart(2, '0')} / ${Math.max(1, Math.floor(targetMin || 1))}`;
  return (
    <div className="relative h-5 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #86efac 0%, #a3e635 100%)' }} />
      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white font-bold">
        {disp}
      </div>
    </div>
  );
}
