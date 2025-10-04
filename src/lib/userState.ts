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

// Локальная проверка активности подписки (PLUS)
function isPlusActiveLocal(): boolean {
  try {
    const flag = cacheGet<boolean>(CACHE_KEYS.isPlus);
    if (typeof flag === 'boolean') return Boolean(flag);
  } catch {}
  try {
    const pu = (window as any)?.__exampliBoot?.user?.plus_until || (cacheGet<any>(CACHE_KEYS.user)?.plus_until);
    if (pu) return new Date(String(pu)).getTime() > Date.now();
  } catch {}
  return false;
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
  if (isPlusActiveLocal()) return true;
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
  // Не блокируемся на отсутствии getStats: для стрика достаточно user_id или tg_id
  let u: any = null;
  try { u = await getStats(); } catch {}
  if (correct) {
    // 1) Оптимистично обновим локальный кэш и UI (мгновенно)
    try {
      const now = new Date();
      const cu = (cacheGet<any>(CACHE_KEYS.user) || {}) as any;
      const tz: string | null = (cu?.timezone as string) || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'; } catch { return 'Europe/Moscow'; } })();
      const toParts = (d: Date | null): { y: number; m: number; d: number } | null => {
        if (!d) return null;
        try {
          const fmt = new Intl.DateTimeFormat(tz || undefined, { timeZone: tz || undefined, year: 'numeric', month: 'numeric', day: 'numeric' });
          const parts = fmt.formatToParts(d);
          const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
          const m = Number(parts.find(p => p.type === 'month')?.value || NaN) - 1;
          const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
          if ([y, m, dd].some(n => !Number.isFinite(n))) return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
          return { y, m, d: dd };
        } catch { return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; }
      };
      const lastLocal = cu?.last_active_at ? new Date(String(cu.last_active_at)) : ((u as any)?.last_active_at ? new Date(String((u as any).last_active_at)) : null);
      const tp = toParts(now)!;
      const lp = toParts(lastLocal);
      const todayStart = new Date(tp.y, tp.m, tp.d).getTime();
      const lastStart = lp ? new Date(lp.y, lp.m, lp.d).getTime() : null;
      const currentStreak = Number((cacheGet<any>(CACHE_KEYS.stats)?.streak) ?? (u as any)?.streak ?? 0);
      let optimisticStreak = currentStreak;
      let shouldInc = false;
      if (lastStart == null) { optimisticStreak = 1; shouldInc = true; }
      else {
        const diffDays = Math.round((todayStart - lastStart) / 86400000);
        if (diffDays <= 0) { shouldInc = false; }
        else if (diffDays === 1 || diffDays === 2) { optimisticStreak = currentStreak + 1; shouldInc = true; }
        else { optimisticStreak = 1; shouldInc = true; }
      }
      if (shouldInc) {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, streak: optimisticStreak });
        cacheSet(CACHE_KEYS.user, { ...cu, last_active_at: now.toISOString(), timezone: tz });
        // Также положим last_streak_day (локально — день по TZ пользователя)
        try {
          const toIso = (d: Date) => {
            const tzLocal = tz || 'Europe/Moscow';
            try {
              const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tzLocal, year: 'numeric', month: '2-digit', day: '2-digit' });
              const parts = fmt.formatToParts(d);
              const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
              const m = Number(parts.find(p => p.type === 'month')?.value || NaN);
              const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
              const pad = (n: number) => String(n).padStart(2, '0');
              return `${y}-${pad(m)}-${pad(dd)}`;
            } catch {
              const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1; const dd = d.getUTCDate();
              const pad = (n: number) => String(n).padStart(2, '0');
              return `${y}-${pad(m)}-${pad(dd)}`;
            }
          };
          const dayIso = toIso(now);
          cacheSet(CACHE_KEYS.lastStreakDay, dayIso);
          window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { streak: optimisticStreak, last_active_at: now.toISOString(), last_streak_day: dayIso } } as any));
        } catch {
          window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { streak: optimisticStreak, last_active_at: now.toISOString() } } as any));
        }
      }
    } catch {}

    // 2) Серверный апдейт — подтверждаем и правим кэш, если нужно
    try {
      const boot: any = (window as any).__exampliBoot || {};
      let userId: string | null = boot?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.id) || null;
      const tgIdRaw: any = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id || (cacheGet<any>(CACHE_KEYS.user)?.tg_id) || null;
      const tgId = tgIdRaw != null ? String(tgIdRaw) : null;
      if (!userId && tgId) {
        try {
          const { data: urow } = await supabase.from('users').select('id, streak, last_active_at').eq('tg_id', tgId).maybeSingle();
          if (urow?.id) {
            userId = String(urow.id);
            const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
            cacheSet(CACHE_KEYS.stats, { ...cs, streak: Number(urow.streak || cs.streak || 0) });
            const cu = cacheGet<any>(CACHE_KEYS.user) || {};
            cacheSet(CACHE_KEYS.user, { ...cu, id: userId, last_active_at: urow.last_active_at ?? cu.last_active_at ?? null });
          }
        } catch {}
      }
      const r = await fetch('/api/streak_finish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, tg_id: tgId })
      });
      if (r.ok) {
        let js: any = null;
        try { js = await r.json(); } catch {}
        const ok = js && (js.ok !== false) && (typeof js.streak === 'number');
        if (ok) {
          const serverStreak = Number(js.streak);
          try {
            const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
            cacheSet(CACHE_KEYS.stats, { ...cs, streak: serverStreak });
            const cu = cacheGet<any>(CACHE_KEYS.user) || {};
            cacheSet(CACHE_KEYS.user, { ...cu, id: js?.user_id || cu.id || userId, last_active_at: js?.last_active_at ?? cu.last_active_at ?? null, timezone: js?.timezone ?? cu.timezone ?? null });
            if (Array.isArray((js?.debug?.hasToday !== undefined) ? [] : undefined)) {}
            // Сервер не возвращает last_streak_day отдельным полем, но если он засчитан сегодня, проставим локально текущую дату
            try {
              const tzLocal = (cacheGet<any>(CACHE_KEYS.user)?.timezone as string) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
              const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tzLocal, year: 'numeric', month: '2-digit', day: '2-digit' });
              const parts = fmt.formatToParts(new Date());
              const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
              const m = Number(parts.find(p => p.type === 'month')?.value || NaN);
              const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
              const pad = (n: number) => String(n).padStart(2, '0');
              const todayIso = `${y}-${pad(m)}-${pad(dd)}`;
              cacheSet(CACHE_KEYS.lastStreakDay, todayIso);
              window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { streak: serverStreak, last_active_at: js?.last_active_at ?? null, last_streak_day: todayIso } } as any));
            } catch {
              window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { streak: serverStreak, last_active_at: js?.last_active_at ?? null } } as any));
            }
          } catch {}
        } else {
          // Fallback: сделаем клиентский апдейт users (если знаем userId)
          if (userId) {
            try {
              let tz: string | null = null;
              try { tz = (cacheGet<any>(CACHE_KEYS.user)?.timezone as string) || Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch {}
              const now = new Date();
              const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
              const current = Number(cs?.streak ?? 0);
              const { data } = await supabase
                .from('users')
                .update({ streak: Math.max(1, current), last_active_at: now.toISOString() })
                .eq('id', userId)
                .select('id, streak, last_active_at')
                .single();
              if (data) {
                const finalStreak = Number((data as any)?.streak ?? Math.max(1, current));
                const finalLast = (data as any)?.last_active_at ?? now.toISOString();
                cacheSet(CACHE_KEYS.stats, { ...cs, streak: finalStreak });
                const cu = cacheGet<any>(CACHE_KEYS.user) || {};
                cacheSet(CACHE_KEYS.user, { ...cu, id: userId, last_active_at: finalLast, timezone: tz });
                window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { streak: finalStreak, last_active_at: finalLast } } as any));
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  // Если был неправильный ответ (энергия--) — синхронизируем энергию, если знаем пользователя
  if (!correct && u?.id) {
    if (isPlusActiveLocal()) { /* при активной подписке энергию не тратим */ return; }
    try {
      const { data } = await supabase
        .from('users')
        .update({ energy: Math.max(0, Number(u?.energy || 0) - 1) })
        .eq('id', u.id)
        .select('id, energy')
        .single();
      if (data) {
        const ne = Number((data as any)?.energy ?? 0);
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, energy: ne });
        window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy: ne } } as any));
      }
    } catch {}
  }
}

// ================== ЭНЕРГИЯ: ленивая регенерация через RPC ==================
// Предполагается серверная функция public.sync_energy(delta int default 0)
// Боевое поведение: хранит очередь трат и восстанавливает по 1 ед/час (устойчивый график)
// Возвращает текущую энергию и опционально next_at/full_at
export async function syncEnergy(delta: number = 0): Promise<{ energy: number; next_at?: string | null; full_at?: string | null } | null> {
  try {
    // При активной подписке считаем энергию безлимитной (визуально 25)
    if (isPlusActiveLocal()) {
      const energy = 25;
      try {
        const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
        cacheSet(CACHE_KEYS.stats, { ...cs, energy, energy_full_at: null });
        window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy } } as any));
        window.dispatchEvent(new CustomEvent('exampli:energySynced', { detail: { energy, next_at: null, full_at: null } } as any));
      } catch {}
      return { energy, next_at: null, full_at: null };
    }
    // Получаем tg_id из Telegram или из кэша boot.user
    let tgId: string | null = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id
      ? String((window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id)
      : null;
    if (!tgId) {
      try { tgId = String(cacheGet<any>(CACHE_KEYS.user)?.tg_id || ''); } catch {}
    }
    if (!tgId) return null;

    // Вызов RPC с именованными параметрами
    const { data, error } = await supabase.rpc('sync_energy', { p_tg_id: tgId, p_delta: delta });
    if (error) { console.warn('[syncEnergy] rpc error', error); return null; }
    const row = Array.isArray(data) ? (data[0] as any) : (data as any);
    const energy = Number(row?.energy ?? NaN);
    if (Number.isNaN(energy)) return null;

    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
      cacheSet(CACHE_KEYS.stats, { ...cs, energy, energy_full_at: row?.full_at ?? null });
      window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy } } as any));
      window.dispatchEvent(new CustomEvent('exampli:energySynced', { detail: { energy, next_at: row?.next_at ?? null, full_at: row?.full_at ?? null } } as any));
    } catch {}
    return { energy, next_at: row?.next_at ?? null, full_at: row?.full_at ?? null };
  } catch (e) { console.warn('[syncEnergy] failed', e); return null; }
}

export async function spendEnergy(): Promise<number | null> {
  if (isPlusActiveLocal()) {
    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
      const energy = Math.max(0, Math.min(25, Number(cs?.energy ?? 25)));
      return energy;
    } catch { return 25; }
  }
  const res = await syncEnergy(-1);
  return res?.energy ?? null;
}

// Бонус за стрик: удалить первые p_bonus из очереди трат и прибавить энергию
export async function rewardEnergy(bonus: number): Promise<{ energy: number } | null> {
  try {
    if (!Number.isFinite(bonus) || bonus <= 0) return null;
    let tgId: string | null = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id
      ? String((window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id)
      : null;
    if (!tgId) {
      try { tgId = String(cacheGet<any>(CACHE_KEYS.user)?.tg_id || ''); } catch {}
    }
    if (!tgId) return null;

    const { data, error } = await supabase.rpc('reward_energy', { p_tg_id: tgId, p_bonus: Math.min(25, Math.max(1, Math.floor(bonus))) });
    if (error) { console.warn('[rewardEnergy] rpc error', error); return null; }
    const row = Array.isArray(data) ? (data[0] as any) : (data as any);
    const energy = Number(row?.energy ?? NaN);
    if (!Number.isFinite(energy)) return null;

    try {
      const cs = cacheGet<any>(CACHE_KEYS.stats) || {};
      cacheSet(CACHE_KEYS.stats, { ...cs, energy });
      window.dispatchEvent(new CustomEvent('exampli:statsChanged', { detail: { energy } } as any));
    } catch {}
    return { energy };
  } catch (e) { console.warn('[rewardEnergy] failed', e); return null; }
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