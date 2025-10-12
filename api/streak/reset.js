// ESM serverless function: Daily streak reset by Moscow time (03:30 MSK)
// Logic: if user's last streak_days.day < yesterday(MSK), set users.streak = 0

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'env_missing' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Moscow date boundaries
    const tz = 'Europe/Moscow';
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(now);
    const y = Number(parts.find(p => p.type === 'year')?.value || NaN);
    const m = Number(parts.find(p => p.type === 'month')?.value || NaN);
    const d = Number(parts.find(p => p.type === 'day')?.value || NaN);
    const toIso = (Y, M, D) => `${Y}-${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')}`;
    const todayIso = toIso(y, m, d);
    const yesterdayDate = new Date(Date.parse(`${todayIso}T00:00:00+03:00`) - 86400000);
    const yParts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(yesterdayDate);
    const yesterdayIso = toIso(Number(yParts.find(p=>p.type==='year')?.value), Number(yParts.find(p=>p.type==='month')?.value), Number(yParts.find(p=>p.type==='day')?.value));

    // 1) Gather last streak day per user up to yesterday
    const sinceIso = toIso(y, m, Math.max(1, d - 60)); // naive 60-day window
    let rows = null;
    // С пробой: если есть колонка kind, берём только active; иначе без фильтра
    try {
      const r1 = await supabase
        .from('streak_days')
        .select('user_id, day, kind')
        .eq('kind', 'active')
        .lte('day', yesterdayIso);
      if (!r1.error) rows = r1.data;
      else throw r1.error;
    } catch (_e) {
      const r2 = await supabase
        .from('streak_days')
        .select('user_id, day')
        .lte('day', yesterdayIso);
      rows = r2.data || [];
    }
    const lastByUser = new Map();
    for (const r of rows || []) {
      const uid = r.user_id;
      const day = String(r.day);
      const prev = lastByUser.get(uid);
      if (!prev || day > prev) lastByUser.set(uid, day);
    }

    // 2) Users with streak>0
    const { data: streakUsers } = await supabase.from('users').select('id, streak').gt('streak', 0);
    const idsToReset = [];
    for (const u of streakUsers || []) {
      const last = lastByUser.get(u.id) || null;
      // if last day older than yesterday (strictly < yesterday), reset
      if (!last || last < yesterdayIso) idsToReset.push(u.id);
    }

    // 3) Batch update
    const chunks = chunk(idsToReset, 500);
    let affected = 0;
    for (const batch of chunks) {
      if (!batch.length) continue;
      const { data, error } = await supabase.from('users').update({ streak: 0 }).in('id', batch).select('id');
      if (!error) affected += (data || []).length;
    }

    res.status(200).json({ ok: true, todayIso, yesterdayIso, reset_count: affected });
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}


