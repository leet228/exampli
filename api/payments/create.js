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
    const type = body?.type === 'plan' ? 'plan' : (body?.type === 'gems' ? 'gems' : (body?.type === 'ai_tokens' ? 'ai_tokens' : null));
    const productId = String(body?.id || body?.product_id || '').trim();
    if (!type || !productId) {
      res.status(400).json({ error: 'invalid_request', details: { type, productId } });
      return;
    }

    // Для XTR (Telegram Stars) возвращаем переданное число как есть
    const toStars = (n) => Number(n);

    // Server-side price/metadata map
    const PRODUCTS = {
      plan: {
        m1:  { stars: toStars(449),  months: 1,  title: 'КУРСИК PLUS' },
        m6:  { stars: toStars(2299), months: 6,  title: 'КУРСИК PLUS' },
        m12: { stars: toStars(4999), months: 12, title: 'КУРСИК PLUS' },
      },
      gems: {
        g1: { stars: toStars(399),  coins: 1200, title: 'Монеты' },
        g2: { stars: toStars(899),  coins: 3000, title: 'Монеты' },
        g3: { stars: toStars(1799), coins: 6500, title: 'Монеты' },
      },
      ai_tokens: {
        ai_plus: { stars: toStars(449), rub: 449, title: 'КУРСИК AI +', months: 1 },
      }
    };

    const product = PRODUCTS[type]?.[productId];
    if (!product) {
      res.status(404).json({ error: 'product_not_found' });
      return;
    }

    

    const human = type === 'plan' 
      ? `${product.months} мес.` 
      : type === 'ai_tokens'
      ? `${product.months || 1} мес.`
      : `${product.coins} монет`;
    const description = type === 'plan'
      ? `${product.title} — ${human}`
      : type === 'ai_tokens'
      ? `AI+ токены: ${human}`
      : `${product.title}: ${human}`;

    // Payload will be echoed back in successful_payment.invoice_payload
    // Minified payload string (avoid oversize). Max 128 bytes recommended.
    const payloadData = {
      t: type,
      pid: productId,
      m: product.months || undefined,
      c: product.coins || undefined,
      u: body?.user_id || null,
      g: body?.tg_id || null,
      v: 1
    };
    const rawPayload = [`t=${payloadData.t}`, `pid=${payloadData.pid}`]
      .concat(payloadData.m ? [`m=${payloadData.m}`] : [])
      .concat(payloadData.c ? [`c=${payloadData.c}`] : [])
      .concat(payloadData.u ? [`u=${payloadData.u}`] : [])
      .concat(payloadData.g ? [`g=${payloadData.g}`] : [])
      .concat([`v=1`])
      .join(';');
    const payload = rawPayload.slice(0, 120);

    // Для XTR (Telegram Stars) используем количество звёзд напрямую
    const priceLabel = type === 'plan' 
      ? `${human}`.slice(0, 32)
      : type === 'ai_tokens'
      ? `AI+ токены: ${human}`.slice(0, 32)
      : `${human}`.slice(0, 32);
    const prices = [
      { label: priceLabel || 'Покупка', amount: Number(product.stars) }
    ];

    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/createInvoiceLink`;
    const tgRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: (type === 'plan' ? `Подписка: ${human}` : type === 'ai_tokens' ? `AI+ токены: ${human}` : `Монеты: ${human}`),
        description: `${description} • ${product.stars} ⭐`,
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

    res.status(200).json({ ok: true, invoice_link: json.result, stars: Number(product.stars) || null });
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