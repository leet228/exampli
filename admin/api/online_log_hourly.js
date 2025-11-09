// ESM serverless function: log current online once per hour (cron)
// Uses Supabase: prefer app_presence.expires_at > now, fallback to users.last_active_at within 5m
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'supabase_env_missing' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    // Compute current online
    const now = new Date()
    let online = 0
    try {
      const { count, error } = await supabase
        .from('app_presence')
        .select('user_id', { count: 'exact', head: true })
        .gt('expires_at', now.toISOString())
      if (error) throw error
      online = Number(count || 0)
    } catch {
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
      const { count: c2 } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', fiveMinAgo)
      online = Number(c2 || 0)
    }

    // Prepare hour bucket in UTC (for de-duplication) and MSK day for reporting
    const hourUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0))
    const hourUtcIso = hourUtc.toISOString()
    const dayMskIso = mskDayIso(now) // YYYY-MM-DD

    // Upsert into online_samples with unique hour_utc
    await supabase
      .from('online_samples')
      .upsert({
        sampled_at: now.toISOString(),
        hour_utc: hourUtcIso,
        day_msk: dayMskIso,
        online
      }, { onConflict: 'hour_utc' })

    res.status(200).json({ ok: true, online, hour_utc: hourUtcIso, day_msk: dayMskIso })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'online_log_hourly_failed' })
  }
}

function mskDayIso(at = new Date()) {
  try {
    const tz = 'Europe/Moscow'
    const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    const p = fmt.formatToParts(at)
    const y = Number(p.find(x => x.type === 'year')?.value || 0)
    const m = String(Number(p.find(x => x.type === 'month')?.value || 0)).padStart(2, '0')
    const d = String(Number(p.find(x => x.type === 'day')?.value || 0)).padStart(2, '0')
    return `${y}-${m}-${d}`
  } catch {
    const n = new Date(at)
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }
}


