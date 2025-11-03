// Read logs from Supabase table `vercel_logs` written by vercel_log_drain
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'supabase_env_missing' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    const range = (req.query?.range || '24h').toString()
    const now = Date.now()
    const sinceMs = range === '7d' ? now - 7 * 24 * 60 * 60 * 1000 : now - 24 * 60 * 60 * 1000
    const sinceIso = new Date(sinceMs).toISOString()

    let q = supabase
      .from('vercel_logs')
      .select('ts, level, message, source, path, status')
      .gte('ts', sinceIso)
      .order('ts', { ascending: false })
      .limit(500)

    // По умолчанию отдаём только function-логи (исключаем внешние/инсайты)
    const functionsOnly = String(req.query?.functionsOnly || '1')
    if (functionsOnly === '1' || functionsOnly.toLowerCase() === 'true') {
      q = q.neq('source', 'external').not('path', 'ilike', '/_vercel/%')
    }

    const { data, error } = await q
    if (error) { res.status(500).json({ error: error.message }); return }

    const rows = (data || []).map(r => {
      let st = r.status != null ? Number(r.status) : NaN
      if (!Number.isFinite(st) || st === 0) {
        try {
          const m = String(r.message || '').match(/status\s*=\s*(\d{3})/i)
          if (m) st = Number(m[1])
        } catch {}
      }
      return { ts: r.ts, level: String(r.level||'info'), message: r.message || '', source: r.source || 'log', path: r.path || null, status: Number.isFinite(st) ? st : null }
    })

    const wantSummary = String(req.query?.summary || '').toLowerCase() === '1' || String(req.query?.summary || '').toLowerCase() === 'true'
    const summary = wantSummary ? computeSummary(rows) : undefined
    res.status(200).json({ ok: true, rows, range, summary })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'logs_db_failed' })
  }
}

function computeSummary(rows) {
  let total = 0, errors = 0
  for (const r of rows || []) {
    total += 1
    const lvl = String(r.level || '').toLowerCase()
    const st = Number(r.status || 0)
    if (lvl.includes('error') || lvl.includes('critical') || st >= 500) errors += 1
  }
  return { total, errors, errorRate: total ? errors / total : 0 }
}


