// ESM serverless function: Auto-renew subscriptions using saved payment_method

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST' && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!shopId || !secretKey || !supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'env_missing' }); return; }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const { default: pkg } = await import('@supabase/supabase-js');
    const { createClient } = pkg;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // N = дней до истечения, по умолчанию 3
    const body = req.method === 'POST' ? await safeJson(req) : null;
    const q = (req.query || {});
    const days = Number((req.method === 'GET' ? (q.days_before || q.days) : (body?.days_before)) || 3);

    // Найдём активные подписки, у которых скоро истекает срок и есть сохранённый метод
    const { data: subs } = await supabase.rpc('list_subscriptions_for_autorenew', { p_days_before: Math.max(1, days) }).catch(() => ({ data: null }));

    const results = [];
    if (Array.isArray(subs)) {
      for (const s of subs) {
        try {
          const methodId = s.method_id;
          if (!methodId) continue;
          const idempotenceKey = `${s.user_id}-${s.plan_code}-${Date.now()}`;
          const payload = {
            amount: { value: Number(s.price_rub).toFixed(2), currency: 'RUB' },
            capture: true,
            description: s.title || 'Подписка',
            payment_method_id: methodId,
            metadata: { type: 'plan', product_id: s.plan_code, months: s.months, user_id: s.user_id },
            // no confirmation to charge off-session
            receipt: {
              customer: s.customer_phone ? { phone: s.customer_phone } : (s.customer_email ? { email: s.customer_email } : undefined),
              items: [ { description: s.title || 'Подписка', quantity: 1, amount: { value: Number(s.price_rub).toFixed(2), currency: 'RUB' }, vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1), payment_mode: 'full_payment', payment_subject: 'service' } ]
            }
          };
          const r = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}`, 'Idempotence-Key': idempotenceKey },
            body: JSON.stringify(payload)
          });
          const text = await r.text();
          let js = null; try { js = text ? JSON.parse(text) : null; } catch {}
          results.push({ user_id: s.user_id, plan: s.plan_code, ok: r.ok, status: js?.status || null, id: js?.id || null, error: r.ok ? null : (js || text) });
        } catch (e) {
          results.push({ user_id: s?.user_id, plan: s?.plan_code, ok: false, error: String(e?.message || e) });
        }
      }
    }

    res.status(200).json({ ok: true, results });
  } catch (e) {
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


