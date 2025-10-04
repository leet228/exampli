// ESM serverless function: update presence with 5m TTL
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'Missing Supabase env' }); return; }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await safeJson(req);
    const userId = body?.user_id || null;
    const route = String(body?.route || '').slice(0, 128) || null;
    const event = String(body?.event || '').slice(0, 64) || 'heartbeat';
    if (!userId) { res.status(400).json({ error: 'user_id_required' }); return; }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    // upsert presence row (create table app_presence(user_id uuid pk, last_active_at timestamptz, route text, event text, expires_at timestamptz))
    await supabase.from('app_presence').upsert({
      user_id: userId,
      last_active_at: now.toISOString(),
      route,
      event,
      expires_at: expiresAt,
    }, { onConflict: 'user_id' });

    // ВАЖНО: не трогаем users.last_active_at, чтобы HUD корректно показывал стрик
    // (last_active_at обновляется только при реальной активности урока в /api/streak_finish)

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'presence error' });
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


