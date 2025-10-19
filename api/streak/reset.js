// ESM serverless function: Daily streak reset by Moscow time (03:30 MSK)
// New logic with freezes:
// - If a user missed "yesterday" (no streak_days record for that date), we try to freeze the day instead of resetting the streak.
// - Non-subscribers: freeze only if users.frosts > 0 (consume 1 frost); otherwise reset streak to 0.
// - Subscribers (users.plus_until > now): always have 2 consecutive free freeze days. If the immediate previous consecutive freeze count (< 2), freeze for free.
//   After 2 consecutive freezes, if users.frosts > 0 — consume 1 frost and freeze; if none — reset streak to 0.
// - If there is already a record for yesterday (active or freeze) — do nothing.

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
    const dMinus1Date = new Date(Date.parse(`${yesterdayIso}T00:00:00+03:00`) - 86400000);
    const dMinus1Parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dMinus1Date);
    const dMinus1Iso = toIso(Number(dMinus1Parts.find(p=>p.type==='year')?.value), Number(dMinus1Parts.find(p=>p.type==='month')?.value), Number(dMinus1Parts.find(p=>p.type==='day')?.value));
    const dMinus2Date = new Date(Date.parse(`${dMinus1Iso}T00:00:00+03:00`) - 86400000);
    const dMinus2Parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dMinus2Date);
    const dMinus2Iso = toIso(Number(dMinus2Parts.find(p=>p.type==='year')?.value), Number(dMinus2Parts.find(p=>p.type==='month')?.value), Number(dMinus2Parts.find(p=>p.type==='day')?.value));

    // 1) Load all users with positive streak (we only consider active streaks)
    const { data: streakUsers } = await supabase
      .from('users')
      .select('id, streak, plus_until, frosts')
      .gt('streak', 0);

    const userRows = Array.isArray(streakUsers) ? streakUsers : [];
    if (userRows.length === 0) {
      res.status(200).json({ ok: true, todayIso, yesterdayIso, reset_count: 0, freeze_count: 0, frost_spent: 0 });
      return;
    }

    // 2) Fetch recent streak_days for last 3 days globally (yesterday and two days before)
    const dayPool = [yesterdayIso, dMinus1Iso, dMinus2Iso];
    const { data: recentDays } = await supabase
      .from('streak_days')
      .select('user_id, day, kind')
      .in('day', dayPool);

    const byUserDay = new Map(); // Map<userId, Map<dayIso, kind>>
    if (Array.isArray(recentDays)) {
      for (const r of recentDays) {
        const uid = r.user_id;
        if (!byUserDay.has(uid)) byUserDay.set(uid, new Map());
        byUserDay.get(uid).set(String(r.day), String(r.kind || 'active'));
      }
    }

    // 3) Decide actions
    const idsToReset = [];
    const toFreezeFree = []; // freeze without consuming frosts
    const toFreezeSpend = []; // freeze and spend 1 frost
    const frostUpdates = []; // { id, frosts }

    const nowMs = Date.now();

    for (const u of userRows) {
      const uid = u.id;
      const map = byUserDay.get(uid) || new Map();
      const hasYesterday = map.has(yesterdayIso);
      if (hasYesterday) continue; // already active or frozen yesterday → nothing to do

      const plusUntil = u.plus_until ? Date.parse(String(u.plus_until)) : null;
      const isPlus = plusUntil != null && Number.isFinite(plusUntil) && plusUntil > nowMs;

      // count consecutive FREEZE days immediately before yesterday
      let freezeRun = 0;
      const k1 = map.get(dMinus1Iso);
      if (k1 === 'freeze') freezeRun += 1;
      const k2 = map.get(dMinus2Iso);
      if (k1 === 'freeze' && k2 === 'freeze') freezeRun += 1; // only count if consecutive

      if (isPlus) {
        if (freezeRun < 2) {
          toFreezeFree.push(uid);
        } else {
          const haveFrosts = Number(u.frosts || 0) > 0;
          if (haveFrosts) {
            toFreezeSpend.push(uid);
            frostUpdates.push({ id: uid, frosts: Math.max(0, Number(u.frosts || 0) - 1) });
          } else {
            idsToReset.push(uid);
          }
        }
      } else {
        const haveFrosts = Number(u.frosts || 0) > 0;
        if (haveFrosts) {
          toFreezeSpend.push(uid);
          frostUpdates.push({ id: uid, frosts: Math.max(0, Number(u.frosts || 0) - 1) });
        } else {
          idsToReset.push(uid);
        }
      }
    }

    // 4) Apply freezes (yesterday) in batches
    const freezeRows = [];
    for (const id of [...toFreezeFree, ...toFreezeSpend]) freezeRows.push({ user_id: id, day: yesterdayIso, kind: 'freeze' });
    let freezeCount = 0;
    if (freezeRows.length) {
      const fChunks = chunk(freezeRows, 500);
      for (const batch of fChunks) {
        const { data, error } = await supabase.from('streak_days').upsert(batch, { onConflict: 'user_id,day' }).select('user_id');
        if (!error) freezeCount += (data || []).length;
      }
    }

    // 5) Spend frosts (batched upsert of users with new frosts)
    let frostSpent = 0;
    if (frostUpdates.length) {
      const uChunks = chunk(frostUpdates, 500);
      for (const batch of uChunks) {
        const { data, error } = await supabase.from('users').upsert(batch, { onConflict: 'id' }).select('id');
        if (!error) frostSpent += (data || []).length;
      }
    }

    // 6) Reset streak for remaining users
    let resetAffected = 0;
    if (idsToReset.length) {
      const rChunks = chunk(idsToReset, 500);
      for (const batch of rChunks) {
        if (!batch.length) continue;
        const { data, error } = await supabase.from('users').update({ streak: 0 }).in('id', batch).select('id');
        if (!error) resetAffected += (data || []).length;
      }
    }

    res.status(200).json({ ok: true, todayIso, yesterdayIso, reset_count: resetAffected, freeze_count: freezeCount, frost_spent: frostSpent });
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}


