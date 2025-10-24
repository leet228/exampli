// Handle user progress events for daily quests
// Body: { user_id: string, event: 'lesson_finished', perfect?: boolean }
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    // На проде требуем service role, локально позволяем anon для dev
    if (!supabaseKey) {
      const isProd = !!(process.env.VERCEL || process.env.VERCEL_ENV);
      if (isProd) { res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE on server' }); return; }
      supabaseKey = process.env.SUPABASE_ANON_KEY || '';
    }
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'env_missing' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const userId = body?.user_id || null;
    const ev = String(body?.event || '');
    const perfect = Boolean(body?.perfect);
    const minutes = Math.max(0, Number(body?.minutes || 0));
    const seconds = Math.max(0, Math.min(59, Number(body?.seconds || 0)));
    if (!userId || !ev) { res.status(400).json({ error: 'user_id_and_event_required' }); return; }

    const dayIso = moscowIsoDay(new Date());

    // 1) Update user_daily_metrics
    const metricsInc = { lessons_finished: 0, perfect_lessons: 0, minutes_studied: 0 };
    if (ev === 'lesson_finished') {
      metricsInc.lessons_finished += 1;
      if (perfect) metricsInc.perfect_lessons += 1;
      if (minutes > 0 || seconds > 0) metricsInc.minutes_studied += (minutes + (seconds / 60));
    }

    if (metricsInc.lessons_finished || metricsInc.perfect_lessons) {
      // Upsert metrics
      const { data: cur } = await supabase
        .from('user_daily_metrics')
        .select('lessons_finished, perfect_lessons, minutes_studied')
        .eq('user_id', userId)
        .eq('day', dayIso)
        .maybeSingle();
      const next = {
        user_id: userId,
        day: dayIso,
        lessons_finished: (Number(cur?.lessons_finished || 0) + metricsInc.lessons_finished),
        perfect_lessons: (Number(cur?.perfect_lessons || 0) + metricsInc.perfect_lessons),
        minutes_studied: (Number(cur?.minutes_studied || 0) + metricsInc.minutes_studied),
      };
      await supabase.from('user_daily_metrics').upsert(next, { onConflict: 'user_id,day' });
    }

    // 2) Sync progress against today's quests
    const { data: dayRow } = await supabase
      .from('daily_quests_day')
      .select('day, easy_code, medium_code, hard_code')
      .eq('day', dayIso)
      .maybeSingle();
    if (!dayRow) { res.status(200).json({ ok: true, day: dayIso, updated: [] }); return; }

    const codes = [dayRow.easy_code, dayRow.medium_code, dayRow.hard_code].filter(Boolean);
    const { data: templates } = await supabase
      .from('daily_quest_templates')
      .select('code, metric_key, target')
      .in('code', codes);

    const metricToInc = new Map();
    if (metricsInc.lessons_finished) metricToInc.set('lessons_finished', metricsInc.lessons_finished);
    if (metricsInc.perfect_lessons) metricToInc.set('perfect_lessons', metricsInc.perfect_lessons);
    if (metricsInc.minutes_studied) metricToInc.set('minutes_studied', metricsInc.minutes_studied);

    const updated = [];
    for (const t of (templates || [])) {
      const inc = Number(metricToInc.get(String(t.metric_key)) || 0);
      if (!inc) continue;

      const { data: existing } = await supabase
        .from('user_daily_quest_progress')
        .select('progress, target, status')
        .eq('user_id', userId)
        .eq('day', dayIso)
        .eq('code', t.code)
        .maybeSingle();
      let wroteRow = null;
      if (String(t.metric_key) === 'minutes_studied') {
        const prevSec = Math.max(0, Number(existing?.progress || 0));
        const incSec = Math.max(0, Math.round(inc * 60));
        const targetFromExisting = Number(existing?.target || 0);
        // Теперь трактуем шаблонный target как СЕКУНДЫ (без умножения на 60)
        const targetSec = targetFromExisting > 0 ? targetFromExisting : Math.max(1, Number(t.target || 60));
        const nextSec = Math.min(targetSec, prevSec + incSec);
        const completed = nextSec >= targetSec;
        const status = completed ? 'completed' : (existing?.status || 'in_progress');
        const up = {
          user_id: userId,
          day: dayIso,
          code: t.code,
          progress: nextSec, // seconds
          target: targetSec, // seconds
          status,
          ...(completed && !existing?.completed_at ? { completed_at: new Date().toISOString() } : {}),
        };
        const { data: wrote } = await supabase
          .from('user_daily_quest_progress')
          .upsert(up, { onConflict: 'user_id,day,code' })
          .select('code, progress, target, status, completed_at')
          .single();
        if (wrote) wroteRow = { ...wrote, metric_key: t.metric_key, seconds_partial: (nextSec % 60) };
      } else {
        const prevProg = Number(existing?.progress || 0);
        const target = Number(existing?.target || t.target || 1);
        const newProg = Math.min(target, prevProg + inc);
        const completed = newProg >= target;
        const status = completed ? 'completed' : (existing?.status || 'in_progress');
        const up = {
          user_id: userId,
          day: dayIso,
          code: t.code,
          progress: newProg,
          target: target,
          status,
          ...(completed && !existing?.completed_at ? { completed_at: new Date().toISOString() } : {}),
        };
        const { data: wrote } = await supabase
          .from('user_daily_quest_progress')
          .upsert(up, { onConflict: 'user_id,day,code' })
          .select('code, progress, target, status, completed_at')
          .single();
        if (wrote) wroteRow = { ...wrote, metric_key: t.metric_key };
      }
      if (wroteRow) updated.push(wroteRow);
    }

    res.status(200).json({ ok: true, day: dayIso, updated });
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: String(e?.message || e) });
  }
}

function moscowIsoDay(d) {
  const tz = 'Europe/Moscow';
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === 'year')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'month')?.value || 0);
  const day = Number(parts.find((p) => p.type === 'day')?.value || 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function safeJson(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  try { const buf = await read(req); return JSON.parse(buf || '{}'); } catch { return {}; }
}
function read(req) { return new Promise((r) => { let b=''; req.on('data', (c)=>b+=c); req.on('end', ()=>r(b)); }); }


