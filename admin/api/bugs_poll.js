import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(204).end(); return }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const adminChat = process.env.ADMIN_TG_ID
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env', detail: 'supabase' }); return }
    if (!botToken || !adminChat) { res.status(200).json({ ok: true, warn: 'missing_telegram' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    // Strategy A: columns with notified_at
    let rows = []
    let usedFallback = false
    const a = await supabase
      .from('bug_reports')
      .select('id, created_at, tg_id, text, images')
      .is('notified_at', null)
      .order('created_at', { ascending: true })
      .limit(20)
    if (!a.error) {
      rows = a.data || []
    } else {
      // fallback: use a helper table bug_reports_notified(bug_id uuid pk)
      usedFallback = true
      const since = new Date(Date.now() - 24*60*60*1000).toISOString()
      const br = await supabase
        .from('bug_reports')
        .select('id, created_at, tg_id, text, images')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(50)
      if (!br.error) {
        const ids = (br.data || []).map(r => r.id)
        let seen = []
        if (ids.length) {
          const seenReq = await supabase
            .from('bug_reports_notified')
            .select('bug_id')
            .in('bug_id', ids)
          if (!seenReq.error) seen = (seenReq.data || []).map(r => r.bug_id)
        }
        rows = (br.data || []).filter(r => !seen.includes(r.id)).slice(0, 20)
      }
    }

    let sent = 0
    for (const b of rows) {
      try {
        const header = `Новый баг-репорт\n\n${String(b.text || '').slice(0,1000)}`
        await tgSend(botToken, adminChat, header)
        const imgs = Array.isArray(b.images) ? b.images.slice(0, 3) : []
        for (const u of imgs) { try { await tgSendPhoto(botToken, adminChat, u, null) } catch {} }
        sent += 1
        if (!usedFallback) {
          await supabase.from('bug_reports').update({ notified_at: new Date().toISOString() }).eq('id', b.id)
        } else {
          await supabase.from('bug_reports_notified').upsert({ bug_id: b.id })
        }
      } catch {}
    }

    res.status(200).json({ ok: true, checked: rows.length, sent, fallback: usedFallback })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}

async function tgSend(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) })
}

async function tgSendPhoto(botToken, chatId, photoUrl, caption) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption || undefined }) })
}


