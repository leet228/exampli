// Claim reward for a completed quest
// Body: { user_id: string, code: string }
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'env_missing' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const userId = body?.user_id || null;
    const code = String(body?.code || '');
    if (!userId || !code) { res.status(400).json({ error: 'user_id_and_code_required' }); return; }

    const dayIso = moscowIsoDay(new Date());

    // Check progress
    const { data: prog } = await supabase
      .from('user_daily_quest_progress')
      .select('status, claimed_at, target, progress')
      .eq('user_id', userId)
      .eq('day', dayIso)
      .eq('code', code)
      .maybeSingle();
    if (!prog) { res.status(400).json({ error: 'no_progress' }); return; }
    if (prog.status !== 'completed') { res.status(400).json({ error: 'not_completed' }); return; }
    if (prog.claimed_at) { res.status(400).json({ error: 'already_claimed' }); return; }

    // Load reward
    const { data: tmpl } = await supabase
      .from('daily_quest_templates')
      .select('reward_coins')
      .eq('code', code)
      .maybeSingle();
    const coins = Number(tmpl?.reward_coins || 0);

    // Update user and mark claimed
    const updates = [];
    if (coins) updates.push(`coins = coins + ${Math.max(0, coins)}`);
    if (updates.length) {
      // Supabase doesn't allow raw SQL easily via PostgREST; emulate with select+update safe path
      const { data: userRow } = await supabase.from('users').select('id, coins, energy').eq('id', userId).maybeSingle();
      if (!userRow) { res.status(404).json({ error: 'user_not_found' }); return; }
      const next = { coins: Number(userRow.coins || 0) + coins };
      await supabase.from('users').update(next).eq('id', userId);
    }

    const { data: wrote } = await supabase
      .from('user_daily_quest_progress')
      .update({ status: 'claimed', claimed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('day', dayIso)
      .eq('code', code)
      .select('code, status, claimed_at')
      .single();

    res.status(200).json({ ok: true, reward: { coins }, progress: wrote });
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


