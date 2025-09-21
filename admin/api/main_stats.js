export default async function handler(req, res) {
  try {
    const host = (req.headers['host'] || '').toString()
    const qDomain = (req.query?.domain || '').toString().trim()
    const defaultMain = 'exampli.vercel.app'
    // Guess main host from admin host
    let mainHost = host
    if (mainHost.startsWith('admin.')) mainHost = mainHost.replace(/^admin\./, '')
    if (mainHost.startsWith('admin-')) mainHost = mainHost.replace(/^admin-/, '')
    if (!mainHost || mainHost === host) mainHost = defaultMain

    let proto = req.headers['x-forwarded-proto']?.toString() || 'https'
    if (qDomain) {
      try {
        const u = qDomain.startsWith('http') ? new URL(qDomain) : new URL(`${proto}://${qDomain}`)
        mainHost = u.host
        proto = u.protocol.replace(':', '') || proto
      } catch {}
    }

    const path = (req.query?.path || '/').toString()
    const url = `${proto}://${mainHost}${path.startsWith('/') ? path : '/' + path}`

    const started = Date.now()
    let status = 0
    try {
      const r = await fetch(url, { method: 'GET', redirect: 'manual' })
      status = r.status
    } catch {
      status = 0
    }
    const ms = Date.now() - started
    res.status(200).json({ url, status, ms, ok: status >= 200 && status < 500 })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'main_stats error' })
  }
}


