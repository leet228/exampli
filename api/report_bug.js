// ESM serverless: receive bug report with up to 3 images; store to Supabase and notify admin via admin API
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await safeJson(req)
    const text = String(body?.text || '').trim().slice(0, 2000)
    const tgId = body?.tg_id ? String(body.tg_id) : null
    const userId = body?.user_id ? String(body.user_id) : null
    let images = Array.isArray(body?.images) ? body.images.slice(0, 3) : []

    if (!text && (!images || images.length === 0)) { res.status(400).json({ error: 'empty' }); return }

    // Upload images (data URLs) to storage bucket bug-attachments
    const urls = []
    for (const img of images) {
      if (typeof img !== 'string') continue
      if (!img.startsWith('data:')) continue
      try {
        const { mime, buffer, ext } = decodeDataUrl(img)
        const filename = `bug_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext || 'png'}`
        const { error: upErr } = await supabase.storage.from('bug-attachments').upload(filename, buffer, { contentType: mime, upsert: false })
        if (!upErr) {
          const { data } = supabase.storage.from('bug-attachments').getPublicUrl(filename)
          if (data?.publicUrl) urls.push(data.publicUrl)
        }
      } catch {}
    }

    // Insert into table bug_reports
    const insertRow = {
      user_id: userId || null,
      tg_id: tgId || null,
      text,
      images: urls,
      created_at: new Date().toISOString(),
    }
    const { data: ins, error: insErr } = await supabase.from('bug_reports').insert(insertRow).select('id').single()
    if (insErr) { res.status(500).json({ error: 'db_insert_failed', detail: insErr?.message }); return }

    // Notify admin via admin API (optional)
    try {
      const base = publicBase(req)
      const notifyUrl = `${base}/admin/api/bug_notify`
      await fetch(notifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ins?.id || null, text, images: urls, tg_id: tgId || null }) })
    } catch {}

    res.status(200).json({ ok: true, id: ins?.id || null, images: urls })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}

function publicBase(req) {
  try {
    const explicit = process.env.PUBLIC_BASE_URL
    if (explicit) return explicit.replace(/\/$/, '')
    const proto = (req?.headers?.['x-forwarded-proto'] || 'https')
    const host = (req?.headers?.host || process.env.VERCEL_URL || '').toString()
    if (host) return `${proto}://${host}`.replace(/\/$/, '')
  } catch {}
  return ''
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(String(dataUrl))
  if (!match) throw new Error('Invalid data URL')
  const mime = match[1]
  const base64 = match[2]
  const buffer = Buffer.from(base64, 'base64')
  const ext = (mime.split('/')[1] || 'png').split('+')[0]
  return { mime, buffer, ext }
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


