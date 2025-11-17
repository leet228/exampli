import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE
    if (!url || !serviceKey) { res.status(500).json({ error: 'supabase_env_missing' }); return }

    const supabase = createClient(url, serviceKey)

    // total users
    const { count: total, error: e1 } = await supabase.from('users').select('*', { count: 'exact', head: true })
    if (e1) { res.status(500).json({ error: e1.message }); return }

    // online: prefer app_presence with expires_at > now; fallback to users.last_active_at within 5 minutes
    let online = 0
    try {
      const nowIso = new Date().toISOString()
      const { count: presCount, error: pe } = await supabase
        .from('app_presence')
        .select('user_id', { count: 'exact', head: true })
        .gt('expires_at', nowIso)
      if (!pe && typeof presCount === 'number') online = presCount || 0
      else throw pe
    } catch {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { count: fallbackCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', fiveMinAgo)
      online = fallbackCount || 0
    }

    // new24h: created_at within 24hasdasd
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: new24h, error: e3 } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo)
    if (e3) { res.status(500).json({ error: e3.message }); return }

    // Active PLUS and AI+ (until > now)
    const nowIso = new Date().toISOString()
    const { count: plusActive } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('plus_until', nowIso)
    const { count: aiPlusActive } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('ai_plus_until', nowIso)

    res.status(200).json({ total: total || 0, online: online || 0, new24h: new24h || 0, plusActive: plusActive || 0, aiPlusActive: aiPlusActive || 0 })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}


