// src/lib/boot.ts
import { supabase } from './supabase';
import { ensureUser } from './userState';

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
  onboarding?: { phone_given: boolean; course_taken: boolean } | null;
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
  // 1 user, 2 stats, 3 rel, 4 subjects, 5 choose active, 6 lessons, 7 image
  const TOTAL = 7;
  let i = 0;

  // 1) пользователь
  const user = await ensureUser();
  step(++i, TOTAL);

  // 2) полные данные пользователя (включая phone_number)
  const { data: userRow } = await supabase
    .from('users')
    .select('id,xp,streak,hearts,phone_number')
    .eq('id', user?.id ?? -1)
    .single();

  const stats = {
    xp: userRow?.xp ?? 0,
    streak: userRow?.streak ?? 0,
    hearts: userRow?.hearts ?? 5,
  };
  step(++i, TOTAL);

  // 2b) onboarding row (ensure exists)
  let onboarding: { phone_given: boolean; course_taken: boolean } | null = null;
  if (userRow?.id) {
    const { data: ob } = await supabase
      .from('users_onboarding')
      .select('phone_given,course_taken')
      .eq('user_id', userRow.id)
      .single();
    if (ob) {
      onboarding = { phone_given: !!(ob as any).phone_given, course_taken: !!(ob as any).course_taken };
    } else {
      const { data: created } = await supabase
        .from('users_onboarding')
        .insert({ user_id: userRow.id, phone_given: false, course_taken: false })
        .select('phone_given,course_taken')
        .single();
      onboarding = created ? { phone_given: !!(created as any).phone_given, course_taken: !!(created as any).course_taken } : { phone_given: false, course_taken: false };
    }
  }
  step(++i, TOTAL);

  // 3) связи user → subjects
  const { data: rel } = await supabase
    .from('user_subjects')
    .select('subject_id')
    .eq('user_id', user?.id ?? -1);

  const subjectIds: number[] = Array.isArray(rel)
    ? rel.map((r: any) => Number(r.subject_id)).filter(Boolean)
    : [];
  step(++i, TOTAL);

  // 4) сами предметы пользователя
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
  }
  step(++i, TOTAL);

  // 6) уроки ТОЛЬКО активного курса
  let lessonsArr: LessonRow[] = [];
  if (activeId) {
    const { data: lessonsData } = await supabase
      .from('lessons')
      .select('id, title')
      .eq('subject_id', activeId)
      .order('order_index', { ascending: true })
      .limit(12);

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