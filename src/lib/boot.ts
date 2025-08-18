// src/lib/boot.ts

import {
  apiUser,
  apiSyncTg,
  apiUserCourses,
  apiLessonsByCourse,
  type Course,
} from './api';

export type SubjectRow = {
  id: number;
  code: string;
  title: string;
  level: 'OGE' | 'EGE' | string;
};

export type LessonRow = {
  id: number | string;
  title: string;
  // оставляем прежнее имя "subject", но заполняем данными курса
  subject?: { title?: string | null; level?: string | null } | null;
};

export type BootData = {
  user: any | null;
  stats: { xp: number; streak: number; hearts: number }; // hearts = energy/5
  subjects: SubjectRow[];   // все добавленные курсы пользователя
  lessons: LessonRow[];     // уроки активного курса
};

// новый ключ, но поддержим и старый для миграции
const ACTIVE_ID_KEY = 'exampli:activeCourseId';
const LEGACY_ACTIVE_CODE_KEY = 'exampli:activeSubjectCode';

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
  // 1 user, 2 stats, 3 subjects, 4 choose active, 5 lessons, 6 image, 7 dispatch
  const TOTAL = 7;
  let i = 0;

  // 1) пользователь (создаём при необходимости)
  let user = await apiUser();
  if (!user) {
    await apiSyncTg();
    user = await apiUser();
  }
  step(++i, TOTAL);

  // 2) статы (из users)
  const xp = user?.xp ?? 0;
  const streak = user?.streak ?? 0;
  const energy = typeof user?.energy === 'number' ? user!.energy : 25; // 0..25
  const hearts = Math.max(0, Math.min(5, Math.round(energy / 5)));     // 0..5
  const stats = { xp, streak, hearts };
  step(++i, TOTAL);

  // 3) курсы пользователя → subjects
  const courses = (await apiUserCourses()) as Course[];
  const subjectsArr: SubjectRow[] = (courses || []).map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    // нормализуем в верхний регистр, как было
    level: (c.level || '') as any,
  }));
  step(++i, TOTAL);

  // 4) определяем активный курс (по id), с поддержкой старого ключа code
  let activeId: number | null = null;
  let activeTitle: string | null = null;
  let activeCode: string | null = null;

  // сперва читаем новый ключ
  try {
    const v = localStorage.getItem(ACTIVE_ID_KEY);
    if (v) activeId = Number(v);
  } catch {}

  // если нового нет — попробуем мигрировать со старого ключа (code)
  if (!activeId) {
    let legacyCode: string | null = null;
    try { legacyCode = localStorage.getItem(LEGACY_ACTIVE_CODE_KEY); } catch {}
    if (legacyCode) {
      const found = subjectsArr.find((s) => s.code === legacyCode);
      if (found) activeId = found.id;
    }
  }

  // если всё ещё нет — возьмём первый курс из списка
  if (!activeId && subjectsArr.length) {
    activeId = subjectsArr[0].id;
  }

  // установим служебные переменные и LS
  if (activeId && subjectsArr.length) {
    const found = subjectsArr.find((s) => s.id === activeId) || subjectsArr[0];
    activeId   = found.id;
    activeTitle= found.title;
    activeCode = found.code;
    try {
      localStorage.setItem(ACTIVE_ID_KEY, String(activeId));
      // удалять старый код не обязательно, но можно:
      // localStorage.removeItem(LEGACY_ACTIVE_CODE_KEY);
    } catch {}
  }
  step(++i, TOTAL);

  // 5) уроки активного курса
  let lessonsArr: LessonRow[] = [];
  if (activeId) {
    const lessons = await apiLessonsByCourse(activeId);
    lessonsArr = (lessons || []).slice(0, 12).map((l) => ({
      id: l.id,
      title: l.lesson, // ← поле из новой схемы
      subject: { title: activeTitle, level: null },
    }));
  }
  step(++i, TOTAL);

  // 6) лёгкий прогрев ассета (опционально)
  await preloadImage('/kursik.svg');
  step(++i, TOTAL);

  // 7) собрать и отдать BootData + события
  const boot: BootData = {
    user: user ?? null,
    stats,
    subjects: subjectsArr,
    lessons: lessonsArr,
  };

  (window as any).__exampliBoot = boot;

  // отдадим bootData всему приложению (как раньше)
  window.dispatchEvent(
    new CustomEvent('exampli:bootData', { detail: boot } as any)
  );

  // и сообщим активный курс
  if (activeTitle && activeCode) {
    window.dispatchEvent(
      new CustomEvent('exampli:courseChanged', {
        detail: { title: activeTitle, code: activeCode },
      } as any)
    );
  }

  step(++i, TOTAL);
  return boot;
}