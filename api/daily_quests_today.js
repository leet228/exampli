// Returns today's three quests with user progress snapshot
// Body: { user_id: string }
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    let supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseKey) {
      const isProd = !!(process.env.VERCEL || process.env.VERCEL_ENV);
      if (isProd) { res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE on server' }); return; }
      supabaseKey = process.env.SUPABASE_ANON_KEY || '';
    }
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'env_missing' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const userId = body?.user_id || null;

    const dayIso = moscowIsoDay(new Date());

    // Ensure we have a row for today (in case cron lagged in dev) — roll once
    const { data: dayRowExisting } = await supabase
      .from('daily_quests_day')
      .select('day, easy_code, medium_code, hard_code')
      .eq('day', dayIso)
      .maybeSingle();
    let dayRow = dayRowExisting;
    if (!dayRow) {
      const rolled = await fetchSelf('/api/daily_quests_roll');
      if (rolled?.picked) dayRow = rolled.picked;
    }

    if (!dayRow) { res.status(200).json({ day: dayIso, quests: [], progress: [] }); return; }

    // Load templates meta
    const codes = [dayRow.easy_code, dayRow.medium_code, dayRow.hard_code].filter(Boolean);
    const { data: templates } = await supabase
      .from('daily_quest_templates')
      .select('code, difficulty, title, metric_key, target, reward_coins')
      .in('code', codes);

    // Progress snapshot for user (local MSK day surrogate)
    let progress = [];
    if (userId) {
      const { data: prog } = await supabase
        .from('user_daily_quest_progress')
        .select('code, progress, target, status, completed_at, claimed_at')
        .eq('user_id', userId)
        .eq('day', dayIso);
      progress = Array.isArray(prog) ? prog : [];
    }

    res.status(200).json({ day: dayIso, quests: templates || [], progress });
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

function originBase() {
  try { const h = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_URL || ''; if (h) return `https://${h}`; } catch {}
  return 'http://localhost:3000';
}
async function fetchSelf(path) {
  try {
    const r = await fetch(originBase() + path, { method: 'GET' });
    if (!r.ok) return null; return await r.json();
  } catch { return null; }
}


