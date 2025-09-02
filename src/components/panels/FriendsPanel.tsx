import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { hapticSlideReveal, hapticSlideClose, hapticSelect } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FriendsPanel({ open, onClose }: Props) {
  const [invitesOpen, setInvitesOpen] = useState<boolean>(false);
  const myId = useMemo(() => {
    try { return (window as any)?.__exampliBoot?.user?.id as string | undefined; } catch { return undefined; }
  }, []);
  const [loadingInv, setLoadingInv] = useState<boolean>(false);
  const [invites, setInvites] = useState<Array<{ other_id: string; first_name: string | null; username: string | null }>>([]);

  useEffect(() => {
    if (!open) { setInvitesOpen(false); setInvites([]); }
  }, [open]);

  useEffect(() => { if (open && invitesOpen) void loadInvites(); }, [open, invitesOpen]);

  async function loadInvites() {
    if (!myId) return;
    setLoadingInv(true);
    try {
      const { data: links, error } = await supabase
        .from('friend_links')
        .select('a_id,b_id,requester_id,status')
        .eq('status', 'pending')
        .neq('requester_id', myId)
        .or(`a_id.eq.${myId},b_id.eq.${myId}`)
        .limit(50);
      if (error || !Array.isArray(links)) { setInvites([]); return; }
      const ids = Array.from(new Set((links as any[]).map(l => (l.a_id === myId ? l.b_id : l.a_id)).filter(Boolean)));
      if (!ids.length) { setInvites([]); return; }
      const { data: profs } = await supabase
        .from('user_profile')
        .select('user_id, first_name, username')
        .in('user_id', ids as string[]);
      const byId = new Map<string, any>((profs || []).map(p => [p.user_id, p]));
      const rows = ids.map(id => {
        const p = byId.get(id) || {};
        return { other_id: id, first_name: p.first_name || null, username: p.username || null };
      });
      setInvites(rows);
    } finally { setLoadingInv(false); }
  }

  async function accept(otherId: string) {
    try {
      hapticSelect();
      // двухпараметровая сигнатура (caller, other_id) → fallback в одно-арг
      let { error } = await supabase.rpc('rpc_friend_accept', { other_id: otherId, caller: myId } as any);
      if (error) { const r2 = await supabase.rpc('rpc_friend_accept', { other_id: otherId } as any); error = r2.error; }
      if (!error) setInvites(list => list.filter(x => x.other_id !== otherId));
    } catch {}
  }

  async function decline(otherId: string) {
    try {
      hapticSelect();
      let { error } = await supabase.rpc('rpc_friend_remove', { other_id: otherId, caller: myId } as any);
      if (error) { const r2 = await supabase.rpc('rpc_friend_remove', { other_id: otherId } as any); error = r2.error; }
      if (!error) setInvites(list => list.filter(x => x.other_id !== otherId));
    } catch {}
  }

  return (
    <FullScreenSheet open={open} onClose={() => { setInvitesOpen(false); onClose(); }} title="Друзья">
      <div className="flex flex-col gap-3" style={{ minHeight: '60vh' }}>
        {/* Кнопка «Приглашения» */}
        <button
          type="button"
          onClick={() => setInvitesOpen(v => { if (!v) { try { hapticSlideReveal(); } catch {} } else { try { hapticSlideClose(); } catch {} } return !v; })}
          className="w-full flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <div className="text-sm font-bold text-white">Приглашения</div>
          <span className="text-white/80" style={{ transform: invitesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>▾</span>
        </button>

        {/* Выпадающая панель приглашений — компактная, собственный скролл */}
        <AnimatePresence initial={false}>
          {invitesOpen && (
            <motion.div
              key="invites"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 280, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.24 }}
              className="overflow-hidden"
            >
              <div className="h-[280px] rounded-2xl bg-white/5 border border-white/10 p-3 overflow-auto no-scrollbar">
                {loadingInv && <div className="text-sm text-white/70">Загрузка…</div>}
                {!loadingInv && invites.length === 0 && (
                  <div className="text-sm text-white/70">Нет приглашений</div>
                )}
                <div className="flex flex-col gap-2">
                  {invites.map((r) => (
                    <div key={r.other_id} className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-sm font-bold">
                          {(r.first_name || r.username || '?').slice(0,1).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <div className="font-semibold">{r.first_name || 'Без имени'}</div>
                          {r.username && <div className="text-sm text-white/70">@{r.username}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void accept(r.other_id)}
                          className="px-3 py-1 rounded-lg bg-green-600/70 text-white text-sm font-semibold active:opacity-80"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => void decline(r.other_id)}
                          className="px-3 py-1 rounded-lg bg-red-600/70 text-white text-sm font-semibold active:opacity-80"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Список друзей — без контейнера с собственным скроллом: скроллится вся панель */}
        <div className="text-base font-bold text-white mb-2">Друзья</div>
        <div className="flex flex-col gap-2" />
      </div>
    </FullScreenSheet>
  );
}


