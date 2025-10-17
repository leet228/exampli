import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import FriendsPanel from '../components/panels/FriendsPanel';
import AddFriendsPanel from '../components/panels/AddFriendsPanel';
import { cacheGet, cacheSet, CACHE_KEYS } from '../lib/cache';
import { hapticSelect, hapticSlideClose, hapticSlideReveal } from '../lib/haptics';

function AchBadge({ img, value, stroke, fill, onClick, width = 96, numBoost = 0, bottomOffset = 0 }: { img: string; value: number; stroke: string; fill: string; onClick?: () => void; width?: number; numBoost?: number; bottomOffset?: number }) {
  const safe = Math.max(0, Number(value || 0));
  const str = String(safe);
  const size = str.length >= 3 ? 28 : (str.length === 2 ? 30 : 34);
  return (
    <div className="relative select-none" onClick={onClick} role={onClick ? 'button' : undefined} style={{ width }}>
      <img src={img} alt="" className="block object-contain" style={{ width, height: width }} />
      <div
        className="absolute left-1/2 -translate-x-1/2 font-extrabold tabular-nums"
        style={{
          bottom: -18 + bottomOffset,
          fontSize: size + numBoost,
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

export default function Profile() {
  const [u, setU] = useState<any>(null);
  const [isPlus, setIsPlus] = useState<boolean>(() => {
    try {
      const pu0 = (window as any)?.__exampliBoot?.user?.plus_until || (cacheGet<any>(CACHE_KEYS.user)?.plus_until);
      return Boolean(pu0 && new Date(String(pu0)).getTime() > Date.now());
    } catch { return false; }
  });
  const [course, setCourse] = useState<string>('Курс');
  const [courseCode, setCourseCode] = useState<string | null>(null);
  const [bg, setBg] = useState<string>('#3280c2');
  const [baseBg, setBaseBg] = useState<string>('#3280c2');
  const [bgIcon, setBgIcon] = useState<string>('bg_icon_cat');
  const [tempBgIcon, setTempBgIcon] = useState<string>('bg_icon_cat');
  const [iconsOpen, setIconsOpen] = useState<boolean>(false);
  const iconsCloud = useMemo(() => {
    // Симметричная раскладка 18 иконок: ряды 2,3,2,4,2,3,2
    // Центральный ряд (4) имеет «дырку» по центру, чтобы не наезжать на аватар
    // Сжимание по вертикали: ряды ближе друг к другу (малый шаг по Y)
    const rows: { y: number; xs: number[] }[] = [
      { y: 30, xs: [28, 72] },            // 2
      { y: 38, xs: [18, 50, 82] },        // 3
      { y: 46, xs: [28, 72] },            // 2
      { y: 58, xs: [10, 30, 70, 90] },    // 4 — по уровню центра аватарки, дальше от неё по X
      { y: 70, xs: [28, 72] },            // 2
      { y: 78, xs: [18, 50, 82] },        // 3
      { y: 86, xs: [28, 72] },            // 2
    ];
    const items: { x: number; y: number; s: number; r: number; o: number }[] = [];
    rows.forEach((row) => {
      row.xs.forEach((x) => {
        items.push({ x, y: row.y, s: 1, r: 0, o: 0.28 });
      });
    });
    return items;
  }, []);
  const [phone, setPhone] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const colors = ['#3280c2', '#3a9c21', '#c37024', '#b94c45', '#8957ca', '#36a4b1', '#b64b83', '#788897'];
  const gradientPairs: Array<[string, string]> = [
    ['#73d5ee','#508dcc'],
    ['#a6cf59','#3c9656'],
    ['#e7a93c','#cf7344'],
    ['#f8906b','#ca555e'],
    ['#e57bdf','#9662ce'],
    ['#77ddc5','#3a97c0'],
    ['#f08d90','#c44f83'],
    ['#acb6c2','#6b7783'],
  ];
  const [sel, setSel] = useState<string>('');
  const [friendsOpen, setFriendsOpen] = useState<boolean>(false);
  const [addFriendsOpen, setAddFriendsOpen] = useState<boolean>(false);
  const [friendsCount, setFriendsCount] = useState<number>(() => {
    try {
      const cached = cacheGet<number>(CACHE_KEYS.friendsCount);
      if (typeof cached === 'number') return Number(cached);
      const bootCount = (window as any)?.__exampliBoot?.friendsCount;
      if (typeof bootCount === 'number') return bootCount;
      return 0;
    } catch { return 0; }
  });
  // Топ друзей по стрику (для слотов 5 шт.)
  const [friendTop, setFriendTop] = useState<Array<{ user_id: string; streak: number; avatar_url: string | null; first_name?: string | null }>>([]);
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
  const [qrOpen, setQrOpen] = useState<boolean>(false);
  const [qrImgUrl, setQrImgUrl] = useState<string>('');
  const [qrLoading, setQrLoading] = useState<boolean>(false);
  const [addPressed, setAddPressed] = useState<boolean>(false);
  const addShadowHeight = 6;
  const [savePressed, setSavePressed] = useState<boolean>(false);
  const saveShadowHeight = 6;
  const accentColor = '#3c73ff';
  const [streakAchOpen, setStreakAchOpen] = useState<boolean>(false);
  const [perfectAchOpen, setPerfectAchOpen] = useState<boolean>(false);
  const [duelAchOpen, setDuelAchOpen] = useState<boolean>(false);
  const darken = (hex: string, amount = 18) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount / 100))));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  };

  // Имя бота для подписи/ссылок
  const botUsername = useMemo(() => {
    try {
      let b = (import.meta as any)?.env?.VITE_TG_BOT_USERNAME as string | undefined;
      if (!b) return '';
      b = String(b).trim();
      if (!b) return '';
      return b.startsWith('@') ? b : ('@' + b);
    } catch { return ''; }
  }, []);

  async function openQrInvite() {
    try {
      setQrLoading(true);
      setQrImgUrl('');
      const myId: string | undefined = (() => {
        try { return (u?.id as string) || (window as any)?.__exampliBoot?.user?.id; } catch { return undefined; }
      })();
      // создаём инвайт токен
      let token: string | null = null;
      try {
        let r = await supabase.rpc('rpc_invite_create', { caller: myId } as any);
        if (r.error) r = await supabase.rpc('rpc_invite_create', {} as any);
        const d: any = r.data;
        if (typeof d === 'string') token = d;
        else if (Array.isArray(d) && d.length && d[0]?.token) token = String(d[0].token);
        else if (d?.token) token = String(d.token);
      } catch {}
      if (!token) throw new Error('no token');
      let bot = (import.meta as any).env?.VITE_TG_BOT_USERNAME as string | undefined;
      if (bot && bot.startsWith('@')) bot = bot.slice(1);
      const paramEnv = String((import.meta as any).env?.VITE_TG_INVITE_PARAM || '').trim().toLowerCase();
      const param = (paramEnv === 'start' || paramEnv === 'startattach') ? paramEnv : 'startapp';
      const inviteUrl = bot
        ? `https://t.me/${bot}?${param}=${encodeURIComponent(token)}`
        : `${location.origin}${location.pathname}?invite=${encodeURIComponent(token)}`;
      // генерируем QR через публичный сервис (без зависимостей)
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=0&data=${encodeURIComponent(inviteUrl)}`;
      setQrImgUrl(qr);
      setQrOpen(true);
    } catch {
      // игнорируем тихо
    } finally {
      setQrLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const tg = (window as any)?.Telegram?.WebApp;
      const tu = tg?.initDataUnsafe?.user;
      if (!tu) return;
      // читаем только из кэша/boot, без обращения к БД
      let user: any | null = cacheGet<any>(CACHE_KEYS.user);
      if (!user || user.added_course == null) {
        const bootUser = (window as any)?.__exampliBoot?.user || null;
        user = bootUser || user;
        if (user) cacheSet(CACHE_KEYS.user, user);
      }
      setU({ ...user, tg_username: tu.username, photo_url: tu.photo_url, first_name: tu.first_name });
      // фото: сперва avatar_url из локального кэша/boot, затем фолбэки Telegram CDN
      try {
        const uname = tu?.username as string | undefined;
        const fromCache = cacheGet<string>(CACHE_KEYS.userAvatarUrl);
        const fromBoot = (window as any)?.__exampliBoot?.user?.avatar_url as string | undefined;
        const direct = (tu?.photo_url as string | undefined) || '';
        const candidates = [
          fromCache || fromBoot || '',
          direct,
          ...(uname ? [
            `https://t.me/i/userpic/320/${uname}.jpg`,
            `https://t.me/i/userpic/320/${uname}.png`,
            `https://t.me/i/userpic/160/${uname}.jpg`,
            `https://t.me/i/userpic/160/${uname}.png`,
          ] : []),
        ].filter(Boolean) as string[];

        const testNext = (i: number) => {
          if (i >= candidates.length) return;
          const url = candidates[i] + (i > 0 ? `?v=${Date.now()}` : '');
          const img = new Image();
          img.onload = () => { try { setPhotoUrl(url); } catch {} };
          img.onerror = () => testNext(i + 1);
          img.referrerPolicy = 'no-referrer';
          img.src = url;
        };
        testNext(0);
      } catch {}
      // профиль (фон/иконка/тел/username) из boot.userProfile
      try {
        const prof = (window as any)?.__exampliBoot?.userProfile || null;
        if (prof?.background_color) { setBg(String(prof.background_color)); setBaseBg(String(prof.background_color)); }
        if (prof?.background_icon) { setBgIcon(String(prof.background_icon)); setTempBgIcon(String(prof.background_icon)); }
        if (prof?.phone_number) setPhone(String(prof.phone_number));
        if (prof?.username) setUsername(String(prof.username));
      } catch {}
      setSel((window as any)?.__exampliBoot?.userProfile?.background_color || '#3280c2');
      cacheSet(CACHE_KEYS.user, user);
      // текущий курс по users.added_course — из boot.subjectsAll
      const addedId = (user as any)?.added_course as number | null | undefined;
      if (addedId) {
        try {
          const boot: any = (window as any)?.__exampliBoot || {};
          const listAll: any[] | undefined = boot?.subjectsAll;
          const listUser: any[] | undefined = boot?.subjects;
          let found = listAll?.find?.((s: any) => Number(s.id) === Number(addedId));
          if (!found && Array.isArray(listUser)) found = listUser.find?.((s: any) => Number(s.id) === Number(addedId));
          if (found?.title) setCourse(String(found.title));
          if (found?.code) setCourseCode(String(found.code));
          if (!found) {
            const codeLs = (() => { try { return localStorage.getItem('exampli:activeSubjectCode'); } catch { return null; } })();
            if (codeLs) setCourseCode(codeLs);
          }
        } catch {}
      }
    })();
  }, []);

  // Загружаем друзей и их стрики, сортируем по убыванию, берём топ‑5
  useEffect(() => { void refreshFriendStreakSlots(); }, [friendsCount]);
  useEffect(() => {
    const onFriendsChanged = () => { void refreshFriendStreakSlots(); };
    try { window.addEventListener('exampli:friendsChanged', onFriendsChanged as any); } catch {}
    return () => { try { window.removeEventListener('exampli:friendsChanged', onFriendsChanged as any); } catch {} };
  }, []);

  // Также подписываемся на добавление/удаление друга через панель (обновление кэша friends_list)
  useEffect(() => {
    const rebalance = () => { try { setFriendsCount((cacheGet<number>(CACHE_KEYS.friendsCount) as any) || 0); } catch { void refreshFriendStreakSlots(); } };
    try { window.addEventListener('exampli:friendsChanged', rebalance as any); } catch {}
    return () => { try { window.removeEventListener('exampli:friendsChanged', rebalance as any); } catch {} };
  }, []);

  async function refreshFriendStreakSlots() {
    try {
      // Источник списка друзей — boot или кэш
      const bootArr = (window as any)?.__exampliBootFriends as any[] | undefined;
      const cached = cacheGet<any[]>(CACHE_KEYS.friendsList) || [];
      const rows = (Array.isArray(bootArr) && bootArr.length ? bootArr : cached) as any[];
      if (!Array.isArray(rows) || rows.length === 0) { setFriendTop([]); return; }
      const ids = Array.from(new Set(rows.map(r => String(r.user_id)).filter(Boolean)));
      // Попробуем получить streak и avatar_url из users
      let streakMap = new Map<string, { streak: number; avatar_url: string | null }>();
      if (ids.length) {
        try {
          const { data } = await supabase
            .from('users')
            .select('id, streak, avatar_url')
            .in('id', ids as any);
          (data || []).forEach((u: any) => {
            streakMap.set(String(u.id), { streak: Number(u?.streak ?? 0), avatar_url: (u?.avatar_url ?? null) as string | null });
          });
        } catch {}
      }
      const merged = rows.map((r: any) => {
        const id = String(r.user_id);
        const fromUsers = streakMap.get(id);
        return {
          user_id: id,
          first_name: r?.first_name ?? null,
          streak: fromUsers?.streak ?? 0,
          avatar_url: (fromUsers?.avatar_url ?? r?.avatar_url ?? null) as string | null,
        };
      });
      merged.sort((a, b) => (b.streak || 0) - (a.streak || 0));
      setFriendTop(merged.slice(0, 5));
    } catch { setFriendTop([]); }
  }

  async function openFriendProfileById(userId: string) {
    try {
      // базовые данные из boot/cached friends_list
      const seed = ((window as any)?.__exampliBootFriends as any[]) || (cacheGet<any[]>(CACHE_KEYS.friendsList) || []);
      const base = (seed || []).find((r: any) => String(r.user_id) === String(userId)) || {};
      const view = {
        user_id: String(userId),
        first_name: base?.first_name ?? null,
        username: base?.username ?? null,
        background_color: base?.background_color ?? null,
        background_icon: base?.background_icon ?? 'bg_icon_cat',
        avatar_url: base?.avatar_url ?? null,
      } as any;
      setFriendView(view);
      setFriendStats(null);
      setFriendOpen(true);
      // Подтягиваем серверные данные (стрик/коины/курс/аватар)
      // 1) cache-first: попробуем взять друга из кэша friends_list
      const cachedList = (cacheGet<any[]>(CACHE_KEYS.friendsList) || []) as any[];
      const cached = cachedList.find(r => String(r.user_id) === String(userId)) || null;
      // 2) параллельно рассчитываем число друзей через RPC (если доступно)
      const [countR, urow] = await Promise.all([
        supabase.rpc('rpc_friend_count', { caller: userId } as any),
        cached ? Promise.resolve({ data: cached }) : supabase.from('users').select('streak, coins, added_course, avatar_url, max_streak, perfect_lessons, duel_wins').eq('id', userId).single(),
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
        avatar_url: (urow as any)?.avatar_url ?? view.avatar_url ?? null,
        max_streak: (urow as any)?.max_streak ?? null,
        perfect_lessons: (urow as any)?.perfect_lessons ?? null,
        duel_wins: (urow as any)?.duel_wins ?? null,
      });
    } catch {}
  }

  function closeFriendProfileOverlay() {
    try { hapticSlideClose(); } catch {}
    setFriendOpen(false);
    setTimeout(() => { setFriendView(null); setFriendStats(null); }, 200);
  }

  // Слушаем изменения подписки и обновляем локальный флаг PLUS
  useEffect(() => {
    try {
      const pu0 = (window as any)?.__exampliBoot?.user?.plus_until || (cacheGet<any>(CACHE_KEYS.user)?.plus_until);
      if (pu0 !== undefined) setIsPlus(Boolean(pu0 && new Date(String(pu0)).getTime() > Date.now()));
    } catch {}
    const onPlus = (evt: Event) => {
      try {
        const e = evt as CustomEvent<{ plus_until?: string } & any>;
        if (e?.detail?.plus_until !== undefined) {
          const active = Boolean(e.detail.plus_until && new Date(String(e.detail.plus_until)).getTime() > Date.now());
          setIsPlus(active);
        }
      } catch {}
    };
    window.addEventListener('exampli:statsChanged', onPlus as any);
    return () => { window.removeEventListener('exampli:statsChanged', onPlus as any); };
  }, []);

  // Слушаем обновления статистики (стрик/коины/энергия) и обновляем профиль мгновенно
  useEffect(() => {
    const onStatsChanged = (evt: Event) => {
      const e = evt as CustomEvent<{ streak?: number; coins?: number; energy?: number }>;
      setU((prev: any) => {
        const next = { ...(prev || {}) } as any;
        if (typeof e.detail?.streak === 'number') next.streak = Number(e.detail.streak);
        if (typeof e.detail?.coins === 'number') next.coins = Number(e.detail.coins);
        if (typeof e.detail?.energy === 'number') next.energy = Number(e.detail.energy);
        // Новые поля для ачивок: обновляем сразу, чтобы бейджи менялись мгновенно
        if (typeof (e as any).detail?.max_streak === 'number') next.max_streak = Number((e as any).detail.max_streak);
        if (typeof (e as any).detail?.perfect_lessons === 'number') next.perfect_lessons = Number((e as any).detail.perfect_lessons);
        if (typeof (e as any).detail?.duel_wins === 'number') next.duel_wins = Number((e as any).detail.duel_wins);
        return next;
      });
    };
    try { window.addEventListener('exampli:statsChanged', onStatsChanged as any); } catch {}
    return () => { try { window.removeEventListener('exampli:statsChanged', onStatsChanged as any); } catch {}; };
  }, []);

  // загрузка количества друзей
  // обновляем friendsCount только по событиям/boot; сетевой пересчёт не делаем

  // подписка на локальные изменения количества друзей
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const next = Math.max(0, Number(e?.detail?.count) || 0);
        setFriendsCount(next);
        cacheSet(CACHE_KEYS.friendsCount, next);
        try {
          const boot: any = (window as any).__exampliBoot || {};
          boot.friendsCount = next;
          (window as any).__exampliBoot = boot;
        } catch {}
      } catch {}
    };
    try { window.addEventListener('exampli:friendsChanged', handler as any); } catch {}
    return () => { try { window.removeEventListener('exampli:friendsChanged', handler as any); } catch {} };
  }, []);

  // тянем фон панели выше экрана при скролле: меняем body::before цвет
  useEffect(() => {
    try {
      document.body.classList.add('profile-overscroll');
      document.documentElement.style.setProperty('--profile-bg', bg);
      return () => {
        document.body.classList.remove('profile-overscroll');
        document.documentElement.style.removeProperty('--profile-bg');
      };
    } catch { return; }
  }, [bg]);

  const initials = (u?.first_name || 'U').slice(0,1).toUpperCase();
  const maskedPhone = phone ? phone : '';
  const atUsername = username ? `@${username}` : '';

  // Иконки для оверлея друга — компоновка как в FriendsPanel
  const friendIconsCloud = useMemo(() => {
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

  // helpers for share/date
  function formatDate(d: Date) {
    const dd = `${d.getDate()}`.padStart(2, '0');
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }

  function getCreatedAt(): Date | null {
    try {
      const u0 = (cacheGet as any)(CACHE_KEYS.user) || (window as any)?.__exampliBoot?.user || null;
      if (u0?.created_at) return new Date(String(u0.created_at));
    } catch {}
    return null;
  }

  async function shareStreak() {
    try {
      const blob = await renderStreakAchievmentImage();
      await shareAchievementBlob(blob, 'streak.png', 'Моё достижение');
    } catch {}
  }

  async function sharePerfect() {
    try {
      const blob = await renderPerfectAchievementImage();
      await shareAchievementBlob(blob, 'perfect.png', 'Моё достижение');
    } catch {}
  }

  async function shareDuel() {
    try {
      const blob = await renderDuelAchievementImage();
      await shareAchievementBlob(blob, 'duel.png', 'Моё достижение');
    } catch {}
  }

  // Унифицированная отправка изображения достижения: Story → Telegram share link → Web Share → Download
  async function shareAchievementBlob(blob: Blob, filename: string, text: string) {
    const tg = (window as any)?.Telegram?.WebApp;
    // 1) Попытка выложить в Stories (требуется публичный URL)
    try {
      const publicUrl = await uploadAchievementBlob(blob, filename);
      if (publicUrl) {
        try {
          if (tg?.shareToStory) { tg.shareToStory(publicUrl, { text }); return; }
        } catch {}
        // 2) Если сторис недоступно — Telegram share ссылкой (как в AddFriendsPanel)
        try {
          const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(text || '')}`;
          if (tg?.openTelegramLink) { tg.openTelegramLink(shareUrl); return; }
          if (navigator?.share) { await (navigator as any).share({ title: text, text, url: publicUrl }); return; }
          window.open(shareUrl, '_blank');
          return;
        } catch {}
      }
    } catch {}
    // 3) Fallback: если не смогли загрузить — попробуем Web Share с файлом, затем скачивание
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      const nav: any = navigator as any;
      if (nav?.share && nav?.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: text }); return; }
    } catch {}
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 3000);
    } catch {}
  }

  async function uploadAchievementBlob(blob: Blob, filename: string): Promise<string | null> {
    try {
      const bucket = (import.meta as any)?.env?.VITE_SUPABASE_BUCKET || 'ai-uploads';
      const u = (cacheGet as any)(CACHE_KEYS.user) || (window as any)?.__exampliBoot?.user || {};
      const uid = u?.id ? String(u.id) : 'anon';
      const path = `achievements/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}_${filename}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, {
        cacheControl: '3600',
        contentType: 'image/png',
        upsert: false,
      });
      if (upErr) return null;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch { return null; }
  }

  // Render the opened streak achievement card to PNG blob (no external libs)
  async function renderStreakAchievmentImage(): Promise<Blob> {
    const width = 1080; // HD portrait width
    const height = 1520; // enough for badge + date + text
    const dpr = Math.min(2, (window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // background
    ctx.fillStyle = '#3a1f1b';
    ctx.fillRect(0, 0, width, height);

    // center badge image
    const badgeSize = 680; // px
    const badgeX = (width - badgeSize) / 2;
    const badgeY = 150;
    const img = await loadImage('/profile/streak_ach.svg');
    ctx.drawImage(img, badgeX, badgeY, badgeSize, badgeSize);

    // number on badge
    const n = Math.max(0, Number(u?.max_streak ?? u?.streak ?? 0));
    const digits = String(n).length;
    const fontSize = digits >= 3 ? 220 : (digits === 2 ? 240 : 270);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const numX = width / 2;
    const numY = badgeY + badgeSize - 38; // ещё ниже
    // stroke
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.lineWidth = 24;
    ctx.strokeStyle = '#612300';
    ctx.miterLimit = 2;
    ctx.strokeText(String(n), numX, numY);
    // fill
    ctx.fillStyle = '#9d4106';
    ctx.fillText(String(n), numX, numY);

    // date pill
    const dateStr = formatDate(getCreatedAt() || new Date());
    const pillPadX = 28;
    const pillPadY = 14;
    ctx.font = `600 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const dateW = ctx.measureText(dateStr).width;
    const pillW = dateW + pillPadX * 2;
    const pillH = 38 + pillPadY * 2;
    const pillX = (width - pillW) / 2;
    const pillY = badgeY + badgeSize + 48; // опускаем ниже
    roundRect(ctx, pillX, pillY, pillW, pillH, 18, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = '#ffd08a';
    ctx.fillText(dateStr, width / 2, pillY + pillH - pillPadY - 6);

    // title text multiline (с именем вместо «Ты», если есть)
    const name = (u?.first_name ? String(u.first_name).trim() : '');
    const title = `${name || 'Ты'} достиг стрика на ${n} ${pluralDays(n)}!`;
    ctx.font = `800 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = '#ffb74d';
    const lines = breakLine(ctx, title, width - 160);
    let ty = pillY + pillH + 60; // опускаем ниже текст
    for (const line of lines) {
      ctx.fillText(line, width / 2, ty);
      ty += 76;
    }

    // bot username at bottom for streak
    if (botUsername) {
      ctx.font = `700 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.fillStyle = '#ffd08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(botUsername), width / 2, height - 40);
    }

    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
  }

  function pluralDays(n: number): string {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'дня';
    return 'дней';
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
    const rr = Math.min(r, h/2, w/2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function breakLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) cur = test; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Perfect achievement image
  async function renderPerfectAchievementImage(): Promise<Blob> {
    const width = 1080;
    const height = 1520;
    const dpr = Math.min(2, (window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // background (deep green)
    ctx.fillStyle = '#0d2c0f';
    ctx.fillRect(0, 0, width, height);

    // badge
    const badgeSize = 680;
    const badgeX = (width - badgeSize) / 2;
    const badgeY = 150;
    const img = await loadImage('/profile/perfect_ach.svg');
    ctx.drawImage(img, badgeX, badgeY, badgeSize, badgeSize);

    // number = perfect count
    const n = Math.max(0, Number(u?.perfect_lessons ?? 0));
    const digits = String(n).length;
    const fontSize = digits >= 3 ? 220 : (digits === 2 ? 240 : 270);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const numX = width / 2;
    const numY = badgeY + badgeSize - 12; // ещё ниже
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.lineWidth = 24;
    ctx.strokeStyle = '#066629';
    ctx.strokeText(String(n), numX, numY);
    ctx.fillStyle = '#1fb75b';
    ctx.fillText(String(n), numX, numY);

    // date pill (first visit)
    const dateStr = formatDate(getCreatedAt() || new Date());
    const pillPadX = 28;
    const pillPadY = 14;
    ctx.font = `600 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const dateW = ctx.measureText(dateStr).width;
    const pillW = dateW + pillPadX * 2;
    const pillH = 38 + pillPadY * 2;
    const pillX = (width - pillW) / 2;
    const pillY = badgeY + badgeSize + 48; // ниже
    roundRect(ctx, pillX, pillY, pillW, pillH, 18, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = '#b3f5c7';
    ctx.fillText(dateStr, width / 2, pillY + pillH - pillPadY - 6);

    // title (с именем вместо «Ты», если есть)
    const name = (u?.first_name ? String(u.first_name).trim() : '');
    const title = `${name || 'Ты'} прошёл без ошибок ${n} ${pluralLessons(n)}!`;
    ctx.font = `800 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = '#6cf087';
    const lines = breakLine(ctx, title, width - 160);
    let ty = pillY + pillH + 60; // ниже
    for (const line of lines) { ctx.fillText(line, width / 2, ty); ty += 76; }
    if (botUsername) {
      ctx.font = `700 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.fillStyle = '#b3f5c7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(botUsername), width / 2, height - 40);
    }
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
  }

  function pluralLessons(n: number): string {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'урок';
    if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'урока';
    return 'уроков';
  }

  // Duel achievement image
  async function renderDuelAchievementImage(): Promise<Blob> {
    const width = 1080;
    const height = 1520;
    const dpr = Math.min(2, (window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // background warm orange/brown
    ctx.fillStyle = '#2e1f00';
    ctx.fillRect(0, 0, width, height);

    const badgeSize = 680;
    const badgeX = (width - badgeSize) / 2;
    const badgeY = 150;
    const img = await loadImage('/profile/duel_ach.svg');
    ctx.drawImage(img, badgeX, badgeY, badgeSize, badgeSize);

    const n = Math.max(0, Number(u?.duel_wins ?? 0));
    const digits = String(n).length;
    const fontSize = digits >= 3 ? 220 : (digits === 2 ? 240 : 270);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const numX = width / 2;
    const numY = badgeY + badgeSize - 12; // ещё ниже
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.lineWidth = 24;
    ctx.strokeStyle = '#ff9803';
    ctx.strokeText(String(n), numX, numY);
    ctx.fillStyle = '#b35102';
    ctx.fillText(String(n), numX, numY);

    const dateStr = formatDate(getCreatedAt() || new Date());
    const pillPadX = 28, pillPadY = 14;
    ctx.font = `600 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const dateW = ctx.measureText(dateStr).width;
    const pillW = dateW + pillPadX * 2;
    const pillH = 38 + pillPadY * 2;
    const pillX = (width - pillW) / 2;
    const pillY = badgeY + badgeSize + 48; // ниже
    roundRect(ctx, pillX, pillY, pillW, pillH, 18, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = '#ffd08a';
    ctx.fillText(dateStr, width / 2, pillY + pillH - pillPadY - 6);

    const name = (u?.first_name ? String(u.first_name).trim() : '');
    const title = `${name || 'Ты'} одержал победу ${n} ${pluralTimes(n)} в дуэли`;
    ctx.font = `800 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = '#ffc159';
    const lines = breakLine(ctx, title, width - 160);
    let ty = pillY + pillH + 60; // ниже
    for (const line of lines) { ctx.fillText(line, width / 2, ty); ty += 76; }
    if (botUsername) {
      ctx.font = `700 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.fillStyle = '#ffd08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(botUsername), width / 2, height - 40);
    }
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
  }

  function pluralTimes(n: number): string {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'раз';
    return 'раз';
  }

  return (
    <div className="flex flex-col items-center text-center gap-5" style={{ position: 'relative', zIndex: 1 }}>
      {/* Хиро-блок: на всю ширину экрана, без скруглений, фон = background_color + мягкое свечение от аватарки */}
      <div
        className="relative"
        style={{
          width: '100vw',
          marginLeft: 'calc(50% - 50vw)',
          marginRight: 'calc(50% - 50vw)',
          // ещё выше к самому верху
          marginTop: 'calc(-1 * (var(--hud-top) + var(--hud-h) + 64px))',
        }}
      >
        <div
          className="relative w-full"
          style={{
            // ещё выше панель и ниже контент → добавим высоту
            height: 340,
            // фон — чистый цвет из профиля, без общего свечения
            background: bg,
          }}
        >
          {/* декоративный слой: много маленьких иконок, разбросанные по полю с сильным затуханием к краям */}
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
                src={`/profile_icons/${tempBgIcon}.svg`}
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
          {/* PLUS bottom gradient glow inside hero background */}
          {isPlus && !editing && (
            <div
              className="absolute left-0 right-0 bottom-0 pointer-events-none"
              style={{
                height: 78,
                background: 'linear-gradient(90deg, #6ce35b 0%, #31d7c6 36%, #3d9dff 68%, #c25cff 100%)',
                opacity: 1,
                WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0, rgba(0,0,0,1) 28px, rgba(0,0,0,0) 85%)',
                maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0, rgba(0,0,0,1) 28px, rgba(0,0,0,0) 85%)',
                zIndex: 0,
              }}
              aria-hidden
            />
          )}
  {/* Friend Profile Overlay (exact like FriendsPanel) */}
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
        onClick={closeFriendProfileOverlay}
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
                {friendIconsCloud.map((it, i) => (
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
          <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
          {/* Кнопка Изменить в правом верхнем углу (скрыта в режиме редактирования) */}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="absolute right-4 top-36 px-2 py-1 rounded-full text-[12px] font-semibold text-white/95"
              style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)', zIndex: 2, pointerEvents: 'auto' }}
            >
              Изменить
            </button>
          )}
          {/* Кнопка QR слева от аватарки на том же уровне */}
          {!editing && (
            <button
              type="button"
              onClick={() => { void openQrInvite(); }}
              className="absolute left-4 top-36 p-2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)', zIndex: 2, pointerEvents: 'auto' }}
            >
              <img src="/friends/qr.svg" alt="QR" className="w-6 h-6" />
            </button>
          )}

          <div className="relative h-full flex flex-col items-center justify-end pb-2">
            {/* Аватарка + локальное свечение строго по кругу аватарки */}
            <div className="relative mb-3">
              {/* свечение: круг больше аватарки, мягкая прозрачность */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  width: isPlus ? 200 : 300,
                  height: isPlus ? 200 : 300,
                  borderRadius: '50%',
                  background: isPlus
                    ? 'conic-gradient(#22e3b1, #3c73ff, #d45bff, #22e3b1)'
                    : 'radial-gradient(closest-side, rgba(255,255,255,0.32), rgba(255,255,255,0) 80%)',
                  // мягкое затухание краёв для PLUS через маску
                  WebkitMaskImage: isPlus ? 'radial-gradient(circle, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 70%)' : undefined,
                  maskImage: isPlus ? 'radial-gradient(circle, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 70%)' : undefined,
                  opacity: isPlus ? 0.85 : undefined,
                  zIndex: 0,
                }}
              />
              <div className="relative z-[1] w-28 h-28 rounded-full overflow-hidden bg-black/20 border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
                {photoUrl || u?.photo_url ? (
                  <img src={(photoUrl || u?.photo_url) as string} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-3xl font-bold text-white/90">
                    {initials}
                  </div>
                )}
              </div>
            </div>

            {/* Имя — ближе к строке контактов */}
            <div className="text-3xl font-extrabold tracking-wide text-white/95">
              {u?.first_name || u?.username || u?.tg_username || 'Гость'}
            </div>

            {/* Телефон • @username в одной строке, сразу под именем */}
            <div className="mt-1 text-lg text-white/85 flex items-center gap-2">
              {maskedPhone && <span>{maskedPhone}</span>}
              {maskedPhone && atUsername && <span className="opacity-70">•</span>}
              {atUsername && <span>{atUsername}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Карточки/метрики ниже хиро */}
      {!editing ? (
        <>
          {/* Верхняя строка: слева курс, справа друзья (без рамок/карт) */}
          <div className="w-full max-w-xl px-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="px-0 py-1 flex flex-col items-center justify-center text-center justify-self-start">
                {courseCode ? (
                  <img src={`/subjects/${courseCode}.svg`} alt="Курс" className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 grid place-items-center text-2xl">🧩</div>
                )}
                <div className="text-sm text-muted" style={{ marginTop: -12 }}>Курс</div>
              </div>
              <div className="px-0 py-1 flex justify-center justify-self-end">
                <button
                  type="button"
                  onClick={() => { setFriendsOpen(true); }}
                  className="ml-auto flex flex-col items-center justify-center active:opacity-80"
                  style={{ cursor: 'pointer' }}
                >
                  <div className="text-2xl font-extrabold tabular-nums leading-tight">{friendsCount}</div>
                  <div className="text-sm text-muted leading-tight mt-1">друзья</div>
                </button>
              </div>
            </div>
          </div>

          {/* Кнопка «Добавить друзей» — фон как у приложения, белая обводка/текст, нижняя полоска белая */}
          <div className="w-full max-w-xl px-3">
            <motion.button
              type="button"
              onPointerDown={() => setAddPressed(true)}
              onPointerUp={() => setAddPressed(false)}
              onPointerCancel={() => setAddPressed(false)}
              onClick={() => { try { hapticSelect(); } catch {} setAddFriendsOpen(true); }}
              className="w-full rounded-3xl px-4 py-4 flex items-center justify-center gap-2 font-semibold"
              animate={{
                y: addPressed ? addShadowHeight : 0,
                boxShadow: addPressed ? `0px 0px 0px rgba(255,255,255,1)` : `0px ${addShadowHeight}px 0px rgba(255,255,255,1)`,
              }}
              transition={{ duration: 0 }}
              style={{
                background: 'var(--bg)',
                border: '1px solid rgba(255,255,255,1)',
                color: 'rgba(255,255,255,1)'
              }}
            >
              <img src="/stickers/add_friends.svg" alt="" className="w-9 h-9" style={{ transform: 'translateY(2px)' }} />
              <span className="font-extrabold text-base uppercase">ДОБАВИТЬ ДРУЗЕЙ</span>
            </motion.button>
          </div>

          {/* Обзор */}
          <div className="w-full max-w-xl px-3 mt-3">
            <div className="text-xs tracking-wide uppercase text-muted mb-2">Обзор</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="px-1 py-1 flex items-center gap-2">
                <img src="/stickers/fire.svg" alt="Стрик" className="w-12 h-12" />
                <div className="text-2xl font-extrabold tabular-nums">{u?.streak ?? 0}</div>
              </div>
              <div className="px-1 py-1 flex items-center gap-2 justify-end">
                <img src="/stickers/coin_cat.svg" alt="coins" className="w-10 h-10" />
                <div className="text-2xl font-extrabold tabular-nums">{u?.coins ?? 0}</div>
              </div>
            </div>
          </div>

          {/* Стрики друзей */}
          <div className="w-full max-w-4xl px-0 mt-4">
            <div className="text-xs tracking-wide uppercase text-muted mb-2">Стрики друзей</div>
            <div className="flex items-start justify-evenly">
              {Array.from({ length: 5 }).map((_, i) => {
                const f = friendTop[i];
                return (
                  <div key={i} className="flex flex-col items-center" style={{ minWidth: 56 }}>
                    <button
                      type="button"
                      aria-label={f ? `Друг ${f.first_name || ''}` : 'Добавить друга в стрики'}
                      onClick={() => { try { hapticSelect(); } catch {}; if (f) openFriendProfileById(f.user_id); else setAddFriendsOpen(true); }}
                      className="grid place-items-center rounded-full border-2 border-dashed"
                      style={{ width: 56, height: 56, borderColor: 'rgba(255,255,255,0.35)' }}
                    >
                      {f ? (
                        <div className="relative" style={{ width: 48, height: 48 }}>
                          <div className="rounded-full overflow-hidden w-full h-full">
                            {f.avatar_url ? (
                              <img src={f.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full grid place-items-center bg-white/10 text-white/90 font-bold">
                                {(f.first_name || '?').slice(0,1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          {/* бейдж со стриком ниже круга (выходит за аватар) */}
                          <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: -10 }} aria-hidden>
                            <div
                              className="rounded-full border-2 grid place-items-center shadow"
                              style={{
                                width: (() => {
                                  const len = String(Math.max(0, Number(f.streak || 0))).length;
                                  return len <= 1 ? 20 : (len === 2 ? 25 : 35);
                                })(),
                                height: 20,
                                background: 'linear-gradient(180deg, #f8b04a 0%, #f28c1b 100%)',
                                borderColor: '#ffffff',
                                color: '#ffffff',
                                fontSize: (String(Math.max(0, Number(f.streak || 0))).length >= 3 ? 11 : 12),
                                fontWeight: 900,
                                lineHeight: '12px',
                                textShadow: '0 1px 0 rgba(0,0,0,0.25)'
                              }}
                            >
                              {Math.max(0, Number(f.streak || 0))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-white/85 text-2xl leading-none">+</span>
                      )}
                    </button>
                    {f && (
                      <div className="mt-1 text-[12px] text-white/80 max-w-[72px] truncate">
                        {f.first_name || ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Достижения */}
          <div className="w-full max-w-4xl px-0 mt-5">
            <div className="text-xs tracking-wide uppercase text-muted mb-2">Достижения</div>
            <div className="flex items-end justify-evenly gap-2">
              <AchBadge
                img="/profile/streak_ach.svg"
                value={Math.max(0, Number(u?.max_streak ?? u?.streak ?? 0))}
                stroke="#612300"
                fill="#9d4106"
                onClick={() => { try { hapticSlideReveal(); } catch {} setStreakAchOpen(true); }}
              />
              <AchBadge
                img="/profile/perfect_ach.svg"
                value={Math.max(0, Number(u?.perfect_lessons ?? 0))}
                stroke="#066629"
                fill="#1fb75b"
                onClick={() => { try { hapticSlideReveal(); } catch {} setPerfectAchOpen(true); }}
              />
              <AchBadge
                img="/profile/duel_ach.svg"
                value={Math.max(0, Number(u?.duel_wins ?? 0))}
                stroke="#ff9803"
                fill="#b35102"
                onClick={() => { try { hapticSlideReveal(); } catch {} setDuelAchOpen(true); }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Палитра цветов + градиенты в одной панели */}
          <div className="w-full max-w-xl px-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 overflow-hidden">
              {/* сплошные цвета */}
              <div className="grid grid-cols-8 gap-2 place-items-center">
                {colors.map((c) => (
                  <motion.button
                    key={c}
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setSel(c); setBg(c); }}
                    className="relative"
                    style={{ width: 28, height: 28, borderRadius: 9999, background: c, border: '1px solid rgba(255,255,255,0.18)' }}
                  >
                    {sel === c && (
                      <span className="absolute inset-[-4px] rounded-full border-2" style={{ borderColor: 'rgba(255,255,255,0.95)' }} />
                    )}
                  </motion.button>
                ))}
              </div>
              {/* градиенты */}
              <div className="mt-2 grid grid-cols-8 gap-2 place-items-center">
                {gradientPairs.map(([top, bottom]) => {
                  const previewSplit = `linear-gradient(180deg, ${top} 0%, ${top} 50%, ${bottom} 50%, ${bottom} 100%)`;
                  const valueGrad = `linear-gradient(135deg, ${top} 0%, ${bottom} 100%)`;
                  const active = sel === valueGrad;
                  return (
                    <motion.button
                      key={`${top}-${bottom}`}
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { setSel(valueGrad); setBg(valueGrad); }}
                      className="relative"
                      style={{ width: 28, height: 28, borderRadius: 9999, background: previewSplit, border: active ? '2px solid rgba(255,255,255,0.95)' : '1px solid rgba(255,255,255,0.18)' }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Выбор иконок профиля */}
          <div className="w-full max-w-xl px-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
              {/* кнопка-заголовок как в примере */}
              <button
                type="button"
                onClick={() => setIconsOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
                style={{ borderBottom: iconsOpen ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent' }}
              >
                <div className="text-left">
                  <div className="text-sm font-semibold">Иконки профиля</div>
                </div>
                <div className="flex items-center gap-2">
                  <img src={`/profile_icons/${tempBgIcon}.svg`} alt="" className="w-7 h-7 rounded-md" />
                  <span className="text-white/70">▾</span>
                </div>
              </button>

              {/* выпадающая панель с иконками */}
              {iconsOpen && (
                <div className="px-3 pb-3 pt-2 grid grid-cols-6 gap-2">
                  {['bg_icon_cat'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTempBgIcon(key)}
                      className={`rounded-xl border ${tempBgIcon===key? 'border-white/60 bg-white/10' : 'border-white/10 bg-white/5'}`}
                      style={{ padding: 8 }}
                    >
                      <img src={`/profile_icons/${key}.svg`} alt="" className="w-10 h-10" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Сохранить */}
          <div className="w-full max-w-xl px-3">
            <motion.button
              type="button"
              onPointerDown={() => setSavePressed(true)}
              onPointerUp={() => setSavePressed(false)}
              onPointerCancel={() => setSavePressed(false)}
              className="w-full mt-4 rounded-3xl px-5 py-4 font-semibold text-white"
              animate={{
                y: savePressed ? saveShadowHeight : 0,
                boxShadow: savePressed ? `0px 0px 0px ${darken(accentColor, 18)}` : `0px ${saveShadowHeight}px 0px ${darken(accentColor, 18)}`,
              }}
              transition={{ duration: 0 }}
              style={{ background: accentColor, border: '1px solid rgba(0,0,0,0.08)' }}
              onClick={async () => {
                try {
                  const uid = (u as any)?.id || (window as any)?.__exampliBoot?.user?.id;
                  if (!uid) throw new Error('No user id');
                  // сначала попробуем обновить, если профиль есть
                  let ok = false;
                  try {
                    const { data: upd, error: updErr } = await supabase
                      .from('user_profile')
                      .update({ background_color: sel, background_icon: tempBgIcon })
                      .eq('user_id', uid)
                      .select('user_id')
                      .single();
                    if (!updErr && upd) ok = true;
                  } catch {}
                  if (!ok) {
                    const { data: ins, error: insErr } = await supabase
                      .from('user_profile')
                      .insert({ user_id: uid, background_color: sel, background_icon: tempBgIcon })
                      .select('user_id')
                      .single();
                    if (insErr) throw insErr;
                  }
                  // обновим boot и кэш
                  try {
                    const boot: any = (window as any).__exampliBoot || {};
                    (boot.userProfile ||= {} as any).background_color = sel;
                    (boot.userProfile ||= {} as any).background_icon = tempBgIcon;
                    (window as any).__exampliBoot = boot;
                  } catch {}
                  try {
                    const prev = (cacheGet as any)(CACHE_KEYS.userProfile) || {};
                    cacheSet(CACHE_KEYS.userProfile, { ...prev, background_color: sel, background_icon: tempBgIcon });
                  } catch {}
                  setBg(sel);
                  setBgIcon(tempBgIcon);
                } catch (e) { try { console.warn('save color failed', e); } catch {} }
                setEditing(false);
              }}
            >
              Сохранить
            </motion.button>
            {/* Телеграм BackButton — отмена изменений */}
            <CancelOnTelegramBack onCancel={() => { setBg(baseBg); setSel(baseBg); setTempBgIcon(bgIcon); setEditing(false); }} active={editing} />
          </div>
        </>
      )}
      {/* Панель друзей как отдельный полноэкранный компонент */}
      <FriendsPanel open={friendsOpen} onClose={() => setFriendsOpen(false)} />
      {/* Панель добавления друзей */}
      <AddFriendsPanel open={addFriendsOpen} onClose={() => setAddFriendsOpen(false)} />

      {/* QR Overlay */}
      <AnimatePresence>
        {qrOpen && (
          <motion.div
            className="fixed inset-0 z-[50]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
            onClick={() => setQrOpen(false)}
          >
            <div className="w-full h-full flex items-center justify-center p-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="relative bg-white rounded-2xl shadow-2xl"
                style={{ width: 320, height: 320 }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                {/* QR картинка */}
                {qrImgUrl && (
                  <img src={qrImgUrl} alt="QR" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
                )}
                {/* Аватар в центре */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-xl overflow-hidden border border-black/10 shadow">
                  {photoUrl || u?.photo_url ? (
                    <img src={(photoUrl || u?.photo_url) as string} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-xl font-bold">
                      {initials}
                    </div>
                  )}
                </div>
                {qrLoading && (
                  <div className="absolute inset-0 grid place-items-center text-black/60">Генерация…</div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Streak Achievement Overlay */}
      <AnimatePresence>
        {streakAchOpen && (
          <motion.div
            className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => { try { hapticSlideClose(); } catch {} setStreakAchOpen(false); }}
          >
            <TgBackForStreak open={streakAchOpen} onBack={() => { try { hapticSlideClose(); } catch {} setStreakAchOpen(false); }} />
            <div className="w-full h-full flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="relative overflow-hidden rounded-2xl"
                style={{ width: 'min(560px, 96vw)', maxWidth: 620, background: '#3a1f1b' }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                {/* Top-right share only */}
                <div className="absolute right-0 top-0 p-3">
                  <button type="button" aria-label="Поделиться" onClick={() => { try { hapticSelect(); } catch {} void shareStreak(); }} className="p-3 rounded-full" style={{ background: 'transparent', border: 'none' }}>
                    <img src="/stickers/share_icon.svg" alt="share" className="w-6 h-6 opacity-95" />
                  </button>
                </div>
                <div className="px-6 pt-16 pb-10 text-center" style={{ color: '#ffb74d' }}>
                  <div className="flex items-center justify-center mb-4">
                    <AchBadge img="/profile/streak_ach.svg" value={Math.max(0, Number(u?.max_streak ?? u?.streak ?? 0))} stroke="#612300" fill="#9d4106" width={220} numBoost={26} bottomOffset={-8} />
                  </div>
                  <div className="inline-block text-sm px-3 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.08)', color: '#ffd08a' }}>{formatDate(getCreatedAt() || new Date())}</div>
                  <div className="mt-4 text-2xl font-extrabold text-center" style={{ color: '#ffb74d', textShadow: '0 1px 0 rgba(0,0,0,0.25)' }}>
                    Ты достиг стрика на {Math.max(0, Number(u?.max_streak ?? u?.streak ?? 0))} {(() => {
                      const n = Math.max(0, Number(u?.max_streak ?? u?.streak ?? 0));
                      if (n % 10 === 1 && n % 100 !== 11) return 'день';
                      if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'дня';
                      return 'дней';
                    })()}!
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Perfect Achievement Overlay */}
      <AnimatePresence>
        {perfectAchOpen && (
          <motion.div
            className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => { try { hapticSlideClose(); } catch {} setPerfectAchOpen(false); }}
          >
            <TgBackForStreak open={perfectAchOpen} onBack={() => { try { hapticSlideClose(); } catch {} setPerfectAchOpen(false); }} />
            <div className="w-full h-full flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="relative overflow-hidden rounded-2xl"
                style={{ width: 'min(560px, 96vw)', maxWidth: 620, background: '#0d2c0f' }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                {/* share button */}
                <div className="absolute right-0 top-0 p-3">
                  <button type="button" aria-label="Поделиться" onClick={() => { try { hapticSelect(); } catch {} void sharePerfect(); }} className="p-3 rounded-full" style={{ background: 'transparent', border: 'none' }}>
                    <img src="/stickers/share_icon.svg" alt="share" className="w-6 h-6 opacity-95" />
                  </button>
                </div>
                <div className="px-6 pt-16 pb-10 text-center" style={{ color: '#6cf087' }}>
                  <div className="flex items-center justify-center mb-4">
                    <AchBadge img="/profile/perfect_ach.svg" value={Math.max(0, Number(u?.perfect_lessons ?? 0))} stroke="#066629" fill="#1fb75b" width={220} numBoost={26} bottomOffset={-8} />
                  </div>
                  <div className="inline-block text-sm px-3 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.08)', color: '#b3f5c7' }}>{formatDate(getCreatedAt() || new Date())}</div>
                  <div className="mt-4 text-2xl font-extrabold text-center" style={{ color: '#6cf087', textShadow: '0 1px 0 rgba(0,0,0,0.25)' }}>
                    {(() => {
                      const n = Math.max(0, Number(u?.perfect_lessons ?? 0));
                      return `Ты прошёл без ошибок ${n} ${pluralLessons(n)}!`;
                    })()}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duel Achievement Overlay */}
      <AnimatePresence>
        {duelAchOpen && (
          <motion.div
            className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => { try { hapticSlideClose(); } catch {} setDuelAchOpen(false); }}
          >
            <TgBackForStreak open={duelAchOpen} onBack={() => { try { hapticSlideClose(); } catch {} setDuelAchOpen(false); }} />
            <div className="w-full h-full flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="relative overflow-hidden rounded-2xl"
                style={{ width: 'min(560px, 96vw)', maxWidth: 620, background: '#2e1f00' }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                <div className="absolute right-0 top-0 p-3">
                  <button type="button" aria-label="Поделиться" onClick={() => { try { hapticSelect(); } catch {} void shareDuel(); }} className="p-3 rounded-full" style={{ background: 'transparent', border: 'none' }}>
                    <img src="/stickers/share_icon.svg" alt="share" className="w-6 h-6 opacity-95" />
                  </button>
                </div>
                <div className="px-6 pt-16 pb-10 text-center" style={{ color: '#ffc159' }}>
                  <div className="flex items-center justify-center mb-4">
                    <AchBadge img="/profile/duel_ach.svg" value={Math.max(0, Number(u?.duel_wins ?? 0))} stroke="#ff9803" fill="#b35102" width={220} numBoost={26} bottomOffset={-8} />
                  </div>
                  <div className="inline-block text-sm px-3 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.08)', color: '#ffd08a' }}>{formatDate(getCreatedAt() || new Date())}</div>
                  <div className="mt-4 text-2xl font-extrabold text-center" style={{ color: '#ffc159', textShadow: '0 1px 0 rgba(0,0,0,0.25)' }}>
                    {(() => {
                      const n = Math.max(0, Number(u?.duel_wins ?? 0));
                      return `Ты одержал победу ${n} ${pluralTimes(n)} в дуэли`;
                    })()}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* mucus removed */}
    </div>
  );
}

function CancelOnTelegramBack({ active, onCancel }: { active: boolean; onCancel: () => void }) {
  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (!tg) return;
    if (!active) { try { tg.BackButton?.hide?.(); } catch {} return; }
    try {
      tg.BackButton?.show?.();
      const handler = () => { onCancel(); };
      tg.onEvent?.('backButtonClicked', handler);
      return () => { try { tg.offEvent?.('backButtonClicked', handler); tg.BackButton?.hide?.(); } catch {} };
    } catch { return; }
  }, [active, onCancel]);
  return null;
}

// Управляем BackButton Telegram для экрана достижения стрика
function TgBackForStreak({ open, onBack }: { open: boolean; onBack: () => void }) {
  useEffect(() => {
    try {
      const tg = (window as any)?.Telegram?.WebApp;
      if (!tg) return;
      if (open) {
        tg.BackButton?.show?.();
        const handler = () => { try { onBack(); } catch {} };
        tg.onEvent?.('backButtonClicked', handler);
        return () => { try { tg.offEvent?.('backButtonClicked', handler); tg.BackButton?.hide?.(); } catch {} };
      } else {
        tg.BackButton?.hide?.();
      }
    } catch {}
  }, [open, onBack]);
  return null;
}