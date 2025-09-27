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
    const paymentId = object?.id || null;

    // Если требуется, дожмём capture для waiting_for_capture
    if ((event?.event === 'payment.waiting_for_capture' || status === 'waiting_for_capture') && paymentId) {
      try {
        const shopId = process.env.YOOKASSA_SHOP_ID;
        const secretKey = process.env.YOOKASSA_SECRET_KEY;
        if (shopId && secretKey) {
          const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
          const idk = (Math.random().toString(36).slice(2) + Date.now());
          await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}`, 'Idempotence-Key': idk },
            body: JSON.stringify({})
          });
        }
      } catch (e) { try { console.warn('[yookassa:webhook] capture failed', e); } catch {} }
    }

    if (event?.event === 'payment.succeeded' || status === 'succeeded') {
      // Demo: update Supabase user based on metadata
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
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
              const rpcRes = await supabase.rpc('rpc_add_coins', { p_user_id: userRow.id, p_delta: addCoins });
              if (rpcRes?.error) {
                await supabase.from('users').update({ coins: (Number(userRow.coins || 0) + addCoins) }).eq('id', userRow.id);
              }
            }
          } else if (metadata?.type === 'plan') {
            const months = Number(metadata?.months || 1);
            const pcode = String(metadata?.product_id || metadata?.plan_code || '').trim() || 'm1';
            // 1) Зафиксируем платёж в журнале (upsert на случай повтора вебхука)
            if (paymentId) {
              await supabase.from('payments').upsert({
                id: paymentId,
                user_id: userRow.id,
                type: 'plan',
                product_id: pcode,
                amount_rub: Number(object?.amount?.value || 0),
                currency: String(object?.amount?.currency || 'RUB'),
                status: 'succeeded',
                test: Boolean(object?.test || false),
                payment_method: object?.payment_method || null,
                metadata: metadata || null,
                captured_at: object?.captured_at || new Date().toISOString(),
              });
            }
            // 2) Продлим подписку атомарно
            const { data: ext, error: extErr } = await supabase.rpc('extend_subscription', {
              p_user_id: userRow.id,
              p_plan_code: pcode,
              p_months: Number.isFinite(months) && months > 0 ? months : 1,
              p_payment_id: paymentId || null,
            });
            // fallback на прямое обновление users.plus_until (не обязательно, но на всякий случай)
            if (extErr && months > 0) {
              const now = new Date();
              const until = new Date(now.getTime());
              until.setMonth(until.getMonth() + months);
              await supabase.from('users').update({ plus_until: until.toISOString() }).eq('id', userRow.id);
            }
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


