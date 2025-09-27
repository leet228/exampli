// ESM serverless function: Create YooKassa payment (demo)
import { randomUUID } from 'node:crypto';

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

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      res.status(500).json({ error: 'Missing YooKassa env', details: { hasShopId: !!shopId, hasSecretKey: !!secretKey } });
      return;
    }

    const body = await safeJson(req);
    const type = body?.type === 'plan' ? 'plan' : (body?.type === 'gems' ? 'gems' : null);
    const productId = String(body?.id || body?.product_id || '').trim();
    if (!type || !productId) {
      res.status(400).json({ error: 'invalid_request', details: { type, productId } });
      return;
    }

    // Server-side price/metadata map (protects from client tampering)
    const PRODUCTS = {
      plan: {
        m1:  { rub: 499,  months: 1,  title: 'КУРСИК PLUS' },
        m6:  { rub: 2699, months: 6,  title: 'КУРСИК PLUS' },
        m12: { rub: 4999, months: 12, title: 'КУРСИК PLUS' },
      },
      gems: {
        g1: { rub: 499,  coins: 1200, title: 'Монеты' },
        g2: { rub: 999,  coins: 3000, title: 'Монеты' },
        g3: { rub: 1999, coins: 6500, title: 'Монеты' },
      }
    };

    const product = PRODUCTS[type]?.[productId];
    if (!product) {
      res.status(404).json({ error: 'product_not_found' });
      return;
    }

    const proto = (req.headers['x-forwarded-proto'] || 'https');
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '');
    const origin = `${proto}://${host}`;
    const returnUrl = (typeof body?.return_url === 'string' && body.return_url) || `${origin}/subscription?paid=1`;

    const description = type === 'plan'
      ? `${product.title} — ${product.months} мес.`
      : `${product.title}: ${product.coins}`

    const idempotenceKey = randomUUID();
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const metadata = {
      type,
      product_id: productId,
      months: product.months || undefined,
      coins: product.coins || undefined,
      user_id: body?.user_id || null,
      tg_id: body?.tg_id || null,
    };

    const payload = {
      amount: { value: Number(product.rub).toFixed(2), currency: 'RUB' },
      capture: true,
      description,
      confirmation: { type: 'redirect', return_url: returnUrl },
      metadata,
    };

    const ykRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await ykRes.text();
    let js = null;
    try { js = text ? JSON.parse(text) : null; } catch {}
    if (!ykRes.ok) {
      res.status(ykRes.status).json({ error: 'yookassa_error', detail: js || text || null });
      return;
    }

    const confirmationUrl = js?.confirmation?.confirmation_url || js?.confirmation?.url || null;
    res.status(200).json({ ok: true, payment_id: js?.id || null, confirmation_url: confirmationUrl });
  } catch (e) {
    try { console.error('[api/payments/create] error', e); } catch {}
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


