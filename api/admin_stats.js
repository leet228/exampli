// ESM serverless: Admin stats for bot DM
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env' }); return; }
    const supabase = createClient(supabaseUrl, serviceKey);

    const tz = 'Europe/Moscow';
    const toIso = (d) => { const f = new Intl.DateTimeFormat('ru-RU',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}); const p=f.formatToParts(d); const y=p.find(x=>x.type==='year')?.value||'0000'; const m=p.find(x=>x.type==='month')?.value||'01'; const dd=p.find(x=>x.type==='day')?.value||'01'; return `${y}-${m}-${dd}`; };
    const today = new Date();
    const todayIso = toIso(today);
    const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    const weekIso = toIso(weekAgo);

    const { data: rows } = await supabase
      .from('bot_dm_daily')
      .select('day, count')
      .gte('day', weekIso)
      .lte('day', todayIso)
      .order('day', { ascending: true });

    const byDay = {};
    for (const r of rows || []) { const d=String(r.day); byDay[d]=(byDay[d]||0)+Number(r.count||0); }
    const totalToday = Number(byDay[todayIso] || 0);
    const last7 = Object.entries(byDay).map(([day,count])=>({day,count}));

    res.status(200).json({ ok: true, today: totalToday, days: last7 });
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}


