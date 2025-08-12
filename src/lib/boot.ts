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
  subjects: SubjectRow[];
  lessons: LessonRow[];
};

function preloadImage(src: string) {
  return new Promise<void>((res, rej) => {
    const img = new Image();
    img.onload = () => res();
    img.onerror = () => rej();
    img.src = src;
  });
}

export async function bootPreload(onProgress?: (p: number) => void): Promise<BootData> {
  const step = (i: number, n: number) => onProgress?.(Math.round((i / n) * 100));
  const TOTAL = 6;
  let i = 0;

  // 1) пользователь
  const user = await ensureUser();
  step(++i, TOTAL);

  // 2) статы пользователя
  const { data: statsRow } = await supabase
    .from('users')
    .select('xp,streak,hearts')
    .eq('id', user?.id ?? -1)
    .single();

  const stats = {
    xp: statsRow?.xp ?? 0,
    streak: statsRow?.streak ?? 0,
    hearts: statsRow?.hearts ?? 5,
  };
  step(++i, TOTAL);

  // 3) выбранные предметы
  const { data: rel } = await supabase
    .from('user_subjects')
    .select('subject_id')
    .eq('user_id', user?.id ?? -1);

  const subjectIds: number[] = Array.isArray(rel)
    ? rel.map((r: any) => Number(r.subject_id)).filter(Boolean)
    : [];
  step(++i, TOTAL);

  // 4) сами предметы
  let subjectsArr: SubjectRow[] = [];
  if (subjectIds.length) {
    const { data: subj } = await supabase
      .from('subjects')
      .select('id,code,title,level')
      .in('id', subjectIds)
      .order('title');

    subjectsArr = (subj ?? []) as SubjectRow[];
  }
  step(++i, TOTAL);

  // 5) уроки
  const { data: lessonsData } = await supabase
    .from('lessons')
    .select('id, title, subject:subject_id(title, level)')
    .in('subject_id', subjectIds.length ? subjectIds : [-1])
    .order('order_index', { ascending: true })
    .limit(12);

  const lessonsArr = (lessonsData ?? []) as LessonRow[];
  step(++i, TOTAL);

  // 6) прогрев изображения талисманов (не критично)
  try { await preloadImage('/mascots.png'); } catch {}
  step(++i, TOTAL);

  const boot: BootData = {
    user: user ?? null,
    stats,
    subjects: subjectsArr,
    lessons: lessonsArr,
  };

  (window as any).__exampliBoot = boot;
  // типизацию CustomEvent опускаем, чтобы TS не придирался
  window.dispatchEvent(new CustomEvent('exampli:bootData', { detail: boot } as any));

  return boot;
}
