import { supabase } from './supabase';

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
    const { data: created } = await supabase.from('users').insert({
      tg_id: tgId,
      username: tgUser?.username,
      first_name: tgUser?.first_name,
      last_name: tgUser?.last_name,
    }).select('*').single();
    return created as any;
  }
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
  const tgId = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (!tgId) return;
  const { data: user } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).single();
  if (!user) return;
  const { data: subs } = await supabase.from('subjects').select('id, code').in('code', subjectCodes);
  if (!subs) return;
  // очистим старые и вставим новые
  await supabase.from('user_subjects').delete().eq('user_id', user.id);
  await supabase.from('user_subjects').insert(subs.map(s => ({ user_id: user.id, subject_id: s.id })));
}