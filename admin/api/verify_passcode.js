import crypto from 'node:crypto'

function timingSafeEqualStrings(a, b) {
  try {
    const ab = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    if (ab.length !== bb.length) {
      // Сравним одинаковой длины, чтобы не подсказать длину
      const pad = Math.max(ab.length, bb.length)
      const ap = Buffer.concat([ab, Buffer.alloc(pad - ab.length)])
      const bp = Buffer.concat([bb, Buffer.alloc(pad - bb.length)])
      return crypto.timingSafeEqual(ap, bp) && false
    }
    return crypto.timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return }

    const envCode = process.env.ADMIN_PASSCODE || process.env.PASSCODE || ''
    if (!envCode) { res.status(500).json({ error: 'passcode_env_not_configured' }); return }
    if (!/^[0-9]{12}$/.test(envCode)) { res.status(500).json({ error: 'passcode_env_invalid_format' }); return }

    const { code } = req.body || {}
    if (typeof code !== 'string' || !/^[0-9]{12}$/.test(code)) { res.status(400).json({ error: 'invalid_code_format' }); return }

    const ok = timingSafeEqualStrings(code, envCode)
    if (!ok) { res.status(401).json({ ok: false }); return }

    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}


