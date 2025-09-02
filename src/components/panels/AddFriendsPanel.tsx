import { useEffect, useMemo, useState } from 'react';
import FullScreenSheet from '../sheets/FullScreenSheet';
import BottomSheet from '../sheets/BottomSheet';
import { supabase } from '../../lib/supabase';

type Props = { open: boolean; onClose: () => void };

export default function AddFriendsPanel({ open, onClose }: Props) {
  const myId = useMemo(() => {
    try { return (window as any)?.__exampliBoot?.user?.id as string | undefined; } catch { return undefined; }
  }, []);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [q, setQ] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<Array<{ user_id: string; first_name: string | null; username: string | null }>>([]);
  const [pending, setPending] = useState<Record<string, 'pending' | 'accepted'>>({});

  useEffect(() => {
    if (!open) { setSearchOpen(false); setQ(''); setRows([]); setPending({}); }
  }, [open]);

  async function runSearch(query: string) {
    const term = query.trim();
    if (!term) { setRows([]); return; }
    setLoading(true);
    try {
      const usernameOnly = term.startsWith('@');
      const clean = term.replace(/^@+/, '');
      const q = clean || term;
      let req = supabase.from('user_profile').select('user_id, first_name, username');
      if (usernameOnly) {
        req = req.ilike('username', `%${q}%`);
      } else {
        req = req.or(`username.ilike.%${q}%,first_name.ilike.%${q}%`);
      }
      const { data, error } = await req.limit(20);
      if (!error && Array.isArray(data)) {
        const filtered = data.filter(r => r.user_id && r.user_id !== myId);
        setRows(filtered as any);
      } else {
        setRows([]);
      }
    } finally { setLoading(false); }
  }

  async function sendRequest(targetId: string) {
    try {
      setPending(p => ({ ...p, [targetId]: 'pending' }));
      // Пытаемся вызвать новую сигнатуру (caller, target). Если её нет – откат к старой
      let { error } = await supabase.rpc('rpc_friend_request', { caller: myId, target: targetId } as any);
      if (error) {
        // fallback к старой (только target)
        const r2 = await supabase.rpc('rpc_friend_request', { target: targetId } as any);
        error = r2.error;
      }
      if (error) { console.warn('friend_request failed', error); throw error; }
    } catch {
      setPending(p => { const cp = { ...p }; delete cp[targetId]; return cp; });
    }
  }

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Найди друзей">
      <div className="flex flex-col gap-3">
        {/* Поиск по имени */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <img src="/friends/loupe.svg" alt="Поиск" className="w-10 h-10" />
          <div className="text-left">
            <div className="text-base font-semibold">Поиск по имени</div>
          </div>
        </button>

        {/* Поделиться ссылкой */}
        <button
          type="button"
          className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <img src="/friends/plane.svg" alt="Поделиться" className="w-10 h-10" />
          <div className="text-left">
            <div className="text-base font-semibold">Поделиться ссылкой</div>
          </div>
        </button>

        {/* Шторка поиска снизу */}
        <BottomSheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Поиск по имени">
          <div className="px-1 py-1">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); void runSearch(e.target.value); }}
              placeholder="Введите имя или @username"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 outline-none"
            />
            <div className="mt-3 max-h-[50vh] overflow-auto no-scrollbar flex flex-col gap-2">
              {loading && <div className="text-sm text-white/70">Поиск…</div>}
              {!loading && rows.length === 0 && q.trim() && (
                <div className="text-sm text-white/70">Никого не найдено</div>
              )}
              {rows.map((r) => (
                <div key={r.user_id} className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-sm font-bold">
                      {(r.first_name || r.username || '?').slice(0,1).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <div className="font-semibold">{r.first_name || 'Без имени'}</div>
                      {r.username && <div className="text-sm text-white/70">@{r.username}</div>}
                    </div>
                  </div>
                  <div>
                    {pending[r.user_id] === 'pending' ? (
                      <div className="text-sm text-white/60">Отправлено</div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void sendRequest(r.user_id)}
                        className="px-3 py-1 rounded-xl bg-white/10 border border-white/10 text-sm font-semibold active:opacity-80"
                      >
                        Добавить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </BottomSheet>
      </div>
    </FullScreenSheet>
  );
}


