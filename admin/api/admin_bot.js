// ESM serverless function: Admin Telegram bot webhook
// Set BotFather webhook URL to /api/admin_bot for the admin deployment
// Env: ADMIN_TELEGRAM_BOT_TOKEN (preferred) or TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE (or *_KEY)
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'POST, OPTIONS')
      res.status(204).end()
      return
    }
    if (req.method === 'GET') {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env' }); return }
      const supabase = createClient(supabaseUrl, serviceKey)

      // Debug: return report text; optionally send if chat provided (?send=1&chat=123)
      const botToken = process.env.ADMIN_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
      const msg = await buildDailyReportMessage(supabase)
      const send = String((req.query||{}).send||'0') === '1'
      const chat = String((req.query||{}).chat||'')
      if (send && botToken && chat) {
        try { await tgSend(botToken, chat, msg, { parse_mode: 'HTML', disable_web_page_preview: true }) } catch {}
        res.status(200).json({ ok: true, sent: true, chat })
        return
      }
      res.status(200).json({ ok: true, message: msg })
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS')
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    const botToken = process.env.ADMIN_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    if (!botToken || !supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    const update = await safeJson(req)
    const msg = update?.message || null
    const text = (msg?.text || '').trim()
    const chatId = String(msg?.from?.id || msg?.chat?.id || '')
    if (!text || !chatId) { res.status(200).json({ ok: true, skipped: true }); return }

    // Only allow messages from ADMIN_TG_ID (if set)
    const adminId = String(process.env.ADMIN_TG_ID || '')
    const fromId = String(msg?.from?.id || '')
    if (adminId && fromId !== adminId) {
      res.status(200).json({ ok: true, ignored: true })
      return
    }

    // /stats: send daily admin report message (same as 18:00 MSK)
    if (/^\/stats(?:@\w+)?(?:\s|$)/i.test(text)) {
      try {
        const report = await buildDailyReportMessage(supabase)
        await tgSend(botToken, chatId, report, { parse_mode: 'HTML', disable_web_page_preview: true })
        res.status(200).json({ ok: true, stats: true })
        return
      } catch {
        await tgSend(botToken, chatId, 'Не смог собрать стату. Попробуй позже.')
        res.status(200).json({ ok: true, stats: false })
        return
      }
    }

    // /start
    if (/^\/start(\s|$)/i.test(text)) {
      const welcome =
        [
          '<b>Привет! Я — админ‑бот КУРСИКА.</b>',
          '',
          'Команды:',
          '— /stats — отчёт за сегодня (МСК)',
        ].join('\n')
      await tgSend(botToken, chatId, welcome, { parse_mode: 'HTML', disable_web_page_preview: true })
      res.status(200).json({ ok: true, greeted: true })
      return
    }

    // Default: hint
    await tgSend(botToken, chatId, 'Команда не распознана. Попробуй /stats')
    res.status(200).json({ ok: true })
  } catch (e) {
    try { console.error('[admin/api/admin_bot] error', e) } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}

async function buildDailyReportMessage(supabase) {
  // Today bounds in MSK (+03:00)
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const msInDay = 24 * 60 * 60 * 1000
  const startOfDayIsoMsk = (date) => {
    const yy = date.getUTCFullYear()
    const mm = date.getUTCMonth() + 1
    const dd = date.getUTCDate()
    return `${yy}-${pad(mm)}-${pad(dd)}T00:00:00+03:00`
  }
  const todayIsoMsk = startOfDayIsoMsk(now)
  const weekStartIsoMsk = startOfDayIsoMsk(new Date(now.getTime() - 6 * msInDay))
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1

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

  // Online stats for today (MSK)
  let avgOnlineToday = 0
  let maxOnlineToday = 0
  let maxAtIso = null
  try {
    const dayMsk = String(todayIsoMsk).slice(0, 10)
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
  const monthIsoMsk = `${y}-${pad(m)}-01T00:00:00+03:00`
  let grossMonth = 0
  try {
    const { data } = await supabase
      .from('payments')
      .select('amount_rub,status,test,created_at,captured_at')
      .eq('status', 'succeeded')
      .eq('test', false)
      .gte('created_at', monthIsoMsk)
      .limit(5000)
    for (const p of (data || [])) grossMonth += Number(p.amount_rub || 0)
  } catch {}

  // Logs summary
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
      for (const r of (data || [])) {
        const lvl = String(r.level || '').toLowerCase()
        let st = Number(r.status || 0)
        if (!Number.isFinite(st) || st === 0) {
          try { const m = String(r.message || '').match(/status\s*=\s*(\d{3})/i); if (m) st = Number(m[1]) } catch {}
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
  return msg
}

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

async function tgSend(botToken, chatId, text, extra) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`
  const payload = { chat_id: chatId, text, ...(extra || {}) }
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
}

function formatTimeMsk(iso) {
  try {
    const tz = 'Europe/Moscow'
    const d = new Date(String(iso))
    const f = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    return f.format(d)
  } catch { return null }
}

async function safeJson(req) {
  if (req?.body && typeof req.body === 'object') return req.body
  return new Promise((resolve) => {
    let body = ''; req.on?.('data', (c) => { body += c; });
    req.on?.('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on?.('error', () => resolve({}));
  })
}


