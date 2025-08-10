import { useEffect, useMemo, useState } from 'react';
import { getStats } from '../lib/userState';

function useTicker(ms: number) {
  const [, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT(t => t + 1), ms); return () => clearInterval(id); }, [ms]);
}

export default function HUD() {
  const [hearts, setHearts] = useState(5);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [nextAt, setNextAt] = useState<string | null>(null);

  useTicker(1000);

  useEffect(() => {
    (async () => {
      const u = await getStats();
      if (!u) return;
      setHearts(u.hearts ?? 5);
      setXp(u.xp ?? 0);
      setStreak(u.streak ?? 0);
      setNextAt(u.next_heart_at ?? null);
    })();
  }, []);

  const nextIn = useMemo(() => {
    if (!nextAt || hearts >= 5) return '';
    const diff = new Date(nextAt).getTime() - Date.now();
    if (diff <= 0) return 'скоро +1';
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, [nextAt, hearts, Date.now()]);

  return (
    <div className="sticky top-0 z-20 bg-[color:var(--bg)]/80 backdrop-blur pt-3 pb-2">
      <div className="mx-auto max-w-xl px-5">
        <div className="flex items-center justify-between">
          <div className="text-xl font-extrabold">exampli</div>
          <div className="flex items-center gap-3 text-sm">
            <div className="badge">⭐ {xp}</div>
            <div className="badge">🔥 {streak}</div>
            <div className="badge">❤️ {hearts}{nextIn ? ` · ${nextIn}` : ''}</div>
          </div>
        </div>
      </div>
    </div>
  );
}