// src/lib/userState.ts
import {
  apiUser,
  apiSyncTg,
  apiAddCourseToUser,
  apiSetCurrentCourse,
  apiCourses,
} from './api';

export type UserStats = {
  id: string;
  xp: number;
  streak: number;
  hearts: number; // 0..5  (производная от energy/5)
  last_active_at: string | null; // храним локально (LS)
  next_heart_at: string | null;  // таймер регена — локально (LS)
};

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.kursik.online';

const LS_NEXT_ENERGY_AT = 'exampli:nextEnergyAt';
const LS_LAST_ACTIVE_AT = 'exampli:lastActiveAt';
const ACTIVE_COURSE_ID = 'exampli:activeCourseId';

const ENERGY_MAX = 25;
const HEART_STEP = 5; // 5 energy == 1 heart
const TICK_MS = 60 * 60 * 1000; // 1h

function getTgId(): string | null {
  const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id ? String(id) : null;
}

function heartsFromEnergy(energy: number) {
  return Math.max(0, Math.min(5, Math.round(energy / HEART_STEP)));
}

function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

async function patchUser(fields: Partial<{ xp: number; streak: number; energy: number; last_active_at: string | null }>) {
  const tg_id = getTgId();
  if (!tg_id) return null;
  const r = await fetch(`${API_BASE}/users/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_id, ...fields }),
  });
  // если на сервере ещё нет эндпоинта — не роняем клиент
  try { return await r.json(); } catch { return null; }
}

export async function ensureUser(): Promise<UserStats | null> {
  const tgId = getTgId();
  if (!tgId) return null;

  let u = await apiUser();
  if (!u) {
    await apiSyncTg();
    u = await apiUser();
  }
  if (!u) return null;

  // energy из БД (0..25) → hearts (0..5)
  const energy = typeof u.energy === 'number' ? u.energy : ENERGY_MAX;
  const hearts = heartsFromEnergy(energy);

  const last_local = readLS(LS_LAST_ACTIVE_AT);
  const next_local = readLS(LS_NEXT_ENERGY_AT);

  return {
    id: String(u.id),
    xp: u.xp ?? 0,
    streak: u.streak ?? 0,
    hearts,
    last_active_at: last_local,
    next_heart_at: next_local,
  };
}

export function msUntil(dateIso: string): number {
  return new Date(dateIso).getTime() - Date.now();
}

export async function regenHeartsIfNeeded(u: UserStats): Promise<UserStats> {
  // реген делаем по energy, а в UI продолжаем называть hearts
  let hearts = u.hearts ?? 0;
  let nextAt = u.next_heart_at ? new Date(u.next_heart_at) : null;
  const now = new Date();

  if (hearts >= 5) {
    // если было 5/5 — убедимся, что таймер сброшен
    if (u.next_heart_at) {
      writeLS(LS_NEXT_ENERGY_AT, '');
    }
    return u;
  }

  if (!nextAt) {
    nextAt = new Date(now.getTime() + TICK_MS);
  }

  // При каждом «тике» +1 heart (т.е. +5 energy)
  let energyDelta = 0;
  while (hearts < 5 && nextAt <= now) {
    hearts += 1;
    energyDelta += HEART_STEP;
    nextAt = new Date(nextAt.getTime() + TICK_MS);
  }

  if (energyDelta > 0) {
    // Сохраняем energy на сервере
    await patchUser({ energy: hearts * HEART_STEP });
    writeLS(LS_NEXT_ENERGY_AT, nextAt.toISOString());
  }

  return {
    ...u,
    hearts,
    next_heart_at: nextAt.toISOString(),
  };
}

export async function getStats(): Promise<UserStats | null> {
  const base = await ensureUser();
  if (!base) return null;
  return await regenHeartsIfNeeded(base);
}

export async function canStartLesson(): Promise<boolean> {
  const u = await getStats();
  return (u?.hearts ?? 0) > 0;
}

export async function addUserSubject(subjectCode: string) {
  // Новый путь: находим курс по code → добавляем пользователю → делаем текущим
  const courses = await apiCourses();
  const course = (courses || []).find((c) => c.code === subjectCode);
  if (!course) return;

  await apiAddCourseToUser({ course_id: course.id });
  await apiSetCurrentCourse(course.id);

  writeLS(ACTIVE_COURSE_ID, String(course.id));
  window.dispatchEvent(
    new CustomEvent('exampli:courseChanged', {
      detail: { title: course.title, code: course.code },
    })
  );
}

export async function finishLesson({ correct }: { correct: boolean }) {
  const u = await apiUser(); // свежие значения с сервера
  if (!u) return;

  const now = new Date();
  const lastLocal = readLS(LS_LAST_ACTIVE_AT);
  const last = lastLocal ? new Date(lastLocal) : null;

  let xp = u.xp ?? 0;
  let streak = u.streak ?? 0;
  let energy = typeof u.energy === 'number' ? u.energy : ENERGY_MAX;

  if (correct) {
    xp += 10;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDay = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate()) : null;

    if (!last) {
      streak = 1;
    } else {
      const diffDays = Math.round((today.getTime() - (lastDay as Date).getTime()) / 86400000);
      if (diffDays >= 2) streak = 1;       // пропуск
      else if (diffDays === 1) streak += 1; // продолжил
      // 0 — тот же день, не меняем
    }

    writeLS(LS_LAST_ACTIVE_AT, now.toISOString());
    await patchUser({ xp, streak, last_active_at: now.toISOString() });
  } else {
    energy = Math.max(0, energy - HEART_STEP); // минус 1 heart
    await patchUser({ energy });

    // если стало < 5 hearts и таймер пуст — запустим
    const hearts = heartsFromEnergy(energy);
    const nextLocal = readLS(LS_NEXT_ENERGY_AT);
    if (hearts < 5 && !nextLocal) {
      const next = new Date(now.getTime() + TICK_MS).toISOString();
      writeLS(LS_NEXT_ENERGY_AT, next);
    }
  }
}

export async function setUserSubjects(subjectCodes: string[]) {
  // Теперь это «выбрать курс» по коду (берём первый из списка)
  if (!subjectCodes.length) return;
  const code = subjectCodes[0];

  const courses = await apiCourses();
  const course = (courses || []).find((c) => c.code === code);
  if (!course) return;

  await apiAddCourseToUser({ course_id: course.id });
  await apiSetCurrentCourse(course.id);

  writeLS(ACTIVE_COURSE_ID, String(course.id));
  window.dispatchEvent(
    new CustomEvent('exampli:courseChanged', {
      detail: { title: course.title, code: course.code },
    })
  );
}
