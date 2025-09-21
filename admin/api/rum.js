/**
 * RUM receiver: accepts web-vitals payloads
 * POST body: { name, value, id, navigationType, url, ua, ts }
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return }
    const body = req.body || {}
    // minimal validation
    if (typeof body?.name !== 'string' || typeof body?.value !== 'number') {
      res.status(400).json({ error: 'invalid payload' }); return
    }
    // TODO: here you can push to logs (Loki), db or queue
    try {
      console.log('[RUM]', JSON.stringify({ ...body, ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress }))
    } catch {}
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}


