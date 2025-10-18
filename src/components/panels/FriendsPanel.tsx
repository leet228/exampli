import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FullScreenSheet from '../sheets/FullScreenSheet';
import { hapticSlideReveal, hapticSlideClose, hapticSelect } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';

function AchBadge({ img, value, stroke, fill, width = 96, bottomOffset = 0 }: { img: string; value: number; stroke: string; fill: string; width?: number; bottomOffset?: number }) {
  const safe = Math.max(0, Number(value || 0));
  const str = String(safe);
  const size = str.length >= 3 ? 28 : (str.length === 2 ? 30 : 34);
  return (
    <div className="relative select-none" style={{ width }}>
      <img src={img} alt="" className="block object-contain" style={{ width, height: width }} />
      <div
        className="absolute left-1/2 -translate-x-1/2 font-extrabold tabular-nums"
        style={{
          bottom: -18 + bottomOffset,
          fontSize: size,
          color: fill,
          WebkitTextStrokeWidth: '4px',
          WebkitTextStrokeColor: stroke,
          textShadow: '0 1px 0 rgba(0,0,0,0.08)'
        }}
      >
        {str}
      </div>
    </div>
  );
}

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
  const [friends, setFriends] = useState<Array<{ user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url: string | null; plus_until?: string | null }>>(() => {
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
    max_streak?: number | null;
    perfect_lessons?: number | null;
    duel_wins?: number | null;
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

  async function enrichWithAvatars(rows: Array<{ user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url?: string | null }>): Promise<Array<{ user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url: string | null; plus_until?: string | null }>> {
    try {
      const missing = rows.map(r => r.user_id);
      if (missing.length) {
        const { data } = await supabase
          .from('users')
          .select('id, avatar_url, plus_until')
          .in('id', missing as string[]);
        const map = new Map<string, { avatar_url: string | null; plus_until: string | null }>((data || []).map((u: any) => [String(u.id), { avatar_url: (u?.avatar_url as string | null) ?? null, plus_until: (u?.plus_until as string | null) ?? null }]));
        return rows.map(r => ({ ...r, avatar_url: (map.get(r.user_id)?.avatar_url ?? r.avatar_url ?? null) as string | null, plus_until: map.get(r.user_id)?.plus_until ?? null }));
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
      // DEMO short-circuit: если есть предзагруженные друзья в boot — используем их без сетевых запросов
      try {
        const demoSeed = (window as any).__exampliBootFriends as any[] | undefined;
        if (Array.isArray(demoSeed) && demoSeed.length) {
          const rows = await enrichWithAvatars(
            (demoSeed as any[]).map((p: any) => ({
              user_id: p.user_id,
              first_name: p.first_name ?? null,
              username: p.username ?? null,
              background_color: p.background_color ?? null,
              background_icon: p.background_icon ?? null,
              avatar_url: p.avatar_url ?? null,
            }))
          );
          setFriends(rows);
          try { window.dispatchEvent(new CustomEvent('exampli:friendsChanged', { detail: { count: rows.length } })); } catch {}
          return;
        }
      } catch {}
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
      // cache-first: сливаем с кэшем friends_list
      const cachedList = (cacheGet<any[]>(CACHE_KEYS.friendsList) || []) as any[];
      const cached = cachedList.find(r => String(r.user_id) === String(f.user_id)) || null;
      const [countR, urow] = await Promise.all([
        supabase.rpc('rpc_friend_count', { caller: f.user_id } as any),
        cached ? Promise.resolve({ data: cached }) : supabase
          .from('users')
          .select('streak, coins, added_course, avatar_url, max_streak, perfect_lessons, duel_wins')
          .eq('id', f.user_id)
          .single(),
      ]);
      let courseCode: string | null = null;
      let courseTitle: string | null = null;
      const added = ((urow as any)?.added_course ?? (cached as any)?.added_course) as number | null | undefined;
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
        max_streak: (urow as any)?.max_streak ?? null,
        perfect_lessons: (urow as any)?.perfect_lessons ?? null,
        duel_wins: (urow as any)?.duel_wins ?? null,
      });
    } catch {}
  }

  function closeFriendProfile() {
    try { hapticSlideClose(); } catch {}
    setFriendOpen(false);
    setTimeout(() => { setFriendView(null); setFriendStats(null); }, 200);
  }

  // Когда открыт профиль друга — отключаем прокрутку фона (страницы/панели)
  useEffect(() => {
    if (!friendOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.documentElement.style.overscrollBehavior as string;
    try {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
    } catch {}
    return () => {
      try {
        document.body.style.overflow = prevOverflow;
        document.documentElement.style.overscrollBehavior = prevOverscroll || '';
      } catch {}
    };
  }, [friendOpen]);

  function onFriendClick(f: { user_id: string; first_name: string | null; username: string | null; background_color: string | null; background_icon: string | null; avatar_url: string | null }) {
    try { hapticSelect(); } catch {}
    // Сначала открываем локальный оверлей в панели для красивой анимации
    void openFriendProfile(f);
    // Сразу закрываем панель и переходим в профиль
    try { (window as any)?.Telegram?.WebApp?.BackButton?.hide?.(); } catch {}
    onClose();
    navigate('/profile');
  }

  return (
    <>
    <FullScreenSheet open={open} onClose={() => { setInvitesOpen(false); onClose(); }} title="Друзья">
      <div className="relative flex flex-col gap-3" style={{ minHeight: '60vh' }}>
        {/* Кнопка «Приглашения» */}
        <PressButton
          onClick={() => setInvitesOpen(v => { if (!v) { try { hapticSlideReveal(); } catch {} } else { try { hapticSlideClose(); } catch {} } return !v; })}
          className="relative w-full flex items-center justify-center rounded-2xl px-4 py-3"
          baseColor="#2a3944"
          background="rgba(255,255,255,0.05)"
          borderColor="rgba(255,255,255,0.10)"
          textColor="#ffffff"
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
        </PressButton>

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
                          <PressButton
                            onClick={() => void accept(r.other_id)}
                            className="px-3 py-1 rounded-lg text-white text-sm font-semibold"
                            baseColor="#16a34a"
                          >
                            ✓
                          </PressButton>
                          <PressButton
                            onClick={() => void decline(r.other_id)}
                            className="px-3 py-1 rounded-lg text-white text-sm font-semibold"
                            baseColor="#dc2626"
                          >
                            ✕
                          </PressButton>
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
              <PressButton
                key={f.user_id}
                onClick={() => onFriendClick(f)}
                className="rounded-2xl overflow-hidden text-left"
                baseColor={f.background_color || '#1d2837'}
                background="rgba(255,255,255,0.05)"
                borderColor="rgba(255,255,255,0.10)"
                textColor="#ffffff"
              >
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
                      {(() => {
                        // проверяем плюс напрямую по users.plus_until, подтягивается в enrichWithAvatars
                        try {
                          const hasPlus = Boolean(f?.plus_until ? (new Date(String(f.plus_until)).getTime() > Date.now()) : false);
                          if (hasPlus) {
                            return (
                              <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  zIndex: -1,
                                  left: '-18px',
                                  top: '-18px',
                                  width: 'calc(100% + 36px)',
                                  height: 'calc(100% + 36px)',
                                  borderRadius: '9999px',
                                  background: 'conic-gradient(#22e3b1, #3c73ff, #d45bff, #22e3b1)',
                                  WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0) 80%)',
                                  maskImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0) 80%)',
                                }}
                              />
                            );
                          }
                        } catch {}
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Имя по центру, под аватаркой, у нижнего края фона */}
                  <div className="absolute left-1/2 bottom-2 -translate-x-1/2 text-center">
                    <div className="font-semibold text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>
                      {f.first_name || 'Без имени'}
                    </div>
                  </div>
                </div>
              </PressButton>
            );
          })}
        </div>
      </div>
    </FullScreenSheet>

    {/* Friend Profile Overlay (inside panel) */}
    {createPortal(
      (
        <AnimatePresence>
        {friendOpen && friendView && (
        <motion.div
          className="fixed inset-0 z-[1000]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }}
          onClick={closeFriendProfile}
        >
          <div className="w-full h-full flex items-center justify-center p-4" style={{ overflow: 'hidden', touchAction: 'none' }}>
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
                  </div>
                  <div className="px-1 py-1 flex items-center gap-3 justify-end">
                    <img src="/stickers/coin_cat.svg" alt="coins" className="w-9 h-9" />
                    <div className="text-2xl font-extrabold tabular-nums">{friendStats?.coins ?? 0}</div>
                  </div>
                </div>

              {/* Достижения друга */}
              <div className="mt-4">
                <div className="flex items-end justify-evenly gap-2">
                  <AchBadge img="/profile/streak_ach.svg" value={Math.max(0, Number((friendStats?.max_streak ?? friendStats?.streak ?? 0)))} stroke="#612300" fill="#9d4106" />
                  <AchBadge img="/profile/perfect_ach.svg" value={Math.max(0, Number(friendStats?.perfect_lessons ?? 0))} stroke="#066629" fill="#1fb75b" />
                  <AchBadge img="/profile/duel_ach.svg" value={Math.max(0, Number(friendStats?.duel_wins ?? 0))} stroke="#ff9803" fill="#b35102" />
                </div>
              </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
        )}
        </AnimatePresence>
      ), document.body)}
    </>
  );
}

function PressButton({
  className = '',
  baseColor,
  background,
  borderColor,
  textColor,
  onClick,
  children,
}: {
  className?: string;
  baseColor: string; // основной цвет для тени
  background?: string;
  borderColor?: string;
  textColor?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const shadowHeight = 6;
  // Разбор цвета: поддержка hex, rgb/rgba, а также linear-gradient(...) — берём последний цвет-стоп
  function pickColorToken(input: string): string {
    try {
      if (!input) return '#1d2837';
      const s = String(input).trim();
      const re = /#(?:[0-9a-fA-F]{3}){1,2}|rgba?\([^\)]+\)/g;
      if (s.startsWith('linear-gradient')) {
        const matches = s.match(re);
        if (matches && matches.length) return matches[0];
      }
      return s.match(re)?.[0] || s;
    } catch { return '#1d2837'; }
  }
  function tokenToRgb(token: string): { r: number; g: number; b: number } {
    try {
      const t = token.trim();
      if (t.startsWith('#')) {
        const h = t.slice(1);
        const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
        const n = parseInt(full, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      }
      if (t.startsWith('rgb')) {
        const nums = t.replace(/rgba?\(/, '').replace(/\)/, '').split(',').map(x => parseFloat(x.trim()));
        return { r: Math.round(nums[0] || 0), g: Math.round(nums[1] || 0), b: Math.round(nums[2] || 0) };
      }
    } catch {}
    return { r: 29, g: 40, b: 55 }; // #1d2837 fallback
  }
  function darkenToken(input: string, amount = 18): string {
    const token = pickColorToken(input);
    const { r, g, b } = tokenToRgb(token);
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }
  const shadowColor = darkenToken(baseColor, 18);
  const shadow = pressed ? `0px 0px 0px ${shadowColor}` : `0px ${shadowHeight}px 0px ${shadowColor}`;
  return (
    <motion.button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={onClick}
      className={className}
      animate={{ y: pressed ? shadowHeight : 0, boxShadow: shadow }}
      transition={{ duration: 0 }}
      style={{
        background: background || baseColor,
        color: textColor || '#fff',
        border: `1px solid ${borderColor || 'rgba(0,0,0,0.08)'}`,
      }}
    >
      {children}
    </motion.button>
  );
}