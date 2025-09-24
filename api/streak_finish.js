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
    const tz = userRow?.timezone || tryTimezone();
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
    const last = userRow?.last_active_at ? new Date(userRow.last_active_at) : null;
    const lp = toParts(last);
    const lastStart = lp ? new Date(lp.y, lp.m, lp.d).getTime() : null;

    let newStreak = Number(userRow?.streak || 0);
    let shouldInc = false;
    let freezeDayIso = null; // YYYY-MM-DD локального «вчера» если была заморозка

    if (lastStart == null) {
      newStreak = 1; shouldInc = true;
    } else {
      const diffDays = Math.round((todayStart - lastStart) / 86400000);
      if (diffDays <= 0) {
        // Если предыдущие попытки по ошибке обновили last_active_at сегодня, но streak == 0 — считаем это первым успехом
        if (newStreak <= 0) { newStreak = 1; shouldInc = true; }
        else { shouldInc = false; }
      }
      else if (diffDays === 1) { newStreak = newStreak + 1; shouldInc = true; }
      else if (diffDays === 2) { newStreak = newStreak + 1; shouldInc = true; freezeDayIso = toIsoDate(new Date(todayStart - 86400000)); }
      else { newStreak = 1; shouldInc = true; }
    }

    let updated = { id: userRow.id, streak: userRow.streak ?? 0, last_active_at: userRow.last_active_at ?? null };
    if (shouldInc) {
      const { data, error: updErr } = await supabase
        .from('users')
        .update({ streak: newStreak, last_active_at: now.toISOString() })
        .eq('id', userRow.id)
        .select('id, streak, last_active_at')
        .single();
      if (updErr) {
        try { console.error('[streak_finish] update users error:', updErr); } catch {}
        res.status(403).json({ ok: false, code: 'update_failed', error: updErr.message, hint: 'Check RLS and service role key' });
        return;
      }
      if (data) updated = data;
      // Обновим историческую таблицу (если есть)
      try {
        const todayIso = toIsoDate(new Date(todayStart));
        const a1 = await supabase.from('streak_days').upsert({ user_id: userRow.id, day: todayIso, kind: 'active' }, { onConflict: 'user_id,day' });
        if (a1.error) { try { console.warn('[streak_finish] streak_days(active) error:', a1.error); } catch {} }
        if (freezeDayIso) {
          const a2 = await supabase.from('streak_days').upsert({ user_id: userRow.id, day: freezeDayIso, kind: 'freeze' }, { onConflict: 'user_id,day' });
          if (a2.error) { try { console.warn('[streak_finish] streak_days(freeze) error:', a2.error); } catch {} }
        }
      } catch {}
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


