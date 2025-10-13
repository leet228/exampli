// ESM serverless function: reset energy_spent_times[], set energy=25, deduct 500 coins
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.status(500).json({ error: 'Missing Supabase env' });
      return;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const tgId = body?.tg_id ? String(body.tg_id) : null;
    const userId = body?.user_id ? String(body.user_id) : null;
    if (!tgId && !userId) {
      res.status(400).json({ error: 'user id required' });
      return;
    }

    // Fetch user row for optimistic checks
    const { data: userRow } = userId
      ? await supabase.from('users').select('id, coins').eq('id', userId).maybeSingle()
      : await supabase.from('users').select('id, coins').eq('tg_id', tgId).maybeSingle();
    if (!userRow?.id) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    const currentCoins = Number(userRow.coins ?? 0);
    if (currentCoins < 500) {
      res.status(400).json({ error: 'not_enough_coins' });
      return;
    }

    // Perform update: reset queue, set energy=25, coins-=500
    const update = { energy: 25, coins: currentCoins - 500, energy_spent_times: [] };
    const { data: updated, error: upErr } = await supabase
      .from('users')
      .update(update)
      .eq('id', userRow.id)
      .select('id, energy, coins')
      .single();
    if (upErr) {
      res.status(500).json({ error: 'update_failed' });
      return;
    }

    res.status(200).json({ ok: true, user_id: updated.id, energy: updated.energy, coins: updated.coins });
  } catch (e) {
    try { console.error('[api/energy_topup] error', e); } catch {}
    res.status(500).json({ error: 'Internal error' });
  }
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


