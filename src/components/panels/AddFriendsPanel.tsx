import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullScreenSheet from '../sheets/FullScreenSheet';
import BottomSheet from '../sheets/BottomSheet';
import { supabase } from '../../lib/supabase';
import { hapticSelect } from '../../lib/haptics';

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
  const [statusById, setStatusById] = useState<Record<string, 'friend'>>({});
  const [toast, setToast] = useState<string | null>(null);

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
        // загрузим статусы для этих пользователей
        try {
          const ids = filtered.map(r => r.user_id) as string[];
          if (ids.length) {
            const l1 = await supabase
              .from('friend_links')
              .select('a_id,b_id,status,requester_id')
              .eq('a_id', myId)
              .in('b_id', ids);
            const l2 = await supabase
              .from('friend_links')
              .select('a_id,b_id,status,requester_id')
              .eq('b_id', myId)
              .in('a_id', ids);
            const all = ([] as any[]).concat(l1.data || [], l2.data || []);
            const map: Record<string, 'friend'> = {};
            all.forEach((ln: any) => {
              const other = ln.a_id === myId ? ln.b_id : ln.a_id;
              if (!other) return;
              if (ln.status === 'accepted' || ln.status === 'pending') map[other] = 'friend';
            });
            setStatusById(map);
          } else {
            setStatusById({});
          }
        } catch {}
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
      setStatusById(s => ({ ...s, [targetId]: 'friend' }));
      setSearchOpen(false);
      setToast('Приглашение отправлено');
      setTimeout(() => setToast(null), 1800);
    } catch {
      setPending(p => { const cp = { ...p }; delete cp[targetId]; return cp; });
    }
  }

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Найди друзей">
      <div className="flex flex-col gap-3">
        {/* Поиск по имени */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => { try { hapticSelect(); } catch {} setSearchOpen(true); }}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <img src="/friends/loupe.svg" alt="Поиск" className="w-10 h-10" />
          <div className="text-left">
            <div className="text-base font-semibold">Поиск по имени</div>
          </div>
        </motion.button>

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
        <BottomSheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Поиск по имени" minHeightVh={70}>
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
                    {pending[r.user_id] === 'pending' || statusById[r.user_id] === 'friend' ? (
                      <div className="text-sm text-white/60">Друг</div>
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
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="fixed left-1/2 -translate-x-1/2 bottom-[90px] px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm"
              style={{ pointerEvents: 'none' }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FullScreenSheet>
  );
}


