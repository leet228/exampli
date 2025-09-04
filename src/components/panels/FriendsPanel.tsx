import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { hapticSlideReveal, hapticSlideClose, hapticSelect } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';

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
  const [friends, setFriends] = useState<Array<{ user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url: string | null }>>(() => {
    try {
      const fromBoot = (window as any)?.__exampliBootFriends as any[] | undefined;
      if (Array.isArray(fromBoot) && fromBoot.length) return (fromBoot as any).map((r: any) => ({ ...r, avatar_url: (r as any)?.avatar_url ?? null }));
      const cached = cacheGet<any[]>(CACHE_KEYS.friendsList);
      if (Array.isArray(cached)) return (cached as any).map((r: any) => ({ ...r, avatar_url: (r as any)?.avatar_url ?? null }));
    } catch {}
    return [];
  });
  const [loadingFriends, setLoadingFriends] = useState<boolean>(false);

  // Компоновка «облака иконок» как в профиле
  const iconsCloud = useMemo(() => {
    const rows: { y: number; xs: number[] }[] = [
      { y: 30, xs: [28, 72] },
      { y: 38, xs: [18, 50, 82] },
      { y: 46, xs: [28, 72] },
      { y: 58, xs: [10, 30, 70, 90] },
      { y: 70, xs: [28, 72] },
      { y: 78, xs: [18, 50, 82] },
      { y: 86, xs: [28, 72] },
    ];
    const items: { x: number; y: number; s: number; r: number; o: number }[] = [];
    rows.forEach((row) => {
      row.xs.forEach((x) => { items.push({ x, y: row.y, s: 1, r: 0, o: 0.28 }); });
    });
    return items;
  }, []);

  useEffect(() => {
    if (!open) { setInvitesOpen(false); setInvites([]); }
  }, [open]);

  useEffect(() => { if (open && invitesOpen) void loadInvites(); }, [open, invitesOpen]);
  useEffect(() => { if (open) void loadFriends(); }, [open]);

  async function enrichWithAvatars(rows: Array<{ user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url?: string | null }>): Promise<Array<{ user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url: string | null }>> {
    try {
      const missing = rows.filter(r => !r.avatar_url).map(r => r.user_id);
      if (missing.length) {
        const { data } = await supabase
          .from('users')
          .select('id, avatar_url')
          .in('id', missing as string[]);
        const map = new Map<string, string | null>((data || []).map((u: any) => [String(u.id), (u?.avatar_url as string | null) ?? null]));
        return rows.map(r => ({ ...r, avatar_url: map.get(r.user_id) ?? r.avatar_url ?? null }));
      }
    } catch {}
    return rows.map(r => ({ ...r, avatar_url: r.avatar_url ?? null }));
  }

  async function loadInvites() {
    if (!myId) return;
    setLoadingInv(true);
    try {
      // 1) Пробуем безопасный RPC (обходит RLS)
      const rpc = await supabase.rpc('rpc_friend_incoming', { caller: myId } as any);
      if (!rpc.error && Array.isArray(rpc.data)) {
        const arr = (rpc.data as any[]).map((r) => ({
          other_id: r.other_id || r.friend_id || r.a_id || r.b_id,
          first_name: r.first_name ?? null,
          username: r.username ?? null,
        }));
        setInvites(arr.filter(x => x.other_id && x.other_id !== myId));
        return;
      }
      // 2) Фолбэк на прямой select (если RLS выключен или настроен)
      if (rpc.error) { try { console.warn('rpc_friend_incoming failed', rpc.error); } catch {} }
      const { data: links, error } = await supabase
        .from('friend_links')
        .select('a_id,b_id,requester_id,status')
        .eq('status', 'pending')
        .neq('requester_id', myId)
        .or(`a_id.eq.${myId},b_id.eq.${myId}`)
        .limit(50);
      if (error || !Array.isArray(links)) { if (error) { try { console.warn('select friend_links failed', error); } catch {} } setInvites([]); return; }
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
      if (!error) {
        setInvites(list => list.filter(x => x.other_id !== otherId));
        await loadFriends();
        // кэш исходящих pending очистим для этого пользователя
        try {
          const sent = (cacheGet<Record<string, boolean>>(CACHE_KEYS.friendsPendingSent) || {});
          delete (sent as any)[otherId];
          cacheSet(CACHE_KEYS.friendsPendingSent, sent);
        } catch {}
      }
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

  async function loadFriends() {
    if (!myId) return;
    setLoadingFriends(true);
    try {
      // 1) Пытаемся получить через RPC, чтобы RLS не мешал
      const rpc = await supabase.rpc('rpc_friend_list', { caller: myId } as any);
      if (!rpc.error && Array.isArray(rpc.data)) {
        let rows = (rpc.data as any[]).map((p) => ({
          user_id: p.user_id || p.friend_id,
          first_name: p.first_name ?? null,
          username: p.username ?? null,
          background_color: p.background_color ?? null,
          background_icon: p.background_icon ?? null,
          avatar_url: (p as any)?.avatar_url ?? null,
        }));
        rows = await enrichWithAvatars(rows.filter(r => r.user_id));
        setFriends(rows);
        try { window.dispatchEvent(new CustomEvent('exampli:friendsChanged', { detail: { count: rows.length } })); } catch {}
        return;
      }
      if (rpc.error) { try { console.warn('rpc_friend_list failed', rpc.error); } catch {} }
      // 2) Фолбэк на прямой select (если RLS выключен)
      const { data: links, error } = await supabase
        .from('friend_links')
        .select('a_id,b_id,status')
        .eq('status', 'accepted')
        .or(`a_id.eq.${myId},b_id.eq.${myId}`)
        .limit(200);
      if (error || !Array.isArray(links)) { setFriends([]); return; }
      const ids = Array.from(new Set((links as any[]).map(l => (l.a_id === myId ? l.b_id : l.a_id)).filter(Boolean)));
      // публикуем счётчик для профиля
      try { window.dispatchEvent(new CustomEvent('exampli:friendsChanged', { detail: { count: ids.length } })); } catch {}
      if (!ids.length) { setFriends([]); return; }
      const { data: profs } = await supabase
        .from('user_profile')
        .select('user_id, first_name, username, background_color, background_icon')
        .in('user_id', ids as string[]);
      const byId = new Map<string, any>((profs || []).map(p => [p.user_id, p]));
      let rows = ids.map(id => {
        const p = byId.get(id) || {};
        return {
          user_id: id,
          first_name: p.first_name ?? null,
          username: p.username ?? null,
          background_color: p.background_color ?? null,
          background_icon: p.background_icon ?? null,
          avatar_url: null as string | null,
        };
      });
      rows = await enrichWithAvatars(rows);
      setFriends(rows);
      try { cacheSet(CACHE_KEYS.friendsList, rows); (window as any).__exampliBootFriends = rows; } catch {}
    } finally { setLoadingFriends(false); }
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
        {loadingFriends && <div className="text-sm text-white/70">Загрузка…</div>}
        <div className="flex flex-col gap-3">
          {friends.map((f) => {
            const initials = (f.first_name || f.username || '?').slice(0,1).toUpperCase();
            const iconKey = f.background_icon || 'bg_icon_cat';
            return (
              <div key={f.user_id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div
                  className="relative w-full"
                  style={{ height: 140, background: f.background_color || '#1d2837' }}
                >
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      maskImage: 'radial-gradient(75% 70% at 50% 48%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,0.35) 62%, rgba(0,0,0,0.0) 82%)',
                      WebkitMaskImage: 'radial-gradient(75% 70% at 50% 48%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,0.35) 62%, rgba(0,0,0,0.0) 82%)'
                    }}
                  >
                    {iconsCloud.map((it, i) => (
                      <img
                        key={i}
                        src={`/profile_icons/${iconKey}.svg`}
                        alt=""
                        style={{
                          position: 'absolute',
                          left: `${it.x}%`,
                          top: `${it.y}%`,
                          width: `${24 * it.s}px`,
                          height: `${24 * it.s}px`,
                          opacity: it.o,
                          transform: `translate(-50%, -50%) rotate(${it.r}deg)`,
                          filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))'
                        }}
                      />
                    ))}
                  </div>

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="relative z-[1] w-20 h-20 rounded-full overflow-hidden bg-black/20 border border-white/30 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-lg font-bold text-white/95">{initials}</div>
                      )}
                    </div>
                  </div>

                  {/* Имя по центру, под аватаркой, у нижнего края фона */}
                  <div className="absolute left-1/2 bottom-2 -translate-x-1/2 text-center">
                    <div className="font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>
                      {f.first_name || 'Без имени'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </FullScreenSheet>
  );
}


