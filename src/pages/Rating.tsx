import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Row = { id: string; username: string|null; first_name: string|null; xp: number|null; streak: number|null; tg_id: string };

export default function Rating() {
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<string|undefined>();

  useEffect(()=> {
    (async()=>{
      const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (tgId) setMe(String(tgId));
      const { data } = await supabase
        .from('users')
        .select('id, tg_id, username, first_name, xp, streak')
        .order('xp', { ascending:false })
        .limit(50);
      setRows((data as any[]) || []);
    })();
  },[]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 border border-white/10 bg-white/5">
        <div className="text-xl font-bold flex items-center gap-2">🏆 Рейтинг</div>
        <div className="text-sm text-muted">Топ по XP за всё время (демо)</div>
      </div>

      <ul className="grid gap-2">
        {rows.map((r, i) => {
          const meRow = r.tg_id === me;
          const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;
          return (
            <li key={r.id} className={`rounded-2xl px-4 py-3 border ${meRow?'border-white/30 bg-white/10':'border-white/10 bg-white/5'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-xl w-6 text-center">{medal}</div>
                  <div className="truncate">
                    <div className="font-semibold truncate">{r.first_name || r.username || 'Без имени'} {meRow && <span className="text-xs text-muted">(вы)</span>}</div>
                    <div className="text-xs text-muted">🔥 {r.streak ?? 0} · ⭐ {r.xp ?? 0}</div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {rows.length===0 && <li className="card">Пусто…</li>}
      </ul>
    </div>
  );
}
