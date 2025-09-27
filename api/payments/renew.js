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

    // Продакшн: берём по дням до истечения
    const resp = await supabase.rpc('list_subscriptions_for_autorenew', { p_days_before: Math.max(1, days) }).catch(() => ({ data: null }));
    const subs = resp.data || [];

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
          const ok = r.ok && (js?.status === 'succeeded' || js?.paid === true || js?.status === 'pending');
          results.push({ user_id: s.user_id, plan: s.plan_code, ok, status: js?.status || null, id: js?.id || null, error: ok ? null : (js || text) });
          // Если платёж не прошёл, и подписка уже истекла — пометим её как expired и уберём plus_until
          if (!ok) {
            const expired = s?.expires_at ? (new Date(s.expires_at).getTime() <= Date.now()) : false;
            if (expired) {
              try {
                // Удаляем истёкшие активные подписки пользователя
                await supabase
                  .from('user_subscriptions')
                  .delete()
                  .eq('user_id', s.user_id)
                  .eq('status', 'active')
                  .lte('expires_at', new Date().toISOString());
                // Удаляем сохранённые методы оплаты пользователя
                await supabase
                  .from('user_payment_methods')
                  .delete()
                  .eq('user_id', s.user_id);
                await supabase.from('users').update({ plus_until: null }).eq('id', s.user_id);
              } catch {}
            }
          }
        } catch (e) {
          results.push({ user_id: s?.user_id, plan: s?.plan_code, ok: false, error: String(e?.message || e) });
        }
      }
    }

    // Глобальная очистка: удаляем все истёкшие активные подписки, даже если не пытались списать
    try {
      const nowIso = new Date().toISOString();
      const { data: expiredList } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('status', 'active')
        .lte('expires_at', nowIso);
      const usersToPurge = Array.from(new Set((expiredList || []).map((r) => r.user_id).filter(Boolean)));
      for (const uid of usersToPurge) {
        try {
          await supabase.from('user_subscriptions')
            .delete()
            .eq('user_id', uid)
            .eq('status', 'active')
            .lte('expires_at', nowIso);
          await supabase.from('user_payment_methods').delete().eq('user_id', uid);
          await supabase.from('users').update({ plus_until: null }).eq('id', uid);
          results.push({ user_id: uid, purged: true });
        } catch (e) {
          results.push({ user_id: uid, purged: false, error: String(e?.message || e) });
        }
      }
    } catch {}

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


