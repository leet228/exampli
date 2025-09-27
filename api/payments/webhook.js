// ESM serverless function: YooKassa webhooks (demo)
// For demo we only log events; optionally, on succeeded capture, we can credit coins or mark subscription.
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const event = await safeJson(req);
    // Basic signature verification can be added here if configured
    try { console.log('[yookassa:webhook] event:', JSON.stringify(event)); } catch {}

    const object = event?.object || null;
    const status = object?.status || null;
    const metadata = object?.metadata || {};

    if (event?.event === 'payment.succeeded' || status === 'succeeded') {
      // Demo: update Supabase user based on metadata
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const userId = metadata?.user_id || null;
        const tgId = metadata?.tg_id || null;
        let userRow = null;
        if (userId) {
          const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
          userRow = data || null;
        } else if (tgId) {
          const { data } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).maybeSingle();
          userRow = data || null;
        }
        if (userRow?.id) {
          // If gems purchase: add coins. If plan: mark unlimited energy and expiry
          if (metadata?.type === 'gems') {
            const addCoins = Number(metadata?.coins || 0);
            if (Number.isFinite(addCoins) && addCoins > 0) {
              await supabase.rpc('rpc_add_coins', { p_user_id: userRow.id, p_delta: addCoins }).catch(async () => {
                await supabase.from('users').update({ coins: (Number(userRow.coins || 0) + addCoins) }).eq('id', userRow.id);
              });
            }
          } else if (metadata?.type === 'plan') {
            const months = Number(metadata?.months || 1);
            const now = new Date();
            const until = new Date(now.getTime());
            until.setMonth(until.getMonth() + (Number.isFinite(months) && months > 0 ? months : 1));
            // Save into users table minimal flags (you may have separate table user_subscriptions)
            await supabase.from('users').update({ plus_until: until.toISOString() }).eq('id', userRow.id);
          }
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    try { console.error('[api/payments/webhook] error', e); } catch {}
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


