import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE
    if (!url || !serviceKey) { res.status(500).json({ error: 'supabase_env_missing' }); return }

    const supabase = createClient(url, serviceKey)
    const now = new Date()
    const dayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Activity
    const { count: dau } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_active_at', dayAgo)
    const { count: wau } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_active_at', weekAgo)
    const { count: mau } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('last_active_at', monthAgo)

    // Retention approximation
    async function cohortRet(agoDays) {
      const start = new Date(now.getTime() - (agoDays + 1) * 24 * 60 * 60 * 1000).toISOString()
      const end = new Date(now.getTime() - agoDays * 24 * 60 * 60 * 1000).toISOString()
      const { count: cohort } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end)
      if (!cohort) return { cohort: 0, returned: 0, rate: null }
      const { count: returned } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', start).lt('created_at', end).gte('last_active_at', dayAgo)
      return { cohort: cohort || 0, returned: returned || 0, rate: cohort ? (returned || 0) / cohort : null }
    }

    const d1 = await cohortRet(1)
    const d7 = await cohortRet(7)
    const d30 = await cohortRet(30)

    res.status(200).json({
      dau: dau || 0,
      wau: wau || 0,
      mau: mau || 0,
      retention: { d1, d7, d30 }
    })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'users_activity error' })
  }
}


