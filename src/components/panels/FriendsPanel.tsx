import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [invitesOpen, setInvitesOpen] = useState<boolean>(false);
  const myId = useMemo(() => {
    try { return (window as any)?.__exampliBoot?.user?.id as string | undefined; } catch { return undefined; }
  }, []);
  const [loadingInv, setLoadingInv] = useState<boolean>(false);
  const [invites, setInvites] = useState<Array<{ other_id: string; first_name: string | null; username: string | null; avatar_url: string | null }>>([]);
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
  const [friendOpen, setFriendOpen] = useState<boolean>(false);
  const [friendView, setFriendView] = useState<{
    user_id: string;
    first_name: string | null;
    username: string | null;
    background_color: string | null;
    background_icon: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [friendStats, setFriendStats] = useState<{
    streak: number;
    coins: number;
    friendsCount: number;
    courseCode: string | null;
    courseTitle: string | null;
    avatar_url?: string | null;
  } | null>(null);

  // Компоновка «облака иконок» как в профиле
  const iconsCloud = useMemo(() => {
    // Чуть больший вертикальный шаг; ряд из 4 иконок на уровне центра аватарки (≈50%)
    const rows: { y: number; xs: number[] }[] = [
      { y: 12, xs: [28, 72] },
      { y: 24, xs: [18, 50, 82] },
      { y: 30, xs: [28, 72] },
      { y: 50, xs: [10, 30, 70, 90] },
      { y: 70, xs: [28, 72] },
      { y: 76, xs: [18, 50, 82] },
      { y: 88, xs: [28, 72] },
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

  useEffect(() => {
    if (open && invitesOpen) {
      // первичная инициализация из boot/cache
      try {
        const boot = (window as any).__exampliBootInvites as any[] | undefined;
        const cached = cacheGet<any[]>(CACHE_KEYS.invitesIncomingList) || [];
        const seed = (Array.isArray(boot) && boot.length ? boot : cached) as any[];
        if (Array.isArray(seed) && seed.length) setInvites(seed as any);
      } catch {}
      void loadInvites();
    }
  }, [open, invitesOpen]);
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

  async function enrichInviteAvatars(rows: Array<{ other_id: string; first_name: string | null; username: string | null; avatar_url?: string | null }>): Promise<Array<{ other_id: string; first_name: string | null; username: string | null; avatar_url: string | null }>> {
    try {
      const ids = Array.from(new Set(rows.map(r => r.other_id).filter(Boolean)));
      if (!ids.length) return rows.map(r => ({ ...r, avatar_url: r.avatar_url ?? null }));
      const { data } = await supabase
        .from('users')
        .select('id, avatar_url')
        .in('id', ids as string[]);
      const map = new Map<string, string | null>((data || []).map((u: any) => [String(u.id), (u?.avatar_url as string | null) ?? null]));
      return rows.map(r => ({ ...r, avatar_url: map.get(r.other_id) ?? r.avatar_url ?? null }));
    } catch {}
    return rows.map(r => ({ ...r, avatar_url: r.avatar_url ?? null }));
  }

  // Высота выпадающей панели приглашений: по числу элементов, но не больше max
  const invitePanelMaxH = 280;
  const inviteRowH = 56;  // h-14
  const inviteGap = 8;    // gap-2
  const invitePadV = 12;  // p-3 (верх/низ по 12)
  const inviteVisibleCount = Math.max(1, invites.length || (loadingInv ? 1 : 0));
  const inviteTargetH = Math.min(
    invitePanelMaxH,
    invitePadV * 2 + inviteVisibleCount * inviteRowH + Math.max(0, inviteVisibleCount - 1) * inviteGap
  );

  async function loadInvites() {
    if (!myId) return;
    setLoadingInv(true);
    try {
      // 1) Пробуем безопасный RPC (обходит RLS)
      const rpc = await supabase.rpc('rpc_friend_incoming', { caller: myId } as any);
      if (!rpc.error && Array.isArray(rpc.data)) {
        let arr = (rpc.data as any[]).map((r) => ({
          other_id: r.other_id || r.friend_id || r.a_id || r.b_id,
          first_name: r.first_name ?? null,
          username: r.username ?? null,
          avatar_url: (r as any)?.avatar_url ?? null,
        }));
        arr = await enrichInviteAvatars(arr.filter(x => x.other_id && x.other_id !== myId));
        setInvites(arr);
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
      let rows = ids.map(id => {
        const p = byId.get(id) || {};
        return { other_id: id, first_name: p.first_name || null, username: p.username || null, avatar_url: null as string | null };
      });
      rows = await enrichInviteAvatars(rows);
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
        // обновим кеш инвайтов и счётчик
        try {
          const rest = (cacheGet<any[]>(CACHE_KEYS.invitesIncomingList) || []).filter((x: any) => x?.other_id !== otherId);
          cacheSet(CACHE_KEYS.invitesIncomingList, rest);
          cacheSet(CACHE_KEYS.invitesIncomingCount, rest.length);
          (window as any).__exampliBootInvites = rest;
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
      // обновим кеш инвайтов и счётчик
      try {
        const rest = (cacheGet<any[]>(CACHE_KEYS.invitesIncomingList) || []).filter((x: any) => x?.other_id !== otherId);
        cacheSet(CACHE_KEYS.invitesIncomingList, rest);
        cacheSet(CACHE_KEYS.invitesIncomingCount, rest.length);
        (window as any).__exampliBootInvites = rest;
      } catch {}
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

  async function openFriendProfile(f: { user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url: string | null }) {
    setFriendView(f);
    setFriendStats(null);
    setFriendOpen(true);
    try {
      const [{ data: urow }, countR] = await Promise.all([
        supabase
          .from('users')
          .select('streak, coins, added_course, avatar_url')
          .eq('id', f.user_id)
          .single(),
        supabase.rpc('rpc_friend_count', { caller: f.user_id } as any),
      ]);
      let courseCode: string | null = null;
      let courseTitle: string | null = null;
      const added = (urow as any)?.added_course as number | null | undefined;
      if (added) {
        try {
          const { data: subj } = await supabase.from('subjects').select('code,title').eq('id', added).single();
          courseCode = (subj as any)?.code ?? null;
          courseTitle = (subj as any)?.title ?? null;
        } catch {}
      }
      setFriendStats({
        streak: Number((urow as any)?.streak ?? 0),
        coins: Number((urow as any)?.coins ?? 0),
        friendsCount: countR && !countR.error ? Number(countR.data || 0) : 0,
        courseCode,
        courseTitle,
        avatar_url: (urow as any)?.avatar_url ?? f.avatar_url ?? null,
      });
    } catch {}
  }

  function closeFriendProfile() {
    setFriendOpen(false);
    setTimeout(() => { setFriendView(null); setFriendStats(null); }, 200);
  }

  function onFriendClick(f: { user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url: string | null }) {
    try { hapticSelect(); } catch {}
    try { (window as any)?.Telegram?.WebApp?.BackButton?.hide?.(); } catch {}
    onClose();
    navigate('/profile');
  }

  return (
    <>
    <FullScreenSheet open={open} onClose={() => { setInvitesOpen(false); onClose(); }} title="Друзья">
      <div className="relative flex flex-col gap-3" style={{ minHeight: '60vh' }}>
        {/* Кнопка «Приглашения» */}
        <button
          type="button"
          onClick={() => setInvitesOpen(v => { if (!v) { try { hapticSlideReveal(); } catch {} } else { try { hapticSlideClose(); } catch {} } return !v; })}
          className="relative w-full flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        >
          <div className="text-sm font-bold text-white">Приглашения</div>
          {/* красный бейдж с количеством */}
          {(() => {
            try {
              const cnt = cacheGet<number>(CACHE_KEYS.invitesIncomingCount) || ((window as any).__exampliBootInvites?.length ?? 0);
              if (!cnt) return null;
              return (
                <span className="absolute right-9 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold">
                  {Math.min(99, cnt)}
                </span>
              );
            } catch { return null; }
          })()}
          <span className="absolute right-4 text-white/80" style={{ transform: invitesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>▾</span>
        </button>

        {/* Выпадающая панель приглашений — компактная, собственный скролл */}
        <AnimatePresence initial={false}>
          {invitesOpen && (
            <motion.div
              key="invites"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: inviteTargetH, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.24 }}
              className="overflow-hidden"
            >
              <div className="h-full rounded-2xl bg-white/5 border border-white/10 p-3 overflow-auto no-scrollbar">
                {loadingInv && <div className="text-sm text-white/70">Загрузка…</div>}
                {!loadingInv && invites.length === 0 && (
                  <div className="text-sm text-white/70">Нет приглашений</div>
                )}
                <div className="flex flex-col gap-2">
                  {invites.map((r) => {
                    const initials = (r.first_name || r.username || '?').slice(0,1).toUpperCase();
                    return (
                      <div key={r.other_id} className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-black/20 border border-white/20 shadow-[0_2px_12px_rgba(0,0,0,0.25)] grid place-items-center">
                            {r.avatar_url ? (
                              <img src={r.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <span className="text-sm font-bold text-white/95">{initials}</span>
                            )}
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
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Список друзей — без заголовка, скроллится вся панель */}
        {loadingFriends && <div className="text-sm text-white/70">Загрузка…</div>}
        <div className="flex flex-col gap-3">
          {friends.map((f) => {
            const initials = (f.first_name || f.username || '?').slice(0,1).toUpperCase();
            const iconKey = f.background_icon || 'bg_icon_cat';
            return (
              <button type="button" onClick={() => onFriendClick(f)} key={f.user_id} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden text-left active:opacity-90">
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
              </button>
            );
          })}
        </div>
      </div>
    </FullScreenSheet>

    {/* Friend Profile Overlay (inside panel) */}
    <AnimatePresence>
      {friendOpen && friendView && (
        <motion.div
          className="absolute inset-0 z-[55]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
          onClick={closeFriendProfile}
        >
          <div className="w-full h-full flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative overflow-hidden rounded-2xl border border-white/10"
              style={{ width: 'min(560px, 96vw)', maxWidth: 620, background: 'var(--bg)' }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              {/* header background like profile */}
              <div className="relative w-full" style={{ height: 280, background: friendView.background_color || '#1d2837' }}>
                <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ maskImage: 'radial-gradient(75% 70% at 50% 48%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,0.35) 62%, rgba(0,0,0,0.0) 82%)', WebkitMaskImage: 'radial-gradient(75% 70% at 50% 48%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,0.35) 62%, rgba(0,0,0,0.0) 82%)' }}>
                  {iconsCloud.map((it, i) => (
                    <img key={i} src={`/profile_icons/${friendView.background_icon || 'bg_icon_cat'}.svg`} alt="" style={{ position: 'absolute', left: `${it.x}%`, top: `${it.y}%`, width: `${24 * it.s}px`, height: `${24 * it.s}px`, opacity: it.o, transform: `translate(-50%, -50%) rotate(${it.r}deg)`, filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' }} />
                  ))}
                </div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="relative z-[1] w-28 h-28 rounded-full overflow-hidden bg-black/20 border border-white/30 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
                    {(friendStats?.avatar_url || friendView.avatar_url) ? (
                      <img src={(friendStats?.avatar_url || friendView.avatar_url) as string} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-3xl font-bold text-white/95">{(friendView.first_name || friendView.username || '?').slice(0,1).toUpperCase()}</div>
                    )}
                  </div>
                </div>
                <div className="absolute left-1/2 bottom-2 -translate-x-1/2 text-center">
                  <div className="font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>
                    {friendView.first_name || 'Без имени'}{friendView.username ? ` (@${friendView.username})` : ''}
                  </div>
                </div>
              </div>

              {/* body */}
              <div className="p-4" style={{ background: 'var(--bg)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="px-1 py-1 flex flex-col items-center justify-center text-center">
                    {friendStats?.courseCode ? (
                      <img src={`/subjects/${friendStats.courseCode}.svg`} alt="Курс" className="w-16 h-16 object-contain" />
                    ) : (
                      <div className="w-16 h-16 grid place-items-center text-2xl">🧩</div>
                    )}
                    <div className="text-sm text-white/80 mt-1 truncate max-w-[160px]">{friendStats?.courseTitle || 'Курс'}</div>
                  </div>
                  <div className="px-1 py-1 flex flex-col items-center justify-center text-center">
                    <div className="text-2xl font-extrabold tabular-nums leading-tight">{friendStats?.friendsCount ?? 0}</div>
                    <div className="text-sm text-white/80 leading-tight mt-1">друзья</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="px-1 py-1 flex items-center gap-3">
                    <img src="/stickers/fire.svg" alt="Стрик" className="w-10 h-10" />
                    <div className="text-2xl font-extrabold tabular-nums">{friendStats?.streak ?? 0}</div>
                    <div className="text-base">{(friendStats?.streak ?? 0) === 1 ? 'день' : 'дней'}</div>
                  </div>
                  <div className="px-1 py-1 flex items-center gap-3 justify-end">
                    <img src="/stickers/coin_cat.svg" alt="coins" className="w-9 h-9" />
                    <div className="text-2xl font-extrabold tabular-nums">{friendStats?.coins ?? 0}</div>
                    <div className="text-base">coin</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

