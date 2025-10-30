// ESM serverless function: finalize daily streak on lesson finish
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseKey) {
      const isProd = !!(process.env.VERCEL || process.env.VERCEL_ENV);
      if (isProd) { res.status(500).json({ ok: false, code: 'env_missing', error: 'Missing SUPABASE_SERVICE_ROLE on server' }); return; }
      supabaseKey = process.env.SUPABASE_ANON_KEY || '';
    }
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
    // Вычисляем «сегодня» строго в таймзоне пользователя; если не задана — используем МСК (+03:00)
    const tz = userRow?.timezone || 'Europe/Moscow';
    const offsetMs = (tz === 'Europe/Moscow') ? 3 * 60 * 60 * 1000 : 0; // фоллбек — UTC
    const localNow = new Date(now.getTime() + offsetMs);
    const todayIso = localNow.toISOString().slice(0, 10); // YYYY-MM-DD в выбранной TZ
    const todayStart = Date.parse(`${todayIso}T00:00:00.000Z`) - offsetMs; // UTC-начало локального дня

    // Считываем последние до 60 дней streak_days с kind, разделяем на active/freeze
    let daysRaw = [];
    try {
      const { data } = await supabase
        .from('streak_days')
        .select('day, kind')
        .eq('user_id', userRow.id)
        .lte('day', todayIso)
        .order('day', { ascending: false })
        .limit(90);
      daysRaw = Array.isArray(data) ? data : [];
    } catch {}

    const activeDays = new Set(daysRaw.filter(r => String(r.kind || 'active') === 'active').map(r => String(r.day)));
    const freezeDays = new Set(daysRaw.filter(r => String(r.kind || '') === 'freeze').map(r => String(r.day)));
    const yesterdayIso = new Date(Date.parse(todayIso + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    const hasToday = activeDays.has(todayIso);

    // Вычисляем длину цепочки подряд идущих дней, заканчивающейся baseDay
    const computeChainLen = (baseIso) => {
      let len = 0;
      let cur = baseIso;
      while (activeDays.has(cur)) {
        len += 1;
        cur = new Date(Date.parse(cur + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
      }
      return len;
    };

    if (hasToday) {
      // Уже есть запись на сегодня: актуализируем стрик и при необходимости max_streak/perfect_lessons
      const chain = computeChainLen(todayIso);
      // Прочитаем текущие значения max_streak и perfect_lessons
      let prevMax = 0, prevPerfect = 0;
      try {
        const { data: prev } = await supabase
          .from('users')
          .select('id, max_streak, perfect_lessons')
          .eq('id', userRow.id)
          .maybeSingle();
        prevMax = Number(prev && prev.max_streak != null ? prev.max_streak : 0);
        prevPerfect = Number(prev && prev.perfect_lessons != null ? prev.perfect_lessons : 0);
      } catch {}
      const perfectInc = (() => { try { const v = body?.perfect || body?.perfect_inc || 0; return Number(v) ? 1 : 0; } catch { return 0; } })();
      // max_streak обновляем только если новый стрик побил рекорд
      const nextMax = chain > prevMax ? chain : prevMax;
      const nextPerfect = prevPerfect + (perfectInc ? 1 : 0);
      try {
        const upd = await supabase
          .from('users')
          .update({ max_streak: nextMax, ...(perfectInc ? { perfect_lessons: nextPerfect } : {}) })
          .eq('id', userRow.id)
          .select('id, streak, last_active_at, max_streak, perfect_lessons')
          .single();
        const row = upd && upd.data ? upd.data : { streak: chain, last_active_at: userRow.last_active_at, max_streak: nextMax, perfect_lessons: nextPerfect };
        res.status(200).json({ ok: true, user_id: userRow.id, streak: Number(row.streak || chain), last_active_at: row.last_active_at || null, max_streak: Number(row.max_streak || nextMax), perfect_lessons: Number(row.perfect_lessons != null ? row.perfect_lessons : nextPerfect), timezone: tz, debug: { todayIso, hasToday: true } });
      } catch (e) {
        res.status(200).json({ ok: true, user_id: userRow.id, streak: chain, last_active_at: new Date(todayStart).toISOString(), max_streak: nextMax, perfect_lessons: nextPerfect, timezone: tz, debug: { todayIso, hasToday: true } });
      }
      return;
    }

    // Нет записи за сегодня — определим, можно ли инкрементить
    // Найдём последний активный день (<= сегодня)
    const latestActiveIso = (() => {
      for (const r of daysRaw) { const di = String(r.day); if (String(r.kind || 'active') === 'active') return di; }
      return null;
    })();
    const hasYesterdayActive = activeDays.has(yesterdayIso);
    const hasYesterdayFreeze = freezeDays.has(yesterdayIso);
    // Backward-compatible aliases for debug payload
    const hasYesterday = hasYesterdayActive;
    const latestIso = latestActiveIso;
    let newStreak = 1;
    if (hasYesterdayActive) {
      // Вчера был активный день — обычная логика
      const chainYesterday = computeChainLen(yesterdayIso);
      newStreak = chainYesterday + 1;
    } else if (latestActiveIso) {
      // Есть последний активный день: проверим, полностью ли промежуток между ним и сегодня закрыт freeze-днями
      // Если да — стрик продолжается (+1 к последнему активному); если нет — сбрасывается
      const coveredByFreeze = (() => {
        let cur = new Date(Date.parse(latestActiveIso + 'T00:00:00Z') + 86400000).toISOString().slice(0,10);
        // Проверяем все дни от следующего после последнего активного до вчера включительно
        // (сегодня еще не записан в activeDays, поэтому проверяем до yesterdayIso включительно)
        while (cur <= yesterdayIso) {
          // Если день не freeze и не active — это разрыв
          if (!freezeDays.has(cur) && !activeDays.has(cur)) return false;
          cur = new Date(Date.parse(cur + 'T00:00:00Z') + 86400000).toISOString().slice(0,10);
        }
        return true;
      })();
      if (coveredByFreeze) {
        // Промежуток полностью покрыт freeze-днями (или их нет вообще) — стрик продолжается
        const chainLastActive = computeChainLen(latestActiveIso);
        newStreak = chainLastActive + 1;
      } else {
        // Есть разрыв — сброс стрика
        newStreak = 1;
      }
    } else {
      // Истории нет — первая активность
      newStreak = 1;
    }

    let updated = { id: userRow.id, streak: userRow.streak ?? 0, last_active_at: userRow.last_active_at ?? null, max_streak: userRow.max_streak ?? null, perfect_lessons: userRow.perfect_lessons ?? null };
    // Прочитаем текущие значения max_streak и perfect_lessons
    let prevMax = 0, prevPerfect = 0;
    try {
      const { data: prev } = await supabase
        .from('users')
        .select('id, max_streak, perfect_lessons')
        .eq('id', userRow.id)
        .maybeSingle();
      prevMax = Number(prev && prev.max_streak != null ? prev.max_streak : 0);
      prevPerfect = Number(prev && prev.perfect_lessons != null ? prev.perfect_lessons : 0);
    } catch {}
    // Флаг идеального урока (инкремент perfect_lessons)
    const perfectInc = (() => {
      try { const v = body?.perfect || body?.perfect_inc || 0; return Number(v) ? 1 : 0; } catch { return 0; }
    })();
    // max_streak обновляем только если новый стрик побил рекорд
    const nextMax = newStreak > prevMax ? newStreak : prevMax;
    const nextPerfect = prevPerfect + (perfectInc ? 1 : 0);
    // Всегда пишем сегодняшний день и users (мы точно в ветке hasToday === false)
    const { data, error: updErr } = await supabase
      .from('users')
      .update({ streak: newStreak, last_active_at: new Date(todayStart).toISOString(), max_streak: nextMax, ...(perfectInc ? { perfect_lessons: nextPerfect } : {}) })
      .eq('id', userRow.id)
      .select('id, streak, last_active_at, max_streak, perfect_lessons')
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

    res.status(200).json({ ok: true, user_id: userRow.id, streak: Number(updated.streak || 0), last_active_at: updated.last_active_at || null, max_streak: Number(updated && updated.max_streak != null ? updated.max_streak : nextMax), perfect_lessons: Number(updated && updated.perfect_lessons != null ? updated.perfect_lessons : (perfectInc ? nextPerfect : prevPerfect)), timezone: tz, debug: { todayIso, hasToday: false, hasYesterday, latestIso, computed: newStreak } });
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


