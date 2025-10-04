// ESM serverless function: Create Telegram Stars invoice link

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

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'missing_env', detail: 'TELEGRAM_BOT_TOKEN' });
      return;
    }

    const body = await safeJson(req);
    const type = body?.type === 'plan' ? 'plan' : (body?.type === 'gems' ? 'gems' : null);
    const productId = String(body?.id || body?.product_id || '').trim();
    if (!type || !productId) {
      res.status(400).json({ error: 'invalid_request', details: { type, productId } });
      return;
    }

    // Conversion: RUB -> Stars (XTR). Configure RUB_PER_STAR env if needed (default 1).
    const RUB_PER_STAR = Number(process.env.RUB_PER_STAR || '1');
    const toStars = (rub) => {
      const r = Number(rub);
      if (!Number.isFinite(r) || r <= 0) return 0;
      const k = Number.isFinite(RUB_PER_STAR) && RUB_PER_STAR > 0 ? RUB_PER_STAR : 1;
      return Math.max(1, Math.ceil(r / k));
    };

    // Server-side price/metadata map
    const PRODUCTS = {
      plan: {
        m1:  { stars: toStars(499),  months: 1,  title: 'КУРСИК PLUS' },
        m6:  { stars: toStars(2699), months: 6,  title: 'КУРСИК PLUS' },
        m12: { stars: toStars(4999), months: 12, title: 'КУРСИК PLUS' },
      },
      gems: {
        g1: { stars: toStars(499),  coins: 1200, title: 'Монеты' },
        g2: { stars: toStars(999),  coins: 3000, title: 'Монеты' },
        g3: { stars: toStars(1999), coins: 6500, title: 'Монеты' },
      }
    };

    const product = PRODUCTS[type]?.[productId];
    if (!product) {
      res.status(404).json({ error: 'product_not_found' });
      return;
    }

    const description = type === 'plan'
      ? `${product.title} — ${product.months} мес.`
      : `${product.title}: ${product.coins}`;

    // Payload will be echoed back in successful_payment.invoice_payload
    const payloadData = {
      type,
      product_id: productId,
      months: product.months || undefined,
      coins: product.coins || undefined,
      user_id: body?.user_id || null,
      tg_id: body?.tg_id || null,
      v: 1
    };
    const payload = JSON.stringify(payloadData);

    const prices = [
      { label: description.slice(0, 32) || 'Покупка', amount: Number(product.stars) }
    ];

    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/createInvoiceLink`;
    const tgRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: (type === 'plan' ? 'Подписка КУРСИК PLUS' : 'Покупка монет'),
        description,
        payload,
        currency: 'XTR',
        prices,
      })
    });
    const text = await tgRes.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (!tgRes.ok || !json?.ok || typeof json?.result !== 'string') {
      res.status(tgRes.status || 500).json({ error: 'telegram_error', detail: json || text || null });
      return;
    }

    res.status(200).json({ ok: true, invoice_link: json.result, stars: Number(product.stars) || null, payload: payloadData });
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