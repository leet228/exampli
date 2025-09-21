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

    // online: last_active_at within 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { count: online, error: e2 } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_active_at', fiveMinAgo)
    if (e2) { res.status(500).json({ error: e2.message }); return }

    // new24h: created_at within 24h
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: new24h, error: e3 } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo)
    if (e3) { res.status(500).json({ error: e3.message }); return }

    res.status(200).json({ total: total || 0, online: online || 0, new24h: new24h || 0 })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}


