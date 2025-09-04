import { supabase } from './supabase';
import { cacheGet, cacheSet, CACHE_KEYS } from './cache';

export type UserStats = {
  id: string;
  streak: number;
  energy: number; // 0..25
  coins: number;  // >= 0
  last_active_at: string | null;
};

function getTgId(): string | null {
  const id = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return id ? String(id) : null;
}

export async function ensureUser(): Promise<UserStats | null> {
  const tgId = getTgId();
  if (!tgId) return null;
  // найдём пользователя
  const { data: user, error: selErr } = await supabase.from('users').select('*').eq('tg_id', tgId).maybeSingle();
  if (selErr) { try { console.error('[ensureUser] select users error', selErr); } catch {} }
  if (!user) {
    const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
    // определим таймзону браузера (IANA: Europe/Moscow и т.п.)
    let timezone: string | null = null;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch {}
    // upsert по tg_id — безопаснее при повторных заходах/гонках
    const { data: created, error: insErr } = await supabase
      .from('users')
      .upsert({
        tg_id: tgId,
        username: tgUser?.username,
        first_name: tgUser?.first_name,
        last_name: tgUser?.last_name,
        avatar_url: tgUser?.photo_url ?? null,
        timezone,
        // дефолты при первом создании
        energy: 25,
        coins: 500,
      }, { onConflict: 'tg_id' })
      .select('*')
      .single();
    if (insErr) { try { console.error('[ensureUser] upsert users error', insErr); } catch {} }
    // создать профиль пользователя с дефолтами
    try {
      const uid = (created as any)?.id;
      if (uid) {
        await supabase.from('user_profile').upsert({
          user_id: uid,
          first_name: tgUser?.first_name ?? null,
          username: tgUser?.username ?? null,
          phone_number: null,
          background_color: '#3280c2',
          background_icon: 'bg_icon_cat',
        }, { onConflict: 'user_id' });
      }
    } catch (e) { try { console.warn('user_profile insert failed', e); } catch {} }
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
  // обновим avatar_url из Telegram, если он отсутствует или изменился
  try {
    const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
    const photo = tgUser?.photo_url as string | undefined;
    if (photo && (user as any)?.avatar_url !== photo) {
      await supabase.from('users').update({ avatar_url: photo }).eq('id', (user as any).id);
      (user as any).avatar_url = photo;
    }
  } catch {}
  // ensure user_profile существует для существующего пользователя
  try {
    const uid = (user as any)?.id;
    if (uid) {
      const { data: prof } = await supabase
        .from('user_profile')
        .select('user_id')
        .eq('user_id', uid)
        .maybeSingle?.();
      const exists = (prof as any)?.user_id != null;
      if (!exists) {
        const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
        await supabase.from('user_profile').insert({
          user_id: uid,
          first_name: tgUser?.first_name ?? null,
          username: tgUser?.username ?? null,
          phone_number: (user as any)?.phone_number ?? null,
          background_color: '#3280c2',
          background_icon: 'bg_icon_cat',
        });
      }
    }
  } catch (e) { try { console.warn('ensure user_profile failed', e); } catch {} }
  return user as any;
}

export async function getStats(): Promise<UserStats | null> {
  const base = await ensureUser();
  if (!base) return null;
  // энергия теперь без регенерации таймером; отдаём как есть
  return base as any;
}

export async function canStartLesson(): Promise<boolean> {
  const u = await getStats();
  return (u?.energy ?? 0) > 0;
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

  let { streak, energy, last_active_at } = u as any;

  if (correct) {
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
    energy = Math.max(0, (energy || 0) - 1);
  }

  await supabase.from('users').update({ streak, energy, last_active_at }).eq('id', (u as any).id);
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