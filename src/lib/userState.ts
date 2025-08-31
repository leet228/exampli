import { supabase } from './supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from './cache';

export type UserStats = {
  id: string;
  xp: number;
  streak: number;
  hearts: number; // 0..5
  last_active_at: string | null;
  next_heart_at: string | null;
};

function getTgId(): string | null {
  const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id ? String(id) : null;
}

export async function ensureUser(): Promise<UserStats | null> {
  const tgId = getTgId();
  if (!tgId) return null;
  // найдём пользователя
  const { data: user } = await supabase.from('users').select('*').eq('tg_id', tgId).single();
  if (!user) {
    const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
    // определим таймзону браузера (IANA: Europe/Moscow и т.п.)
    let timezone: string | null = null;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch {}
    const { data: created } = await supabase.from('users').insert({
      tg_id: tgId,
      username: tgUser?.username,
      first_name: tgUser?.first_name,
      last_name: tgUser?.last_name,
      timezone,
    }).select('*').single();
    try { (window as any).__exampliNewUserCreated = true; } catch {}
    return created as any;
  }
  // если у существующего пользователя таймзона ещё не сохранена — сохраним текущую
  try {
    const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    if (!user.timezone && currentTz) {
      await supabase.from('users').update({ timezone: currentTz }).eq('id', (user as any).id);
      (user as any).timezone = currentTz;
    }
  } catch {}
  return user as any;
}

export function msUntil(dateIso: string): number {
  return new Date(dateIso).getTime() - Date.now();
}

export async function regenHeartsIfNeeded(u: UserStats): Promise<UserStats> {
  let hearts = u.hearts ?? 0;
  let nextAt = u.next_heart_at ? new Date(u.next_heart_at) : null;
  const now = new Date();

  // если сердец 5 — таймер не нужен
  if (hearts >= 5) return u;

  // если таймера нет — запускаем на час вперёд
  if (!nextAt) {
    nextAt = new Date(now.getTime() + 60 * 60 * 1000);
  }

  // начисляем по одному сердцу, пока прошли интервалы
  while (hearts < 5 && nextAt <= now) {
    hearts += 1;
    nextAt = new Date(nextAt.getTime() + 60 * 60 * 1000);
  }

  if (hearts !== u.hearts || (u.next_heart_at || '') !== nextAt.toISOString()) {
    const { data } = await supabase.from('users').update({
      hearts,
      next_heart_at: nextAt.toISOString(),
    }).eq('id', u.id).select('*').single();
    return data as any;
  }
  return u;
}

export async function getStats(): Promise<UserStats | null> {
  const base = await ensureUser();
  if (!base) return null;
  return await regenHeartsIfNeeded(base as any);
}

export async function canStartLesson(): Promise<boolean> {
  const u = await getStats();
  return (u?.hearts ?? 0) > 0;
}

export async function addUserSubject(subjectCode: string) {
  // заменяем семантику: теперь это установка users.added_course
  const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!id) return;

  const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(id)).single();
  if (!user?.id) return;

  const { data: subj } = await supabase.from('subjects').select('id,code,title').eq('code', subjectCode).single();
  if (!subj?.id) return;

  await supabase.from('users').update({ added_course: subj.id }).eq('id', user.id);

  window.dispatchEvent(new CustomEvent('exampli:courseChanged', { detail: { title: subj.title, code: subj.code } }));
  try { localStorage.setItem('exampli:activeSubjectCode', subj.code); } catch {}
  cacheSet(CACHE_KEYS.activeCourseCode, subj.code);
  // update cached user to avoid stale added_course
  try {
    const cached = cacheGet<any>(CACHE_KEYS.user) || {};
    cacheSet(CACHE_KEYS.user, { ...cached, id: user.id, added_course: subj.id });
  } catch {}
}

export async function finishLesson({ correct }: { correct: boolean }) {
  const u = await getStats();
  if (!u) return;
  const now = new Date();

  let { xp, streak, hearts, last_active_at } = u;

  if (correct) {
    xp = (xp || 0) + 10; // фиксировано
    // стрик: +1 если сегодня первый успех и вчера был активный день, иначе 1 если большая пауза
    const last = last_active_at ? new Date(last_active_at) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDay = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate()) : null;
    let newStreak = streak || 0;
    if (!last) newStreak = 1;
    else {
      const diffDays = Math.round((today.getTime() - (lastDay as Date).getTime()) / 86400000);
      if (diffDays >= 2) newStreak = 1; // пропуск
      else if (diffDays === 1) newStreak = newStreak + 1; // продолжил
      // diffDays 0 — тот же день — не меняем
    }
    streak = newStreak;
    last_active_at = now.toISOString();
  } else {
    hearts = Math.max(0, (hearts || 0) - 1);
    // если ушли в 4 или меньше и таймер пуст — запустить на час
    if (hearts < 5 && !u.next_heart_at) {
      const next = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from('users').update({ next_heart_at: next }).eq('id', u.id).select('*').single();
      Object.assign(u, data);
    }
  }

  await supabase.from('users').update({ xp, streak, hearts, last_active_at }).eq('id', u.id);
}

export async function setUserSubjects(subjectCodes: string[]) {
  // новая семантика: берём первый код и пишем его id в users.added_course
  const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!tgId) return;
  const { data: user } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).single();
  if (!user) return;
  const firstCode = subjectCodes[0];
  if (!firstCode) return;
  const { data: subj } = await supabase.from('subjects').select('id, code').eq('code', firstCode).single();
  if (!subj?.id) return;
  await supabase.from('users').update({ added_course: subj.id }).eq('id', user.id);
  try { localStorage.setItem('exampli:activeSubjectCode', subj.code); } catch {}
  cacheSet(CACHE_KEYS.activeCourseCode, subj.code);
  // update cached user to avoid stale added_course
  try {
    const cached = cacheGet<any>(CACHE_KEYS.user) || {};
    cacheSet(CACHE_KEYS.user, { ...cached, id: user.id, added_course: subj.id });
  } catch {}
}