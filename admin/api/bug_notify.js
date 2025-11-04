// ESM serverless (admin): notify admin in Telegram about new bug report

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const adminChat = process.env.ADMIN_TG_ID
    if (!botToken || !adminChat) { res.status(200).json({ ok: true, warn: 'missing env' }); return }

    const body = await safeJson(req)
    const text = String(body?.text || '').slice(0, 1000)
    const images = Array.isArray(body?.images) ? body.images.slice(0, 3) : []
    const header = `Новый баг-репорт\n\n${text}`
    await tgSend(botToken, adminChat, header)
    for (const url of images) {
      try { await tgSendPhoto(botToken, adminChat, url, null) } catch {}
    }
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}

async function safeJson(req) {
  if (req?.body && typeof req.body === 'object') return req.body
  return new Promise((resolve) => {
    let body = ''
    req.on?.('data', (c) => { body += c })
    req.on?.('end', () => { try { resolve(body ? JSON.parse(body) : {}) } catch { resolve({}) } })
    req.on?.('error', () => resolve({}))
  })
}

async function tgSend(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) })
}

async function tgSendPhoto(botToken, chatId, photoUrl, caption) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption || undefined }) })
}


