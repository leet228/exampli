// src/lib/boot.ts
import { supabase } from './supabase';
import { ensureUser } from './userState';
import { cacheGet, cacheSet, CACHE_KEYS } from './cache';

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
  stats: { xp: number; streak: number; hearts: number };
  subjects: SubjectRow[];        // все добавленные курсы пользователя
  lessons: LessonRow[];          // уроки активного курса
  // onboarding больше не используем в логике, оставляем опционально для обратной совместимости
  onboarding?: { phone_given: boolean; course_taken: boolean; boarding_finished: boolean } | null;
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
  const toBool = (v: any): boolean => v === true || v === 1 || v === 't' || v === 'true' || v === 'TRUE' || v === 'True';

  // план шагов:
  // 1 user, 2 stats, 2b onboarding, 3 rel, 4 subjects, 5 choose active, 6 lessons, 7 image
  const TOTAL = 8;
  let i = 0;

  // 1) пользователь (ensureUser создаёт пользователя при необходимости)
  const cachedUser = cacheGet<any>(CACHE_KEYS.user);
  const user = cachedUser ?? await ensureUser();
  if (user) cacheSet(CACHE_KEYS.user, user, 5 * 60_000);
  step(++i, TOTAL);

  // Если работаем вне Telegram (нет пользователя) — считаем, что это новый пользователь: показываем онбординг
  if (!user?.id) {
    const boot: BootData = {
      user: null,
      stats: { xp: 0, streak: 0, hearts: 5 },
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
      .select('id,xp,streak,hearts,phone_number,added_course')
      .eq('id', user.id)
      .single();
    userRow = data as any;
    if (userRow) cacheSet(CACHE_KEYS.stats, { xp: userRow.xp ?? 0, streak: userRow.streak ?? 0, hearts: userRow.hearts ?? 5 }, 60_000);
  }

  const stats = {
    xp: userRow?.xp ?? 0,
    streak: userRow?.streak ?? 0,
    hearts: userRow?.hearts ?? 5,
  };
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

  try { activeCode = localStorage.getItem(ACTIVE_KEY) || cacheGet<string>(CACHE_KEYS.activeCourseCode) || null; } catch {}

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
    cacheSet(CACHE_KEYS.activeCourseCode, activeCode, 10 * 60_000);
  }
  step(++i, TOTAL);

  // 6) уроки ТОЛЬКО активного курса
  let lessonsArr: LessonRow[] = [];
  if (activeId) {
    let lessonsData: any[] | null = null;
    const cached = cacheGet<any[]>(CACHE_KEYS.lessonsByCode(activeCode || ''));
    if (cached) {
      lessonsData = cached as any[];
    } else {
      const resp = await supabase
        .from('lessons')
        .select('id, title')
        .eq('subject_id', activeId)
        .order('order_index', { ascending: true })
        .limit(12);
      lessonsData = (resp.data as any[]) ?? [];
      cacheSet(CACHE_KEYS.lessonsByCode(activeCode || ''), lessonsData, 5 * 60_000);
    }

    lessonsArr = (lessonsData ?? []).map((l: any) => ({
      id: l.id,
      title: l.title,
      subject: { title: activeTitle, level: null },
    })) as LessonRow[];
  }
  step(++i, TOTAL);

  // 7) прогрев твоего svg (не обязательно)
  await preloadImage('/kursik.svg');
  step(++i, TOTAL);

  const boot: BootData = {
    user: (userRow ?? user) ?? null,
    stats,
    subjects: subjectsArr,
    lessons: lessonsArr,
    onboarding,
  };

  (window as any).__exampliBoot = boot;
  cacheSet(CACHE_KEYS.user, boot.user, 5 * 60_000);
  cacheSet(CACHE_KEYS.activeCourseCode, activeCode || '', 10 * 60_000);

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