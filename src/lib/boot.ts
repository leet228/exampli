// src/lib/boot.ts
import { supabase } from './supabase';
import { ensureUser } from './userState';
import { cacheSet, cacheGet, CACHE_KEYS } from './cache';

export type SubjectRow = {
  id: number;
  code: string;
  title: string;
  level: 'OGE' | 'EGE' | string;
};

export type LessonRow = {
  id: number | string;
  topic_id: number | string;
  order_index: number | string;
};

export type BootData = {
  user: any | null;
  stats: { streak: number; energy: number; coins: number };
  userProfile?: { background_color?: string | null; background_icon?: string | null; phone_number?: string | null; first_name?: string | null; username?: string | null } | null;
  friendsCount?: number;           // количество друзей
  subjects: SubjectRow[];        // все добавленные курсы пользователя
  lessons: LessonRow[];          // уроки активного курса
  subjectsAll?: SubjectRow[];    // все курсы (для AddCourseSheet)
  // onboarding больше не используем в логике, оставляем опционально для обратной совместимости
  onboarding?: { phone_given: boolean; course_taken: boolean } | null;
  // выбранная тема
  current_topic_id?: string | number | null;
  current_topic_title?: string | null;
  // предзагруженные данные для мгновенного открытия панели тем
  topicsBySubject?: Record<string, { id: number | string; subject_id: number | string; title: string; order_index: number }[]>;
};

const ACTIVE_KEY = 'exampli:activeSubjectCode';

function preloadImage(src: string) {
  return new Promise<void>((res) => {
    const img = new Image();
    img.onload = () => res();
    img.onerror = () => res();
    img.src = src;
  });
}

export async function bootPreload(onProgress?: (p: number) => void, onPhase?: (label: string) => void): Promise<BootData> {
  // Укрупняем прогресс до 3 фаз: ~33% / ~66% / 100%
  const step = (_i: number, _n: number) => {};
  const report = (p: number) => { try { onProgress?.(p); } catch {} };
  const phase = (label: string) => {
    try { onPhase?.(label); } catch {}
    try { window.dispatchEvent(new CustomEvent('exampli:bootPhase', { detail: { label } } as any)); } catch {}
  };

  // Раньше было 13 шагов — теперь показываем только 3 крупные фазы
  let i = 0;

  // ШАГ 1 — один запрос к нашему агрегирующему API /api/boot1 (критический путь)
  phase('Готовим профиль и прогресс');
  const tg = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user || null;
  let activeCodeHint: string | null = null;
  try { activeCodeHint = localStorage.getItem('exampli:activeSubjectCode'); } catch {}
  const r1 = await fetch('/api/boot1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_user: tg, start_param: (window as any)?.Telegram?.WebApp?.initDataUnsafe?.start_param || null, active_code: activeCodeHint })
  });
  const step1 = r1.ok ? await r1.json() : null;

  // Если гость — отдаём то, что пришло, и выходим
  if (!step1?.user?.id) {
    const boot: BootData = {
      user: null,
      stats: step1?.stats || { streak: 0, energy: 25, coins: 500 },
      userProfile: step1?.userProfile || { background_color: '#3280c2', background_icon: 'nothing', phone_number: null, first_name: null, username: null },
      subjects: step1?.subjects || [],
      lessons: step1?.lessons || [],
      onboarding: step1?.onboarding || { phone_given: false, course_taken: false, boarding_finished: false },
    };
    (window as any).__exampliBoot = boot as any;
    window.dispatchEvent(new CustomEvent('exampli:bootData', { detail: boot } as any));
    return boot;
  }
  // нормальный пользователь
  const userRow = step1.user;
  cacheSet(CACHE_KEYS.user, userRow);
  try { cacheSet(CACHE_KEYS.userAvatarUrl, (step1?.avatar_url as string) || (userRow?.avatar_url as string) || null); } catch {}
  const stats = step1.stats;
  cacheSet(CACHE_KEYS.stats, stats);
  try {
    if (step1?.last_streak_day) {
      cacheSet(CACHE_KEYS.lastStreakDay, String(step1.last_streak_day));
    }
  } catch {}
  // Отметим признак активной подписки локально (по plus_until > now)
  try {
    const plusUntil = (step1?.user?.plus_until as string) || null;
    const active = plusUntil ? (new Date(plusUntil).getTime() > Date.now()) : false;
    cacheSet(CACHE_KEYS.isPlus, active);
  } catch {}
  report(33);

  // 2a) Обработка ИНВАЙТА ПО ССЫЛКЕ (friend_invites) — отдельная ветка от обычных pending
  try {
    let inviteToken: string | null = null;
    // Telegram WebApp start_param
    try { inviteToken = String((window as any)?.Telegram?.WebApp?.initDataUnsafe?.start_param || '') || null; } catch {}
    // Fallback: параметр ?invite=
    if (!inviteToken) {
      try {
        const url = new URL(window.location.href);
        const p = url.searchParams.get('invite');
        if (p) {
          inviteToken = p;
          // очистим URL без перезагрузки
          try { url.searchParams.delete('invite'); window.history.replaceState({}, '', url.toString()); } catch {}
        }
      } catch {}
    }
    if (inviteToken && userRow?.id) {
      try { console.log('[boot] invite token detected:', inviteToken, 'caller:', userRow.id); } catch {}
      // 1) Пытаемся принять инвайт «по ссылке». Эта ветка НЕ использует локальный pending.
      let acc = await supabase.rpc('rpc_invite_accept', { invite: inviteToken, caller: userRow.id } as any);
      try {
        if (acc.error) {
          console.warn('[boot] rpc_invite_accept(caller) error:', acc.error);
        } else {
          console.log('[boot] rpc_invite_accept(caller) ok:', acc.data);
        }
      } catch {}
      if (acc.error) {
        const fallback = await supabase.rpc('rpc_invite_accept', { invite: inviteToken } as any);
        try {
          if (fallback.error) {
            console.warn('[boot] rpc_invite_accept(no-caller) error:', fallback.error);
          } else {
            console.log('[boot] rpc_invite_accept(no-caller) ok:', fallback.data);
          }
        } catch {}
        acc = fallback;
      }

      // 2) На всякий случай добьём входящие pending (если RPC оставил pending у второй стороны)
      try {
        const st = await supabase.rpc('rpc_friend_status_list', { caller: userRow.id, others: null } as any);
        try {
          if (st.error) console.warn('[boot] rpc_friend_status_list error:', st.error);
          else console.log('[boot] rpc_friend_status_list ok, rows:', st.data);
        } catch {}
        if (!st.error && Array.isArray(st.data)) {
          for (const row of (st.data as any[])) {
            const oid = (row as any)?.other_id as string | undefined;
            const status = String((row as any)?.status || '').toLowerCase();
            if (!oid) continue;
            if (status === 'pending') {
              try { console.log('[boot] rpc_friend_accept other_id:', oid); } catch {}
              const acc2 = await supabase.rpc('rpc_friend_accept', { other_id: oid, caller: userRow.id } as any);
              try {
                if (acc2.error) console.warn('[boot] rpc_friend_accept error:', acc2.error);
                else console.log('[boot] rpc_friend_accept ok');
              } catch {}
            }
          }
        }
      } catch {}

      // 3) Обновим кэши друзей и счётчик сразу (без ожидания следующих шагов)
      try {
        const [listR, countR] = await Promise.all([
          supabase.rpc('rpc_friend_list', { caller: userRow.id } as any),
          supabase.rpc('rpc_friend_count', { caller: userRow.id } as any),
        ]);
        if (!listR.error && Array.isArray(listR.data)) {
          let list = (listR.data as any[]).map(p => ({
            user_id: p.user_id || p.friend_id,
            first_name: p.first_name ?? null,
            username: p.username ?? null,
            background_color: p.background_color ?? null,
            background_icon: p.background_icon ?? null,
            avatar_url: (p as any)?.avatar_url ?? null,
          }));
          // обогатим avatar_url из users для отсутствующих значений
          try {
            const need = list.filter(r => !r.avatar_url).map(r => r.user_id);
            if (need.length) {
              const { data: usersData } = await supabase
                .from('users')
                .select('id, avatar_url')
                .in('id', need as string[]);
              const map = new Map<string, string | null>((usersData || []).map((u: any) => [String(u.id), (u?.avatar_url as string | null) ?? null]));
              list = list.map(r => ({ ...r, avatar_url: r.avatar_url ?? map.get(r.user_id) ?? null }));
            }
          } catch {}
          cacheSet(CACHE_KEYS.friendsList, list);
          try { (window as any).__exampliBootFriends = list; } catch {}
          try { console.log('[boot] refreshed friends list, count:', list.length); } catch {}
        }
        if (!countR.error) {
          const cnt = Number(countR.data || 0);
          cacheSet(CACHE_KEYS.friendsCount, cnt);
          try { (window as any).__exampliBoot = { ...(window as any).__exampliBoot, friendsCount: cnt }; } catch {}
          // Сообщим остальным компонентам, что друзья изменились
          try { window.dispatchEvent(new CustomEvent('exampli:friendsChanged', { detail: { count: Number(countR.data || 0) } } as any)); } catch {}
          try { console.log('[boot] refreshed friends count:', cnt); } catch {}
        } else {
          try { console.warn('[boot] rpc_friend_count error:', countR.error); } catch {}
        }
      } catch {}
    }
  } catch {}
  // (скрытый шаг)
  step(++i, 1);

  // 2d) количество друзей — cache-first, обновление в фоне (не блокируем UI)
  let friendsCountBoot: number | null = null;
  try { friendsCountBoot = cacheGet<number>(CACHE_KEYS.friendsCount) ?? null; } catch {}
  setTimeout(() => (async () => {
    try {
      const rpc = await supabase.rpc('rpc_friend_count', { caller: userRow?.id } as any);
      if (!rpc.error) {
        const cnt = Number(rpc.data || 0);
        cacheSet(CACHE_KEYS.friendsCount, cnt);
        try { window.dispatchEvent(new CustomEvent('exampli:friendsChanged', { detail: { count: cnt } } as any)); } catch {}
      } else {
        const { count } = await supabase
          .from('friend_links')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'accepted')
          .or(`a_id.eq.${userRow?.id},b_id.eq.${userRow?.id}`);
        const cnt = Number(count || 0);
        cacheSet(CACHE_KEYS.friendsCount, cnt);
        try { window.dispatchEvent(new CustomEvent('exampli:friendsChanged', { detail: { count: cnt } } as any)); } catch {}
      }
    } catch {}
  })(), 0);
  // (скрытый шаг)
  step(++i, 1);

  // 2g) Входящие приглашения — cache-first, обновление в фоне
  try {
    const cachedList = cacheGet<any[]>(CACHE_KEYS.invitesIncomingList) || [];
    const cachedCount = cacheGet<number>(CACHE_KEYS.invitesIncomingCount) || cachedList.length || 0;
    try { (window as any).__exampliBootInvites = cachedList; } catch {}
  } catch {}
  (async () => {
    try {
      if (userRow?.id) {
        const rpc = await supabase.rpc('rpc_friend_incoming', { caller: userRow.id } as any);
        if (!rpc.error && Array.isArray(rpc.data)) {
          let invites = (rpc.data as any[]).map((r) => ({
            other_id: r.other_id || r.friend_id || r.a_id || r.b_id,
            first_name: r.first_name ?? null,
            username: r.username ?? null,
            avatar_url: (r as any)?.avatar_url ?? null,
          }));
          try {
            const need = invites.filter(x => !x.avatar_url).map(x => x.other_id).filter(Boolean);
            if (need.length) {
              const { data: usersData } = await supabase
                .from('users')
                .select('id, avatar_url')
                .in('id', need as string[]);
              const map = new Map<string, string | null>((usersData || []).map((u: any) => [String(u.id), (u?.avatar_url as string | null) ?? null]));
              invites = invites.map(x => ({ ...x, avatar_url: x.avatar_url ?? map.get(x.other_id) ?? null }));
            }
          } catch {}
          cacheSet(CACHE_KEYS.invitesIncomingList, invites);
          cacheSet(CACHE_KEYS.invitesIncomingCount, invites.length);
          try { (window as any).__exampliBootInvites = invites; } catch {}
        } else {
          const { data: links } = await supabase
            .from('friend_links')
            .select('a_id,b_id,requester_id,status')
            .eq('status', 'pending')
            .neq('requester_id', userRow.id)
            .or(`a_id.eq.${userRow.id},b_id.eq.${userRow.id}`)
            .limit(50);
          const ids = Array.from(new Set((links as any[] || []).map((l: any) => (l.a_id === userRow.id ? l.b_id : l.a_id)).filter(Boolean)));
          let list: any[] = [];
          if (ids.length) {
            const [{ data: profs }, { data: usersData }] = await Promise.all([
              supabase.from('user_profile').select('user_id, first_name, username').in('user_id', ids as string[]),
              supabase.from('users').select('id, avatar_url').in('id', ids as string[]),
            ]);
            const byProf = new Map<string, any>((profs || []).map((p: any) => [String(p.user_id), p]));
            const byUser = new Map<string, any>((usersData || []).map((u: any) => [String(u.id), u]));
            list = ids.map((id) => ({
              other_id: id,
              first_name: byProf.get(String(id))?.first_name ?? null,
              username: byProf.get(String(id))?.username ?? null,
              avatar_url: byUser.get(String(id))?.avatar_url ?? null,
            }));
          }
          cacheSet(CACHE_KEYS.invitesIncomingList, list);
          cacheSet(CACHE_KEYS.invitesIncomingCount, list.length);
          try { (window as any).__exampliBootInvites = list; } catch {}
        }
      }
    } catch {}
  })();
  // (скрытый шаг)
  step(++i, 1);

  // 2e) список друзей — cache-first, обновление в фоне
  try { (window as any).__exampliBootFriends = cacheGet<any[]>(CACHE_KEYS.friendsList) || []; } catch {}
  (async () => {
    try {
      const r = await supabase.rpc('rpc_friend_list', { caller: userRow?.id } as any);
      if (!r.error && Array.isArray(r.data)) {
        let list = (r.data as any[]).map(p => ({
          user_id: p.user_id || p.friend_id,
          first_name: p.first_name ?? null,
          username: p.username ?? null,
          background_color: p.background_color ?? null,
          background_icon: p.background_icon ?? null,
          avatar_url: (p as any)?.avatar_url ?? null,
        }));
        try {
          const need = list.filter(r => !r.avatar_url).map(r => r.user_id);
          if (need.length) {
            const { data: usersData } = await supabase
              .from('users')
              .select('id, avatar_url')
              .in('id', need as string[]);
            const map = new Map<string, string | null>((usersData || []).map((u: any) => [String(u.id), (u?.avatar_url as string | null) ?? null]));
            list = list.map(r => ({ ...r, avatar_url: r.avatar_url ?? map.get(r.user_id) ?? null }));
          }
        } catch {}
        cacheSet(CACHE_KEYS.friendsList, list);
        try { (window as any).__exampliBootFriends = list; } catch {}
      }
    } catch {}
  })();
  // (скрытый шаг)
  step(++i, 1);

  // 2f) pending отправленные мной — восстановим из локального кэша в boot
  try {
    let sentMap: Record<string, boolean> = {};
    // 2f.1 читаем из базы все мои исходящие pending через RPC (обходит RLS)
    if (userRow?.id) {
      // берём исходящие pending и заодно подтверждённые, чтобы очистить локальный pending
      const r = await supabase.rpc('rpc_friend_status_list', { caller: userRow.id, others: null } as any);
      if (!r.error && Array.isArray(r.data)) {
        (r.data as any[]).forEach((row) => {
          const id = (row as any)?.other_id;
          const st = String((row as any)?.status || '').toLowerCase();
          if (!id) return;
          if (st === 'pending') sentMap[id] = true;
        });
      }
    }
    // 2f.2 мерджим с локальным кэшем (чтобы не терять локальные отметки)
    try {
      const localSent = cacheGet<Record<string, boolean>>(CACHE_KEYS.friendsPendingSent) || {};
      sentMap = { ...localSent, ...sentMap };
    } catch {}
    cacheSet(CACHE_KEYS.friendsPendingSent, sentMap);
    (window as any).__exampliBootFriendsPending = sentMap;
  } catch {}

  // 2c) профиль пользователя (цвет/иконка/телефон/имя)
  let userProfile: BootData['userProfile'] = null;
  try {
    if (userRow?.id) {
      const { data: prof } = await supabase
        .from('user_profile')
        .select('background_color, background_icon, phone_number, first_name, username')
        .eq('user_id', userRow.id)
        .single();
      userProfile = (prof as any) || null;
    }
  } catch {}
  if (!userProfile) {
    userProfile = { background_color: '#3280c2', background_icon: 'nothing', phone_number: userRow?.phone_number ?? null, first_name: null, username: null };
  }
  // (скрытый шаг)
  step(++i, 1);

  // 2b) онбординг теперь вычисляем только по phone_number в users
  let onboarding: { phone_given: boolean; course_taken: boolean } | null = null;
  if (userRow?.id) {
    const hasPhone = !!userRow?.phone_number;
    onboarding = {
      phone_given: hasPhone,
      // курс считаем «не блокирующим» условием онбординга, так что ставим true
      course_taken: true,
    };
  }
  // (скрытый шаг)
  step(++i, 1);

  // 3) выбранный курс пользователя (один) из users.added_course
  const subjectIds: number[] = userRow?.added_course ? [Number(userRow.added_course)] : [];
  // (скрытый шаг)
  step(++i, 1);

  // 4) выбранный предмет и уроки берём из step1
  phase('Курсы и уроки');
  let subjectsArr: SubjectRow[] = step1.subjects || [];
  // конец фазы 2 (курсы/уроки/темы) отметим позднее, когда прогреем темы (ниже)

  // 5) определяем активный курс (из localStorage или первый по списку)
  let activeCode: string | null = null;
  let activeId: number | null = null;
  let activeTitle: string | null = null;

  try { activeCode = step1.active_code || localStorage.getItem(ACTIVE_KEY); } catch {}

  if (activeCode) {
    const found = subjectsArr.find((s) => s.code === activeCode);
    if (found) {
      activeId = found.id;
      activeTitle = found.title;
    } else {
      // кода в списке больше нет — сбросим
      activeCode = null;
    }
  }

  if ((!activeCode || !activeId) && subjectsArr.length) {
    const first = subjectsArr[0];
    activeCode = first.code;
    activeId = first.id;
    activeTitle = first.title;
  }
  try { if (activeCode) localStorage.setItem(ACTIVE_KEY, activeCode); } catch {}
  if (activeCode) cacheSet(CACHE_KEYS.activeCourseCode, activeCode);
  // (скрытый шаг)
  step(++i, 1);

  // 6) уроки активной темы (если выбрана) — приходят из step1
  const currentTopicIdBoot: string | number | null = userRow?.current_topic ?? null;
  let lessonsArr: LessonRow[] = (step1.lessons || []).map((l: any) => ({ id: l.id, topic_id: l.topic_id, order_index: l.order_index }));
  if (currentTopicIdBoot != null) {
    try { cacheSet(CACHE_KEYS.lessonsByTopic(currentTopicIdBoot), lessonsArr as any); } catch {}
  }
  // (скрытый шаг)
  step(++i, 1);

  // 7) Темы активного курса — cache-first + прогрев иконок
  phase('Темы и иконки');
  let topicsBySubject: Record<string, any[]> = {};
  if (activeId) {
    try {
      const cachedT = cacheGet<any[]>(CACHE_KEYS.topicsBySubject(activeId)) || [];
      if (cachedT.length) topicsBySubject[String(activeId)] = cachedT;
    } catch {}
  }
  // Предзагрузку уроков для всех тем переносим в boot2 (фон)
  // Прогрев лого/иконок, важных для первого кадра
  try {
    await preloadImage('/kursik.svg');
  } catch {}
  if (activeCode) {
    try { await preloadImage(`/subjects/${activeCode}.svg`); } catch {}
  }
  // фаза 2 завершена
  report(66);

  // 8) Все предметы — cache-first, обновление и прогрев иконок в фоне
  let subjectsAll: SubjectRow[] = [];
  try { subjectsAll = cacheGet<SubjectRow[]>(CACHE_KEYS.subjectsAll) || []; } catch {}
  // (скрытый шаг)
  step(++i, 1);

  // 9) Прогрев иконок нижней навигации и HUD — дожидаемся загрузки
  phase('Финальный прогрев интерфейса');
  try {
    await Promise.all([
      preloadImage('/stickers/home.svg'),
      preloadImage('/stickers/quests.svg'),
      preloadImage('/stickers/battle.svg'),
      preloadImage('/stickers/ai.svg'),
      preloadImage('/stickers/diamond.svg'),
      preloadImage('/stickers/profile.svg'),
      preloadImage('/stickers/dead_fire.svg'),
      preloadImage('/stickers/coin_cat.svg'),
      preloadImage('/stickers/lightning.svg'),
    ]);
  } catch {}
  // финал boot
  report(100);

  // Попробуем восстановить название выбранной темы
  let currentTopicTitle: string | null = null;
  const currentTopicId: string | number | null = userRow?.current_topic ?? null;
  try {
    const t = localStorage.getItem('exampli:currentTopicTitle');
    if (t) currentTopicTitle = t;
  } catch {}

  const boot: BootData = {
    user: userRow ?? null,
    stats,
    userProfile,
    friendsCount: friendsCountBoot ?? undefined,
    // список друзей покладём рядом в window и кэш, чтобы не раздувать boot сильно
    subjects: subjectsArr,
    lessons: lessonsArr,
    subjectsAll,
    onboarding,
    current_topic_id: currentTopicId,
    current_topic_title: currentTopicTitle,
    topicsBySubject,
  };

  (window as any).__exampliBoot = boot;
  cacheSet(CACHE_KEYS.user, boot.user);
  cacheSet(CACHE_KEYS.activeCourseCode, activeCode || '');
  try { cacheSet(CACHE_KEYS.userProfile, userProfile); } catch {}

  // диспатчим bootData (как раньше)
  window.dispatchEvent(new CustomEvent('exampli:bootData', { detail: boot } as any));

  // и сообщаем активный курс всему приложению, если он есть
  if (activeCode && activeTitle) {
    window.dispatchEvent(new CustomEvent('exampli:courseChanged', {
      detail: { title: activeTitle, code: activeCode },
    } as any));
  }

  return boot;
}

// ШАГ 2 — один запрос к нашему агрегирующему API /api/boot2 (фон, после возврата boot)
export async function bootPreloadBackground(userId: string, activeId: number | null) {
  try {
    const r2 = await fetch('/api/boot2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, active_id: activeId })
    });
    if (!r2.ok) return;
    const data = await r2.json();
    try { cacheSet(CACHE_KEYS.friendsList, data.friends || []); } catch {}
    try { cacheSet(CACHE_KEYS.friendsCount, Array.isArray(data.friends) ? data.friends.length : 0); } catch {}
    try { cacheSet(CACHE_KEYS.invitesIncomingList, data.invites || []); cacheSet(CACHE_KEYS.invitesIncomingCount, (data.invites || []).length); } catch {}
    try { cacheSet(CACHE_KEYS.subjectsAll, data.subjectsAll || []); } catch {}
    try {
      const topicsBySubject = data.topicsBySubject || {};
      Object.entries(topicsBySubject).forEach(([sid, arr]) => cacheSet(CACHE_KEYS.topicsBySubject(sid), arr as any));
    } catch {}
    // Новое: предзагрузим уроки для тем активного курса, если сервер их вернул
    try {
      const lessonsByTopic = data.lessonsByTopic || {};
      Object.entries(lessonsByTopic).forEach(([tid, arr]) => {
        cacheSet(CACHE_KEYS.lessonsByTopic(tid), (arr as any[]) || []);
      });
      // Альтернатива: если пришли только counts
      const lessonCounts = data.lessonCountsByTopic || {};
      Object.entries(lessonCounts).forEach(([tid, count]) => {
        try {
          const key = CACHE_KEYS.lessonsByTopic(tid);
          const existing = cacheGet<any[]>(key);
          if (!existing || !Array.isArray(existing) || existing.length !== Number(count)) {
            const fake = Array.from({ length: Number(count || 0) }).map((_, i) => ({ id: `fake-${tid}-${i+1}`, topic_id: tid, order_index: i+1 }));
            cacheSet(key, fake as any);
          }
        } catch {}
      });
    } catch {}
  } catch {}
}

// Локальный прогрев тем и SVG‑иконок для указанного предмета.
// Используется при смене/добавлении курса, чтобы сразу положить всё в localStorage.
export async function precacheTopicsForSubject(subjectId: number | string): Promise<void> {
  try {
    // Темы
    const { data: topics } = await supabase
      .from('topics')
      .select('id, subject_id, title, order_index')
      .eq('subject_id', subjectId)
      .order('order_index', { ascending: true });
    const tlist = (topics as any[]) || [];
    try { cacheSet(CACHE_KEYS.topicsBySubject(subjectId), tlist); } catch {}

    // Иконки тем → data URL в localStorage (до 42)
    await Promise.all(
      tlist.slice(0, 42).map(async (t: any) => {
        const idx = Number(t.order_index);
        if (!Number.isFinite(idx)) return;
        try {
          const key = CACHE_KEYS.topicIconSvg(idx);
          const existing = cacheGet<string>(key);
          if (existing) return;
        } catch {}
        try {
          const res = await fetch(`/topics/${idx}.svg`);
          if (!res.ok) return;
          const svgText = await res.text();
          const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgText)}`;
          cacheSet(CACHE_KEYS.topicIconSvg(idx), dataUrl);
        } catch {}
      })
    );
  } catch {}
}