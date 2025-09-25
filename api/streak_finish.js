// ESM serverless function: finalize daily streak on lesson finish
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.status(500).json({ ok: false, code: 'env_missing', error: 'Missing Supabase env', details: { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey } });
      return;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const userId = body?.user_id || null;
    const tgId = body?.tg_id ? String(body.tg_id) : null;
    if (!userId && !tgId) { res.status(400).json({ error: 'user_id_or_tg_id_required' }); return; }

    // Load user row
    let userRow = null;
    if (userId) {
      const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
      userRow = data || null;
    } else if (tgId) {
      const { data } = await supabase.from('users').select('*').eq('tg_id', tgId).maybeSingle();
      userRow = data || null;
    }
    if (!userRow?.id) { res.status(404).json({ ok: false, code: 'user_not_found' }); return; }

    const now = new Date();
    // Важно: считаем «сегодня» в таймзоне пользователя; если не задана — используем Москву
    const tz = userRow?.timezone || tryTimezone() || 'Europe/Moscow';
    const toParts = (d) => {
      if (!d) return null;
      try {
        const fmt = new Intl.DateTimeFormat(tz || undefined, { timeZone: tz || undefined, year: 'numeric', month: 'numeric', day: 'numeric' });
        const parts = fmt.formatToParts(d);
        const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
        const m = Number(parts.find(p => p.type === 'month')?.value || NaN) - 1;
        const dd = Number(parts.find(p => p.type === 'day')?.value || NaN);
        if ([y, m, dd].some(n => !Number.isFinite(n))) return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
        return { y, m, d: dd };
      } catch { return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; }
    };

    const tp = toParts(now);
    const todayStart = new Date(tp.y, tp.m, tp.d).getTime();
    const todayIso = toIsoDate(new Date(todayStart));

    // Считываем последние до 60 дней активности
    let days = [];
    try {
      const { data } = await supabase
        .from('streak_days')
        .select('day')
        .eq('user_id', userRow.id)
        .lte('day', todayIso)
        .order('day', { ascending: false })
        .limit(60);
      days = Array.isArray(data) ? data.map(r => new Date(String(r.day))) : [];
    } catch {}

    const dayKey = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const hasDay = (d) => days.some(x => dayKey(x) === dayKey(d));

    const yesterday = new Date(todayStart - 86400000);
    const hasToday = hasDay(new Date(todayStart));

    // Вычисляем длину цепочки подряд идущих дней, заканчивающейся baseDay
    const computeChainLen = (baseDay) => {
      let len = 0;
      let cur = new Date(baseDay.getTime());
      while (hasDay(cur)) { len += 1; cur = new Date(cur.getTime() - 86400000); }
      return len;
    };

    if (hasToday) {
      // Уже есть запись на сегодня: просто актуализируем текущее значение стрика по streak_days
      const chain = computeChainLen(new Date(todayStart));
      res.status(200).json({ ok: true, user_id: userRow.id, streak: chain, last_active_at: new Date(todayStart).toISOString(), timezone: tz });
      return;
    }

    // Нет записи за сегодня — определим, можно ли инкрементить
    const latest = days[0] || null; // последний активный день (<= сегодня)
    const hasYesterday = days.some(d => dayKey(d) === dayKey(yesterday));
    let newStreak = 1;
    if (hasYesterday) {
      // есть отметка за вчера — считаем цепочку строго по истории
      const chainYesterday = computeChainLen(yesterday);
      newStreak = chainYesterday + 1;
    } else if (latest) {
      const gapDays = Math.round((todayStart - dayKey(latest)) / 86400000);
      if (gapDays <= 0) {
        // последний активный день — сегодня
        const chainToday = computeChainLen(new Date(todayStart));
        newStreak = chainToday; // обычно 0
      } else if (gapDays === 1) {
        // вчера отсутствует в выборке (например, отфильтровано) — начинаем новую цепочку
        newStreak = 1;
      } else {
        // пропущен хотя бы один полный день
        newStreak = 1;
      }
    } else {
      // истории нет — первая активность
      newStreak = 1;
    }

    let updated = { id: userRow.id, streak: userRow.streak ?? 0, last_active_at: userRow.last_active_at ?? null };
    // Всегда пишем сегодняшний день и users (мы точно в ветке hasToday === false)
    const { data, error: updErr } = await supabase
      .from('users')
      .update({ streak: newStreak, last_active_at: new Date(todayStart).toISOString() })
      .eq('id', userRow.id)
      .select('id, streak, last_active_at')
      .single();
    if (updErr) {
      try { console.error('[streak_finish] update users error:', updErr); } catch {}
      res.status(403).json({ ok: false, code: 'update_failed', error: updErr.message, hint: 'Check RLS and service role key' });
      return;
    }
    if (data) updated = data;
    // Обновим историческую таблицу и явно обработаем ошибку
    try {
      const { data: sd, error: sdErr } = await supabase
        .from('streak_days')
        .upsert({ user_id: userRow.id, day: todayIso, kind: 'active', timezone: tz }, { onConflict: 'user_id,day' })
        .select('user_id, day')
        .single();
      if (sdErr) {
        try { console.error('[streak_finish] upsert streak_days error:', sdErr); } catch {}
        res.status(403).json({ ok: false, code: 'streak_days_upsert_failed', error: sdErr.message });
        return;
      }
    } catch (e) {
      try { console.error('[streak_finish] upsert streak_days throw:', e); } catch {}
      res.status(500).json({ ok: false, code: 'streak_days_upsert_throw', error: String(e?.message || e) });
      return;
    }

    res.status(200).json({ ok: true, user_id: userRow.id, streak: Number(updated.streak || 0), last_active_at: updated.last_active_at || null, timezone: tz });
  } catch (e) {
    try { console.error('[api/streak_finish] error', e); } catch {}
    res.status(500).json({ ok: false, code: 'internal', error: 'Internal error' });
  }
}

function tryTimezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } }
function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function safeJson(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let body = '';
    req.on?.('data', (c) => { body += c; });
    req.on?.('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on?.('error', () => resolve({}));
  });
}


