// src/pages/Rating.tsx
import { useEffect, useState } from 'react';
import { apiUser, type User } from '../lib/api';
import { apiLeaderboard } from '../lib/api';

type Row = {
  id: number;
  tg_id: string;
  username: string | null;
  first_name: string | null;
  xp: number | null;
  streak: number | null;
};

export default function Rating() {
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      // кто я — для подсветки строки
      const u: User | null = await apiUser();
      if (u?.tg_id) setMe(String(u.tg_id));

      // топ по XP
      try {
        const data = await apiLeaderboard(50);
        setRows(Array.isArray(data) ? data : []);
      } catch {
        setRows([]);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 border border-white/10 bg-white/5">
        <div className="text-xl font-bold flex items-center gap-2">🏆 Рейтинг</div>
        <div className="text-sm text-muted">Топ по XP за всё время</div>
      </div>

      <ul className="grid gap-2">
        {rows.map((r, i) => {
          const meRow = r.tg_id === me;
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
          return (
            <li
              key={r.id}
              className={`rounded-2xl px-4 py-3 border ${
                meRow ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-xl w-6 text-center">{medal}</div>
                  <div className="truncate">
                    <div className="font-semibold truncate">
                      {r.first_name || r.username || 'Без имени'}{' '}
                      {meRow && <span className="text-xs text-muted">(вы)</span>}
                    </div>
                    <div className="text-xs text-muted">
                      🔥 {r.streak ?? 0} · ⭐ {r.xp ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="card">Пусто…</li>}
      </ul>
    </div>
  );
}
