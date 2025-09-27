// ESM serverless function: Get YooKassa payment status by id

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) { res.status(500).json({ error: 'Missing YooKassa env' }); return; }

    const paymentId = (req.query?.payment_id || req.query?.id || '').toString().trim();
    if (!paymentId) { res.status(400).json({ error: 'payment_id_required' }); return; }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const ykRes = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`,
      }
    });

    const text = await ykRes.text();
    let js = null;
    try { js = text ? JSON.parse(text) : null; } catch {}
    if (!ykRes.ok) { res.status(ykRes.status).json({ error: 'yookassa_error', detail: js || text || null }); return; }

    const status = js?.status || null;
    const paid = Boolean(js?.paid || status === 'succeeded');
    res.status(200).json({ ok: true, status, paid, id: js?.id || paymentId, metadata: js?.metadata || null });
  } catch (e) {
    try { console.error('[api/payments/status] error', e); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}


