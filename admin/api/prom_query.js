/**
 * Simple Prometheus HTTP API proxy
 * ENV:
 *  - PROM_URL: base, e.g. https://prom.example.com
 *  - PROM_BEARER: optional bearer token
 */
export default async function handler(req, res) {
  try {
    const base = process.env.PROM_URL
    if (!base) { res.status(500).json({ error: 'PROM_URL missing' }); return }
    const token = process.env.PROM_BEARER

    const { q, range, step } = (req.method === 'POST' ? req.body : req.query) || {}
    if (!q) { res.status(400).json({ error: 'q (query) is required' }); return }

    const isRange = !!range
    const url = new URL(isRange ? '/api/v1/query_range' : '/api/v1/query', base)
    if (isRange) {
      const [start, end] = Array.isArray(range) ? range : String(range).split(',')
      url.searchParams.set('start', start)
      url.searchParams.set('end', end)
      url.searchParams.set('step', String(step || '30s'))
    }
    url.searchParams.set('query', String(q))

    const headers = { }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const r = await fetch(url.toString(), { headers })
    const text = await r.text()
    res.status(r.status).send(text)
  } catch (e) {
    res.status(500).json({ error: e?.message || 'prom proxy error' })
  }
}


