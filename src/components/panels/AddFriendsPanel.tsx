import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullScreenSheet from '../sheets/FullScreenSheet';
import BottomSheet from '../sheets/BottomSheet';
import { supabase } from '../../lib/supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from '../../lib/cache';
import { hapticSelect } from '../../lib/haptics';

type Props = { open: boolean; onClose: () => void };

export default function AddFriendsPanel({ open, onClose }: Props) {
  const myId = useMemo(() => {
    try { return (window as any)?.__exampliBoot?.user?.id as string | undefined; } catch { return undefined; }
  }, []);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [q, setQ] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<Array<{ user_id: string; first_name: string | null; username: string | null; avatar_url: string | null }>>([]);
  const [pending, setPending] = useState<Record<string, 'pending' | 'accepted'>>({});
  const [statusById, setStatusById] = useState<Record<string, 'friend'>>(() => {
    try {
      const list = cacheGet<any[]>(CACHE_KEYS.friendsList) || [];
      const m: Record<string, 'friend'> = {};
      list.forEach((f: any) => { if (f?.user_id) m[f.user_id] = 'friend'; });
      return m;
    } catch { return {}; }
  });
  const [pendingLocal, setPendingLocal] = useState<Record<string, boolean>>(() => {
    try {
      const cached = cacheGet<Record<string, boolean>>(CACHE_KEYS.friendsPendingSent);
      if (cached && typeof cached === 'object') return cached;
      const bootP = (window as any)?.__exampliBootFriendsPending;
      if (bootP && typeof bootP === 'object') return bootP as Record<string, boolean>;
      return {};
    } catch { return {}; }
  });

  async function enrichSearchAvatars(list: Array<{ user_id: string; first_name: string | null; username: string | null; avatar_url?: string | null }>): Promise<Array<{ user_id: string; first_name: string | null; username: string | null; avatar_url: string | null }>> {
    try {
      const ids = Array.from(new Set(list.map(r => r.user_id).filter(Boolean)));
      if (!ids.length) return list.map(r => ({ ...r, avatar_url: r.avatar_url ?? null }));
      const { data } = await supabase
        .from('users')
        .select('id, avatar_url')
        .in('id', ids as string[]);
      const map = new Map<string, string | null>((data || []).map((u: any) => [String(u.id), (u?.avatar_url as string | null) ?? null]));
      return list.map(r => ({ ...r, avatar_url: map.get(r.user_id) ?? r.avatar_url ?? null }));
    } catch {}
    return list.map(r => ({ ...r, avatar_url: r.avatar_url ?? null }));
  }
  const [toast, setToast] = useState<string | null>(null);
  async function onShareInvite() {
    try {
      // создаём инвайт
      const me = myId as string | undefined;
      let token: string | null = null;
      try {
        // пробуем RPC с caller
        let r = await supabase.rpc('rpc_invite_create', { caller: me } as any);
        if (r.error) {
          // фолбэк — без caller
          r = await supabase.rpc('rpc_invite_create', {} as any);
        }
        const d: any = r.data;
        if (typeof d === 'string') token = d;
        else if (Array.isArray(d) && d.length && d[0]?.token) token = String(d[0].token);
        else if (d?.token) token = String(d.token);
      } catch {}
      if (!token) throw new Error('no token');
      let bot = (import.meta as any).env?.VITE_TG_BOT_USERNAME as string | undefined;
      if (bot && bot.startsWith('@')) bot = bot.slice(1);
      // Режим параметра ссылки:
      // - по умолчанию 'start' (откроет чат с ботом и отправит /start)
      // - можно переключить через VITE_TG_INVITE_PARAM=startapp|startattach при необходимости
      const paramEnv = String((import.meta as any).env?.VITE_TG_INVITE_PARAM || '').trim().toLowerCase();
      // По умолчанию снова открываем сразу WebApp (startapp). Можно переопределить через env
      const param = (paramEnv === 'start' || paramEnv === 'startattach') ? paramEnv : 'startapp';
      const inviteUrl = bot
        ? `https://t.me/${bot}?${param}=${encodeURIComponent(token)}`
        : `${location.origin}${location.pathname}?invite=${encodeURIComponent(token)}`;
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent('Добавляйся в друзья!')}`;
      const tg = (window as any)?.Telegram?.WebApp;
      if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
      else if (navigator?.share) { try { await (navigator as any).share({ title: 'Приглашение', text: 'Добавляйся в друзья!', url: inviteUrl }); } catch {} }
      else window.open(shareUrl, '_blank');
      setToast('Ссылка для приглашения открыта');
      setTimeout(() => setToast(null), 1800);
    } catch {
      try { console.error('invite create failed'); } catch {}
      setToast('Не удалось создать приглашение');
      setTimeout(() => setToast(null), 1800);
    }
  }

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
        const filtered = (data as any[]).filter(r => r.user_id && r.user_id !== myId).map((r) => ({
          user_id: r.user_id,
          first_name: r.first_name ?? null,
          username: r.username ?? null,
          avatar_url: null as string | null,
        }));
        const withAvatars = await enrichSearchAvatars(filtered);
        setRows(withAvatars as any);
        // обновим статусы из кэша и серверные статусы (через RPC, если доступен)
        try {
          const list = cacheGet<any[]>(CACHE_KEYS.friendsList) || [];
          const m: Record<string, 'friend'> = {};
          list.forEach((f: any) => { if (f?.user_id) m[f.user_id] = 'friend'; });
          let sent = cacheGet<Record<string, boolean>>(CACHE_KEYS.friendsPendingSent) || {};
          // пробуем RPC, чтобы снять устаревшие pending и отметить accepted
          const ids = filtered.map(r => r.user_id) as string[];
          if (ids.length) {
            const resp = await supabase.rpc('rpc_friend_status_list', { caller: myId, others: ids } as any);
            if (!resp.error && Array.isArray(resp.data)) {
              const nextSent: Record<string, boolean> = { ...sent };
              (resp.data as any[]).forEach((row) => {
                const oid = (row as any)?.other_id;
                const st = String((row as any)?.status || '').toLowerCase();
                if (!oid) return;
                if (st === 'accepted') { m[oid] = 'friend'; delete nextSent[oid]; }
                else if (st === 'pending') { nextSent[oid] = true; }
              });
              sent = nextSent;
            }
          }
          setStatusById(m);
          setPendingLocal(sent);
          cacheSet(CACHE_KEYS.friendsPendingSent, sent);
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
      try {
        const sent = (cacheGet<Record<string, boolean>>(CACHE_KEYS.friendsPendingSent) || {});
        sent[targetId] = true;
        cacheSet(CACHE_KEYS.friendsPendingSent, sent);
        setPendingLocal(sent);
      } catch {}
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
        <PressButton
          onClick={() => { try { hapticSelect(); } catch {} setSearchOpen(true); }}
          className="w-full flex items-center gap-3 rounded-2xl px-4 py-3"
          baseColor="#2a3944"
          background="rgba(255,255,255,0.05)"
          borderColor="rgba(255,255,255,0.10)"
          textColor="#ffffff"
        >
          <img src="/friends/loupe.svg" alt="Поиск" className="w-10 h-10" />
          <div className="text-left">
            <div className="text-base font-semibold">Поиск по имени</div>
          </div>
        </PressButton>

        {/* Поделиться ссылкой */}
        <PressButton
          onClick={() => { try { hapticSelect(); } catch {} void onShareInvite(); }}
          className="w-full flex items-center gap-3 rounded-2xl px-4 py-3"
          baseColor="#2a3944"
          background="rgba(255,255,255,0.05)"
          borderColor="rgba(255,255,255,0.10)"
          textColor="#ffffff"
        >
          <img src="/friends/plane.svg" alt="Поделиться" className="w-10 h-10" />
          <div className="text-left">
            <div className="text-base font-semibold">Поделиться ссылкой</div>
          </div>
        </PressButton>

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
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-black/20 border border-white/20 shadow-[0_2px_12px_rgba(0,0,0,0.25)] grid place-items-center">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span className="text-sm font-bold text-white/95">{(r.first_name || r.username || '?').slice(0,1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="font-semibold">{r.first_name || 'Без имени'}</div>
                      {r.username && <div className="text-sm text-white/70">@{r.username}</div>}
                    </div>
                  </div>
                  <div>
                    {pending[r.user_id] === 'pending' || pendingLocal[r.user_id] ? (
                      <div className="text-sm text-white/60">Отправлено</div>
                    ) : statusById[r.user_id] === 'friend' ? (
                      <div className="text-sm text-white/60">Друг</div>
                    ) : (
                      <PressButton
                        onClick={() => void sendRequest(r.user_id)}
                        className="px-3 py-1 rounded-xl text-sm font-semibold"
                        baseColor="#2a3944"
                        background="rgba(255,255,255,0.10)"
                        borderColor="rgba(255,255,255,0.10)"
                        textColor="#ffffff"
                      >
                        Добавить
                      </PressButton>
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
              className="fixed left-10 bottom-[90px] px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-sm text-center whitespace-nowrap"
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
  baseColor: string; // основной цвет кнопки для тени
  background?: string; // цвет фона (например, rgba для «матового» вида)
  borderColor?: string;
  textColor?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const shadowHeight = 6;
  const darken = (hex: string, amount = 18) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };
  const shadow = pressed ? `0px 0px 0px ${darken(baseColor, 18)}` : `0px ${shadowHeight}px 0px ${darken(baseColor, 18)}`;
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
