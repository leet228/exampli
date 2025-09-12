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

// ================== ЭНЕРГИЯ: ленивая регенерация через RPC ==================
// Предполагается серверная функция public.sync_energy(delta int default 0)
// Семантика: хранит очередь трат за последний час и восстанавливает по 1 ед/час
// Возвращает текущую энергию и опционально next_at (время следующего восстановления)
export async function syncEnergy(delta: number = 0): Promise<{ energy: number; next_at?: string | null; full_at?: string | null } | null> {
  try {
    // Получаем tg_id из Telegram или из кэша boot.user
    let tgId: string | null = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id
      ? String((window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id)
      : null;
    if (!tgId) {
      try { tgId = String(cacheGet<any>(CACHE_KEYS.user)?.tg_id || ''); } catch {}
    }
    if (!tgId) return null;

    // Пытаемся вызвать RPC с разными наборами имён (логируем каждую попытку)
    let data: any = null; let error: any = null; let row: any = null;
    try {
      ({ data, error } = await supabase.rpc('sync_energy', { p_tg_id: tgId, p_delta: delta }));
      if (error) console.warn('[syncEnergy] RPC attempt A failed', { args: { p_tg_id: tgId, p_delta: delta }, error });
    } catch (eA) { console.warn('[syncEnergy] RPC attempt A threw', eA); }
    if (error || !data) {
      try {
        ({ data, error } = await supabase.rpc('sync_energy', { p_delta: delta, p_tg_id: tgId } as any));
        if (error) console.warn('[syncEnergy] RPC attempt B failed', { args: { p_delta: delta, p_tg_id: tgId }, error });
      } catch (eB) { console.warn('[syncEnergy] RPC attempt B threw', eB); }
    }
    if (error || !data) {
      try {
        ({ data, error } = await supabase.rpc('sync_energy', { tg_id: tgId, delta } as any));
        if (error) console.warn('[syncEnergy] RPC attempt C failed', { args: { tg_id: tgId, delta }, error });
      } catch (eC) { console.warn('[syncEnergy] RPC attempt C threw', eC); }
    }
    if (error || !data) {
      try {
        ({ data, error } = await supabase.rpc('sync_energy', { delta, tg_id: tgId } as any));
        if (error) console.warn('[syncEnergy] RPC attempt D failed', { args: { delta, tg_id: tgId }, error });
      } catch (eD) { console.warn('[syncEnergy] RPC attempt D threw', eD); }
    }
    if (error) { try { console.warn('[syncEnergy] rpc error (final)', error); } catch {} }
    row = Array.isArray(data) ? (data[0] as any) : (data as any);
    const energy = Number(row?.energy ?? NaN);
    if (!Number.isNaN(energy)) {
      try {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, energy });
        window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy } } as any));
      } catch {}
      return { energy, next_at: row?.next_at ?? null, full_at: row?.full_at ?? null };
    }
    // Fallback: выполнить логику на клиенте и записать напрямую, если RPC не вернул данных
    try {
      // найдём пользователя по tg_id или по id из кэша boot
      let userRow: any = null;
      if (tgId) {
        const q1 = await supabase
          .from('users')
          .select('id, energy, energy_spent_times')
          .eq('tg_id', tgId)
          .single();
        userRow = q1.data;
        if (!userRow) console.warn('[syncEnergy:fallback] user by tg_id not found', { tgId, q1 });
      }
      if (!userRow) {
        try {
          const cachedId = cacheGet<any>(CACHE_KEYS.user)?.id || null;
          if (cachedId) {
            const q2 = await supabase
              .from('users')
              .select('id, energy, energy_spent_times')
              .eq('id', cachedId)
              .single();
            userRow = q2.data;
            if (!userRow) console.warn('[syncEnergy:fallback] user by id not found', { cachedId, q2 });
          }
        } catch {}
      }
      if (userRow?.id) {
        const nowIso = new Date().toISOString();
        const spent: string[] = Array.isArray(userRow.energy_spent_times) ? userRow.energy_spent_times : [];
        const cutoffMs = Date.now() - 3600_000;
        const cleaned = spent.filter((ts: string) => {
          const t = Date.parse(ts); return Number.isFinite(t) && t > cutoffMs;
        });
        let currentEnergy = 25 - cleaned.length;
        let newSpent = cleaned.slice();
        if (delta < 0 && currentEnergy > 0) {
          newSpent.push(nowIso);
        }
        currentEnergy = 25 - newSpent.length;
        const upd = await supabase.from('users').update({ energy: currentEnergy, energy_spent_times: newSpent }).eq('id', userRow.id).select('id');
        console.debug('[syncEnergy:fallback] wrote users row', { id: userRow.id, upd });
        try {
          const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
          cacheSet(CACHE_KEYS.stats, { ...cs, energy: currentEnergy });
          window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: currentEnergy } } as any));
        } catch {}
        return { energy: currentEnergy, next_at: null, full_at: null };
      }
      console.warn('[syncEnergy:fallback] cannot update — userRow missing');
    } catch (e2) { try { console.warn('[syncEnergy:fallback] failed', e2); } catch {} }
  } catch (e) { try { console.warn('[syncEnergy] failed', e); } catch {} }
  return null;
}

export async function spendEnergy(): Promise<number | null> {
  const res = await syncEnergy(-1);
  return res?.energy ?? null;
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