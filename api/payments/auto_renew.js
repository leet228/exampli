// ESM serverless function: Get/Set auto-renew preference on active subscription

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'env_missing' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const q = req.query || {};
    const body = req.method === 'POST' ? await safeJson(req) : {};
    const userId = body?.user_id || q.user_id || null;
    const tgId = body?.tg_id || q.tg_id || null;
    if (!userId && !tgId) { res.status(400).json({ error: 'user_required' }); return; }

    // Resolve user id
    let uid = userId || null;
    if (!uid && tgId) {
      const { data } = await supabase.from('users').select('id').eq('tg_id', String(tgId)).maybeSingle();
      uid = data?.id || null;
    }
    if (!uid) { res.status(404).json({ error: 'user_not_found' }); return; }

    // Load active subscription (latest)
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('id, status, expires_at, auto_renew, plan_code')
      .eq('user_id', uid)
      .eq('status', 'active')
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (req.method === 'GET') {
      const enabled = sub ? (sub.auto_renew !== false) : false;
      res.status(200).json({ ok: true, enabled, expires_at: sub?.expires_at || null, plan_code: sub?.plan_code || null });
      return;
    }

    // POST: update toggle
    const enabled = Boolean(body?.enabled);
    if (!sub?.id) { res.status(404).json({ error: 'subscription_not_found' }); return; }
    await supabase
      .from('user_subscriptions')
      .update({ auto_renew: enabled, updated_at: new Date().toISOString() })
      .eq('id', sub.id);
    res.status(200).json({ ok: true, enabled });
  } catch (e) {
    try { console.error('[api/payments/auto_renew] error', e); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
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


