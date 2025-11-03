// ESM serverless function on Vercel: daily admin report at 18:00 MSK
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE (or SERVICE_ROLE_KEY), TELEGRAM_BOT_TOKEN, ADMIN_TG_ID
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const adminChat = process.env.ADMIN_TG_ID
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'supabase_env_missing' }); return }
    if (!botToken || !adminChat) { res.status(500).json({ error: 'telegram_env_missing' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    // Today bounds in MSK (+03:00)
    const now = new Date()
    const pad = (n) => String(n).padStart(2,'0')
    const y = now.getUTCFullYear(), m = now.getUTCMonth()+1, d = now.getUTCDate()
    const todayIsoMsk = `${y}-${pad(m)}-${pad(d)}T00:00:00+03:00`

    // Users
    const { count: total } = await supabase.from('users').select('*', { count: 'exact', head: true })
    const nowIso = new Date().toISOString()
    const { count: plusActive } = await supabase.from('users').select('*', { count: 'exact', head: true }).gt('plus_until', nowIso)
    const { count: aiPlusActive } = await supabase.from('users').select('*', { count: 'exact', head: true }).gt('ai_plus_until', nowIso)
    const { count: newToday } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayIsoMsk)

    // Online now
    let online = 0
    try {
      const { count } = await supabase.from('app_presence').select('user_id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString())
      online = count || 0
    } catch {}

    // Revenue today (RUB)
    let grossToday = 0
    try {
      const { data } = await supabase
        .from('payments')
        .select('amount_rub,status,test,created_at,captured_at')
        .eq('status','succeeded')
        .eq('test', false)
        .gte('created_at', todayIsoMsk)
        .limit(5000)
      for (const p of (data||[])) grossToday += Number(p.amount_rub||0)
    } catch {}

    // Logs summary (prefer drain table, fallback 0)
    let errorsToday = 0
    try {
      const { data, error } = await supabase
        .from('vercel_logs')
        .select('id, level, status, ts, source, path')
        .gte('ts', todayIsoMsk)
        .neq('source', 'external')
        .not('path', 'ilike', '/_vercel/%')
        .limit(5000)
      if (!error) {
        for (const r of (data||[])) {
          const lvl = String(r.level||'').toLowerCase()
          const st = Number(r.status||0)
          if (lvl.includes('error') || lvl.includes('critical') || st >= 500) errorsToday += 1
        }
      }
    } catch {}

    // Build message (HTML)
    const msg = [
      `<b>Отчёт за сегодня (МСК)</b>`,
      `\n👤 Всего пользователей: <b>${(total||0).toLocaleString('ru-RU')}</b>`,
      `⚡ Онлайн сейчас: <b>${(online||0).toLocaleString('ru-RU')}</b>`,
      `🆕 Новые сегодня: <b>${(newToday||0).toLocaleString('ru-RU')}</b>`,
      `\n⭐ PLUS активные: <b>${(plusActive||0).toLocaleString('ru-RU')}</b>`,
      `🤖 AI+ активные: <b>${(aiPlusActive||0).toLocaleString('ru-RU')}</b>`,
      `\n💰 Доход сегодня: <b>${Math.round(grossToday).toLocaleString('ru-RU')} ₽</b>`,
      `🪵 Логи ошибок сегодня: <b>${errorsToday}</b>`
    ].join('\n')

    const tgUrl = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`
    const r = await fetch(tgUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: adminChat, text: msg, parse_mode: 'HTML', disable_web_page_preview: true })
    })
    const text = await r.text()
    let js = null; try { js = text ? JSON.parse(text) : null } catch {}
    if (!r.ok || !js?.ok) { res.status(502).json({ error: 'telegram_send_failed', detail: js || text || null }); return }

    res.status(200).json({ ok: true, sent: true })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'daily_report_failed' })
  }
}


