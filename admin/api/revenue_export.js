// ESM serverless function: make CSV for month and send via Telegram bot DM
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(204).end(); return }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const adminChat = process.env.ADMIN_TG_ID
    if (!url || !key) { res.status(500).json({ error: 'supabase_env_missing' }); return }
    if (!botToken || !adminChat) { res.status(500).json({ error: 'telegram_env_missing' }); return }
    const supabase = createClient(url, key)

    const y = Number((req.query?.year || '').toString())
    const m = Number((req.query?.month || '').toString())
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12 || y < 2000 || y > 2100) {
      res.status(400).json({ error: 'invalid_period' }); return
    }
    const pad = (n) => String(n).padStart(2, '0')
    const startIso = `${y}-${pad(m)}-01T00:00:00Z`
    const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
    const endIso = `${next.y}-${pad(next.m)}-01T00:00:00Z`

    const { data, error } = await supabase
      .from('payments')
      .select('id,user_id,type,product_id,amount_rub,currency,status,test,created_at,captured_at')
      .eq('status', 'succeeded')
      .eq('test', false)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .limit(5000)
    if (error) { res.status(500).json({ error: error.message }); return }

    const header = ['ID платежа','Дата','Сумма (руб)','Валюта','Тип','Товар','Пользователь','Статус']
    const lines = [header]
    for (const p of data || []) {
      const date = new Date(p.captured_at || p.created_at).toISOString()
      lines.push([
        p.id,
        date,
        Number(p.amount_rub || 0).toFixed(2),
        p.currency || 'RUB',
        p.type,
        p.product_id ?? '',
        p.user_id ?? '',
        p.status,
      ])
    }
    const csv = lines.map(row => row.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n')

    // Send via Telegram sendDocument
    const filename = `payments_${y}-${pad(m)}.csv`
    const fd = new FormData()
    fd.append('chat_id', adminChat)
    fd.append('caption', `Экспорт платежей за ${pad(m)}.${y} — ${data?.length || 0} записей`)
    fd.append('document', new Blob([csv], { type: 'text/csv' }), filename)
    const tgUrl = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendDocument`
    const tgRes = await fetch(tgUrl, { method: 'POST', body: fd })
    const tgText = await tgRes.text()
    let js = null; try { js = tgText ? JSON.parse(tgText) : null } catch {}
    if (!tgRes.ok || !js?.ok) { res.status(502).json({ error: 'telegram_send_failed', detail: js || tgText || null }); return }

    res.status(200).json({ ok: true, sent: true, rows: data?.length || 0 })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}


