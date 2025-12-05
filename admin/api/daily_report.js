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

    // IQSMS balance helper
    async function fetchIqsmsBalance() {
      try {
        const login = process.env.IQSMS_LOGIN
        const password = process.env.IQSMS_PASSWORD
        if (!login || !password) return { ok: false, error: 'missing_iqsms_env' }
        const url = `https://api.iqsms.ru/messages/v2/balance/?login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`
        const r = await fetch(url)
        const txt = await r.text().catch(() => '')
        if (!r.ok) return { ok: false, error: 'http', status: r.status, detail: txt }
        const first = (txt || '').trim().split(/\r?\n/)[0] || ''
        const [curr, amt] = first.split(';')
        const balance = Number(String(amt || '0').replace(',', '.'))
        return { ok: true, currency: (curr || 'RUB').trim(), balance: Number.isFinite(balance) ? balance : 0, raw: txt }
      } catch (e) { return { ok: false, error: String(e) } }
    }

    // Today bounds in MSK (+03:00)
    const now = new Date()
    const pad = (n) => String(n).padStart(2,'0')
    const msInDay = 24 * 60 * 60 * 1000
    const startOfDayIsoMsk = (date) => {
      const yy = date.getUTCFullYear()
      const mm = date.getUTCMonth() + 1
      const dd = date.getUTCDate()
      return `${yy}-${pad(mm)}-${pad(dd)}T00:00:00+03:00`
    }
    const todayIsoMsk = startOfDayIsoMsk(now)
    const weekStartIsoMsk = startOfDayIsoMsk(new Date(now.getTime() - 6 * msInDay))
    const y = now.getUTCFullYear(), m = now.getUTCMonth()+1
    const monthIsoMsk = `${y}-${pad(m)}-01T00:00:00+03:00`

    // Users
    const { count: total } = await supabase.from('users').select('*', { count: 'exact', head: true })
    const nowIso = new Date().toISOString()
    const { count: plusActive } = await supabase.from('users').select('*', { count: 'exact', head: true }).gt('plus_until', nowIso)
    const { count: aiPlusActive } = await supabase.from('users').select('*', { count: 'exact', head: true }).gt('ai_plus_until', nowIso)
    const { count: newToday } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayIsoMsk)
    const { count: newWeek } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', weekStartIsoMsk)
    const { count: newMonth } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', monthIsoMsk)

    // Online now
    let online = 0
    try {
      const { count } = await supabase.from('app_presence').select('user_id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString())
      online = count || 0
    } catch {}

    // Online stats for today (MSK): average (active hours) and max with time
    let avgOnlineToday = 0
    let maxOnlineToday = 0
    let maxAtIso = null
    try {
      const dayMsk = String(todayIsoMsk).slice(0, 10) // YYYY-MM-DD
      const { data: samples } = await supabase
        .from('online_samples')
        .select('online,hour_utc')
        .eq('day_msk', dayMsk)
        .order('hour_utc', { ascending: true })
        .limit(1000)
      const nums = []
      for (const r of (samples || [])) {
        const v = Number(r?.online || 0)
        if (v > maxOnlineToday) { maxOnlineToday = v; maxAtIso = String(r?.hour_utc || null) || null }
        if (v > 0) nums.push(v)
      }
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0)
        avgOnlineToday = Math.round(sum / nums.length)
      } else {
        avgOnlineToday = 0
      }
    } catch {}

    const maxAtMsk = maxAtIso ? formatTimeMsk(maxAtIso) : null

  // Revenue this month (RUB)
  // Старт текущего месяца в МСК
  let grossMonth = 0
    try {
      const { data } = await supabase
        .from('payments')
        .select('amount_rub,status,test,created_at,captured_at')
        .eq('status','succeeded')
        .eq('test', false)
      .gte('created_at', monthIsoMsk)
        .limit(5000)
    for (const p of (data||[])) grossMonth += Number(p.amount_rub||0)
    } catch {}

    // Logs summary (prefer drain table, fallback 0)
    let errorsToday = 0
    try {
      const { data, error } = await supabase
        .from('vercel_logs')
        .select('id, level, status, ts, source, path, message')
        .gte('ts', todayIsoMsk)
        .neq('source', 'external')
        .not('path', 'ilike', '/_vercel/%')
        .limit(5000)
      if (!error) {
        for (const r of (data||[])) {
          const lvl = String(r.level||'').toLowerCase()
          let st = Number(r.status||0)
          if (!Number.isFinite(st) || st === 0) {
            try { const m = String(r.message||'').match(/status\s*=\s*(\d{3})/i); if (m) st = Number(m[1]) } catch {}
          }
          if (lvl.includes('error') || lvl.includes('critical') || st >= 500) errorsToday += 1
        }
      }
    } catch {}

    // IQSMS balance
    const iq = await fetchIqsmsBalance()

    // Build message (HTML)
    const msg = [
      `<b>Отчёт за сегодня (МСК)</b>`,
      `\n👤 Всего пользователей: <b>${(total||0).toLocaleString('ru-RU')}</b>`,
      `⚡ Онлайн сейчас: <b>${(online||0).toLocaleString('ru-RU')}</b>`,
      `📈 Средний онлайн за день: <b>${(avgOnlineToday||0).toLocaleString('ru-RU')}</b>`,
      `🔝 Максимальный онлайн за день: <b>${(maxOnlineToday||0).toLocaleString('ru-RU')}</b>${maxAtMsk ? ` в <b>${maxAtMsk} МСК</b>` : ''}`,
      `🆕 Новые сегодня: <b>${(newToday||0).toLocaleString('ru-RU')}</b>`,
      `📅 Новые за 7 дней: <b>${(newWeek||0).toLocaleString('ru-RU')}</b>`,
      `🗓️ Новые за месяц: <b>${(newMonth||0).toLocaleString('ru-RU')}</b>`,
      `\n⭐ PLUS активные: <b>${(plusActive||0).toLocaleString('ru-RU')}</b>`,
      `🤖 AI+ активные: <b>${(aiPlusActive||0).toLocaleString('ru-RU')}</b>`,
    `\n💰 Доход за месяц: <b>${Math.round(grossMonth).toLocaleString('ru-RU')} ₽</b>`,
      `🪵 Логи ошибок сегодня: <b>${errorsToday}</b>`,
      `\n📟 IQSMS баланс: <b>${iq?.ok ? `${(iq.balance||0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${iq.currency || 'RUB'}` : 'н/д'}</b>`
    ].join('\n')

    // Debug via browser without sending Telegram
    if (String((req.query||{}).only||'') === 'iqsms') { res.status(200).json({ ok: true, iqsms: iq }); return }
    if (String((req.query||{}).dry||'') === '1') { res.status(200).json({ ok: true, message: msg }); return }

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

function formatTimeMsk(iso) {
  try {
    const tz = 'Europe/Moscow'
    const d = new Date(String(iso))
    const f = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    return f.format(d)
  } catch { return null }
}


