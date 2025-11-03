// Receive Vercel Log Drain (Custom Endpoint) events and store in Supabase
// Optional signature verification with env VERCEL_LOG_DRAIN_SECRET
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return }

    const secret = process.env.VERCEL_LOG_DRAIN_SECRET || ''
    const text = await readRaw(req)
    if (secret) {
      const header = String(req.headers['x-vercel-signature'] || '')
      const bodyBuf = Buffer.from(text || '', 'utf-8')
      const expected = crypto.createHmac('sha1', secret).update(bodyBuf).digest('hex')
      if (!header || header !== expected) {
        res.status(403).json({ code: 'invalid_signature', error: "signature didn't match" });
        return
      }
    }
    const rows = parseNdjson(text)
    if (!rows.length) { res.status(200).json({ ok: true, received: 0 }); return }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    let inserted = 0
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey)
      const mapped = rows.map(normalize)
      try {
        const { error } = await supabase.from('vercel_logs').insert(mapped.slice(0, 500))
        if (!error) inserted = Math.min(500, mapped.length)
      } catch {}
      // Immediate alerts for error logs (level:error/critical or status>=500)
      try { await alertErrors(mapped.filter(isErrorLike)) } catch {}
    }

    res.status(200).json({ ok: true, received: rows.length, inserted })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'drain_failed' })
  }
}

function parseNdjson(text) {
  try {
    const raw = String(text || '')
    const trimmed = raw.trim()
    // Single JSON object/array
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const j = JSON.parse(trimmed)
      return Array.isArray(j) ? j : [j]
    }
    // NDJSON
    const lines = raw.split(/\r?\n/).filter(Boolean)
    const arr = []
    for (const ln of lines) {
      try { arr.push(JSON.parse(ln)) } catch { /* skip */ }
    }
    return arr
  } catch { return [] }
}

function normalize(r) {
  const ts = r.timestamp || r.time || r.ts || Date.now()
  const level = (r.level || r.severity || 'info').toString()
  const msg = r.message || r.text || (r.payload && (r.payload.text || r.payload.message)) || ''
  let status = Number(r.status || r.code || (r.payload && (r.payload.statusCode || r.payload.status)) || NaN)
  let path = r.path || r.url || (r.payload && (r.payload.path || r.payload.url)) || null
  // Try to derive from message text like: "[POST] /api/boot1 status=200"
  try {
    const text = String(msg || '')
    if (!Number.isFinite(status) || status === 0) {
      const m = text.match(/status\s*=\s*(\d{3})/i)
      if (m) status = Number(m[1])
    }
    if (!path) {
      const p = text.match(/\[\w+\]\s+([^\s]+)\s+status=/) || text.match(/\s(\/[^\s]+)\sstatus=/)
      if (p && p[1]) path = p[1]
    }
  } catch {}
  if (!Number.isFinite(status)) status = null
  const source = r.source || r.type || 'log'
  const dep = r.deploymentId || r.deployment_id || null
  const proj = r.projectId || r.project_id || null
  const reqId = r.requestId || r.request_id || null
  return { ts: new Date(typeof ts === 'number' ? ts : Number(ts || 0)).toISOString(), level, message: String(msg).slice(0, 4000), status: Number.isFinite(status) ? status : null, path, source, deployment_id: dep, project_id: proj, request_id: reqId }
}

function isErrorLike(row) {
  try {
    const lvl = String(row.level || '').toLowerCase()
    return lvl.includes('error') || lvl.includes('critical') || (Number(row.status||0) >= 500)
  } catch { return false }
}

async function alertErrors(rows) {
  if (!rows || !rows.length) return
  const bot = process.env.TELEGRAM_BOT_TOKEN
  const chat = process.env.ADMIN_TG_ID
  if (!bot || !chat) return
  const pad = (s) => String(s || '').slice(0, 200)
  const chunks = rows.slice(0, 5) // ограничим пачку, чтобы не заспамить
  const lines = chunks.map(r => `❌ <b>${(r.status||'')}</b> <code>${pad(r.path||r.source||'')}</code>\n<code>${pad(r.message||'')}</code>`)
  const text = `<b>Ошибки в логах</b>\n` + lines.join('\n\n')
  const url = `https://api.telegram.org/bot${encodeURIComponent(bot)}/sendMessage`
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }) })
}

function readRaw(req) {
  return new Promise((resolve) => {
    try {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => resolve(body))
    } catch { resolve('') }
  })
}


