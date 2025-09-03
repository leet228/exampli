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
  title: string;
  subject?: { title?: string | null; level?: string | null } | null;
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
  onboarding?: { phone_given: boolean; course_taken: boolean; boarding_finished: boolean } | null;
  // новые поля для восстановления выбранной темы/подтемы
  current_topic_id?: string | number | null;
  current_subtopic_id?: string | number | null;
  current_topic_title?: string | null;
  current_subtopic_title?: string | null;
  // предзагруженные данные для мгновенного открытия панелей
  topicsBySubject?: Record<string, { id: number | string; subject_id: number | string; title: string; order_index: number }[]>;
  subtopicsByTopic?: Record<string, { id: number | string; topic_id: number | string; title: string; order_index: number }[]>;
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

export async function bootPreload(onProgress?: (p: number) => void): Promise<BootData> {
  const step = (i: number, n: number) => onProgress?.(Math.round((i / n) * 100));

  // план шагов:
  // 1 user, 2 stats, 2a invite, 2b onboarding, 3 rel, 4 subjects, 5 choose active, 6 lessons, 7 image
  const TOTAL = 13;
  let i = 0;

  // 1) пользователь (ensureUser создаёт пользователя при необходимости)
  const user = await ensureUser();
  if (user) cacheSet(CACHE_KEYS.user, user);
  step(++i, TOTAL);

  // Если работаем вне Telegram (нет пользователя) — считаем, что это новый пользователь: показываем онбординг
  if (!user?.id) {
    const boot: BootData = {
      user: null,
      stats: { streak: 0, energy: 25, coins: 500 },
      userProfile: { background_color: '#3280c2', background_icon: 'nothing', phone_number: null, first_name: null, username: null },
      subjects: [],
      lessons: [],
      onboarding: { phone_given: false, course_taken: false, boarding_finished: false },
    };
    (window as any).__exampliBoot = boot as any;
    window.dispatchEvent(new CustomEvent('exampli:bootData', { detail: boot } as any));
    return boot;
  }

  // 2) полные данные пользователя (включая phone_number и added_course)
  let userRow: any | null = null;
  if (user?.id) {
    const { data } = await supabase
      .from('users')
      .select('id,streak,energy,coins,phone_number,added_course,current_topic,current_subtopic')
      .eq('id', user.id)
      .single();
    userRow = data as any;
    if (userRow) cacheSet(CACHE_KEYS.stats, { streak: userRow.streak ?? 0, energy: userRow.energy ?? 25, coins: userRow.coins ?? 500 });
  }

  const stats = {
    streak: userRow?.streak ?? 0,
    energy: userRow?.energy ?? 25,
    coins: userRow?.coins ?? 500,
  };
  step(++i, TOTAL);

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
          const list = (listR.data as any[]).map(p => ({
            user_id: p.user_id || p.friend_id,
            first_name: p.first_name ?? null,
            username: p.username ?? null,
            background_color: p.background_color ?? null,
            background_icon: p.background_icon ?? null,
          }));
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
  step(++i, TOTAL);

  // 2d) количество друзей — кэшируем без TTL
  let friendsCountBoot: number | null = null;
  try {
    // сначала через RPC (обходит RLS)
    const rpc = await supabase.rpc('rpc_friend_count', { caller: userRow?.id } as any);
    if (!rpc.error) {
      friendsCountBoot = Number(rpc.data || 0);
      cacheSet(CACHE_KEYS.friendsCount, friendsCountBoot);
    } else {
      const { count } = await supabase
        .from('friend_links')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`a_id.eq.${userRow?.id},b_id.eq.${userRow?.id}`);
      friendsCountBoot = Number(count || 0);
      cacheSet(CACHE_KEYS.friendsCount, friendsCountBoot);
    }
  } catch {}
  step(++i, TOTAL);

  // 2e) список друзей для кэша и boot
  try {
    const r = await supabase.rpc('rpc_friend_list', { caller: userRow?.id } as any);
    if (!r.error && Array.isArray(r.data)) {
      const list = (r.data as any[]).map(p => ({
        user_id: p.user_id || p.friend_id,
        first_name: p.first_name ?? null,
        username: p.username ?? null,
        background_color: p.background_color ?? null,
        background_icon: p.background_icon ?? null,
      }));
      cacheSet(CACHE_KEYS.friendsList, list);
      try { (window as any).__exampliBootFriends = list; } catch {}
    }
  } catch {}
  step(++i, TOTAL);

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
  step(++i, TOTAL);

  // 2b) онбординг теперь вычисляем только по phone_number в users
  let onboarding: { phone_given: boolean; course_taken: boolean; boarding_finished: boolean } | null = null;
  if (userRow?.id) {
    const hasPhone = !!userRow?.phone_number;
    onboarding = {
      phone_given: hasPhone,
      // курс считаем «не блокирующим» условием онбординга, так что ставим true
      course_taken: true,
      // finished — если телефон уже дан, онбординг не нужен
      boarding_finished: hasPhone,
    };
  }
  step(++i, TOTAL);

  // 3) выбранный курс пользователя (один) из users.added_course
  const subjectIds: number[] = userRow?.added_course ? [Number(userRow.added_course)] : [];
  step(++i, TOTAL);

  // 4) сам выбранный предмет пользователя (если есть)
  let subjectsArr: SubjectRow[] = [];
  if (subjectIds.length) {
    const { data: subj } = await supabase
      .from('subjects')
      .select('id,code,title,level')
      .in('id', subjectIds)
      .order('title', { ascending: true });

    subjectsArr = (subj ?? []) as SubjectRow[];
  }
  step(++i, TOTAL);

  // 5) определяем активный курс (из localStorage или первый по списку)
  let activeCode: string | null = null;
  let activeId: number | null = null;
  let activeTitle: string | null = null;

  try { activeCode = localStorage.getItem(ACTIVE_KEY); } catch {}

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

  if (!activeCode && subjectsArr.length) {
    const first = subjectsArr[0];
    activeCode = first.code;
    activeId = first.id;
    activeTitle = first.title;
    try { localStorage.setItem(ACTIVE_KEY, activeCode); } catch {}
    cacheSet(CACHE_KEYS.activeCourseCode, activeCode);
  }
  step(++i, TOTAL);

  // 6) уроки ТОЛЬКО активного курса
  let lessonsArr: LessonRow[] = [];
  if (activeId) {
    const resp = await supabase
      .from('lessons')
      .select('id, title')
      .eq('subject_id', activeId)
      .order('order_index', { ascending: true })
      .limit(12);
    const lessonsData: any[] = (resp.data as any[]) ?? [];
    cacheSet(CACHE_KEYS.lessonsByCode(activeCode || ''), lessonsData);

    lessonsArr = (lessonsData ?? []).map((l: any) => ({
      id: l.id,
      title: l.title,
      subject: { title: activeTitle, level: null },
    })) as LessonRow[];
  }
  step(++i, TOTAL);

  // 7) Префетч тем и подтем активного курса + прогрев иконок тем
  let topicsBySubject: Record<string, any[]> = {};
  let subtopicsByTopic: Record<string, any[]> = {};
  if (activeId) {
    try {
      const { data: topics } = await supabase
        .from('topics')
        .select('id, subject_id, title, order_index')
        .eq('subject_id', activeId)
        .order('order_index', { ascending: true });
      const tlist = (topics as any[]) || [];
      topicsBySubject[String(activeId)] = tlist;
      // подтемы пачкой
      const topicIds = tlist.map((t: any) => t.id);
      if (topicIds.length) {
        const { data: subs } = await supabase
          .from('subtopics')
          .select('id, topic_id, title, order_index')
          .in('topic_id', topicIds)
          .order('topic_id', { ascending: true })
          .order('order_index', { ascending: true });
        const slist = (subs as any[]) || [];
        slist.forEach((s: any) => {
          const key = String(s.topic_id);
          (subtopicsByTopic[key] ||= []).push(s);
        });
      }
      // прогрев svg иконок тем по order_index (первые 42 иконки в /topics)
      await Promise.all(
        tlist.slice(0, 42).map((t: any) => preloadImage(`/topics/${t.order_index}.svg`))
      );
    } catch {}
  }
  // параллельно прогреем основной лого
  await preloadImage('/kursik.svg');
  step(++i, TOTAL);

  // 8) Предзагрузка ВСЕХ предметов (OGE/EGE) для AddCourseSheet и прогрев их иконок
  let subjectsAll: SubjectRow[] = [];
  try {
    const { data } = await supabase
      .from('subjects')
      .select('id,code,title,level')
      .order('level', { ascending: true })
      .order('title', { ascending: true });
    subjectsAll = (data ?? []) as SubjectRow[];
    cacheSet(CACHE_KEYS.subjectsAll, subjectsAll);
    // прогреем svg для карточек
    await Promise.all(
      subjectsAll.slice(0, 24).map((s) => preloadImage(`/subjects/${s.code}.svg`))
    );
  } catch {}
  step(++i, TOTAL);

  // 9) Прогрев иконок нижней навигации и HUD
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
  step(++i, TOTAL);

  // Попробуем восстановить названия выбранных темы/подтемы
  let currentTopicTitle: string | null = null;
  let currentSubtopicTitle: string | null = null;
  const currentTopicId: string | number | null = userRow?.current_topic ?? null;
  const currentSubtopicId: string | number | null = userRow?.current_subtopic ?? null;
  try {
    const t = localStorage.getItem('exampli:currentTopicTitle');
    const s = localStorage.getItem('exampli:currentSubtopicTitle');
    if (t) currentTopicTitle = t;
    if (s) currentSubtopicTitle = s;
  } catch {}

  const boot: BootData = {
    user: (userRow ?? user) ?? null,
    stats,
    userProfile,
    friendsCount: friendsCountBoot ?? undefined,
    // список друзей покладём рядом в window и кэш, чтобы не раздувать boot сильно
    subjects: subjectsArr,
    lessons: lessonsArr,
    subjectsAll,
    onboarding,
    current_topic_id: currentTopicId,
    current_subtopic_id: currentSubtopicId,
    current_topic_title: currentTopicTitle,
    current_subtopic_title: currentSubtopicTitle,
    topicsBySubject,
    subtopicsByTopic,
  };

  (window as any).__exampliBoot = boot;
  cacheSet(CACHE_KEYS.user, boot.user);
  cacheSet(CACHE_KEYS.activeCourseCode, activeCode || '');
  cacheSet(CACHE_KEYS.userProfile, userProfile);

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