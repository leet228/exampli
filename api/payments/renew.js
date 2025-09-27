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

    // Тестовые минуты: если включены, берём истекающие в ближайшие SUBS_TEST_MINUTES
    const testMinutes = Number(process.env.SUBS_TEST_MINUTES || 0);
    let subs = null;
    if (testMinutes > 0) {
      const untilIso = new Date(Date.now() + testMinutes * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('user_subscriptions')
        .select('user_id, plan_code, expires_at')
        .eq('status', 'active')
        .eq('auto_renew', true)
        .lte('expires_at', untilIso);
      subs = data || [];
      // enrich
      for (const s of subs) {
        const [{ data: sp }, { data: pm }, { data: u }] = await Promise.all([
          supabase.from('subscription_plans').select('code, months, price_rub, title').eq('code', s.plan_code).maybeSingle(),
          supabase.from('user_payment_methods').select('method_id').eq('user_id', s.user_id).eq('is_default', true).maybeSingle(),
          supabase.from('users').select('phone_number, email').eq('id', s.user_id).maybeSingle(),
        ]);
        s.months = sp?.months || 1;
        s.price_rub = sp?.price_rub || 0;
        s.title = sp?.title || 'Подписка';
        s.method_id = pm?.method_id || null;
        s.customer_phone = u?.phone_number ? String(u.phone_number).replace(/\D+/g, '') : null;
        s.customer_email = u?.email || null;
      }
    } else {
      const resp = await supabase.rpc('list_subscriptions_for_autorenew', { p_days_before: Math.max(1, days) }).catch(() => ({ data: null }));
      subs = resp.data || [];
    }

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
                await supabase
                  .from('user_subscriptions')
                  .update({ status: 'expired', updated_at: new Date().toISOString() })
                  .eq('user_id', s.user_id)
                  .eq('plan_code', s.plan_code)
                  .eq('status', 'active');
                await supabase.from('users').update({ plus_until: null }).eq('id', s.user_id);
              } catch {}
            }
          }
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


