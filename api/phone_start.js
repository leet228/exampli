// ESM serverless: start phone verification via IQSMS (Russia)
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// Lightweight local .env loader for dev (no external deps)
try {
  if (process.env.NODE_ENV !== 'production') {
    const cwd = process.cwd()
    for (const name of ['.env.local', '.env']) {
      try {
        const p = path.join(cwd, name)
        if (fs.existsSync(p)) {
          const txt = fs.readFileSync(p, 'utf8')
          txt.split(/\r?\n/).forEach((line) => {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
            if (!m) return
            const key = m[1]
            let val = m[2]
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1)
            }
            if (process.env[key] == null) process.env[key] = val
          })
        }
      } catch {}
    }
  }
} catch {}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return }

    const body = await safeJson(req)
    const rawPhone = String(body?.phone || '').trim()
    const tgId = body?.tg_id != null ? String(body.tg_id) : null
    const userIdFromClient = body?.user_id ? String(body.user_id) : null
    const phone = normalizePhone(rawPhone)
    if (!phone) { res.status(400).json({ error: 'invalid_phone' }); return }

    // Debug: check env visibility without leaking secrets
    if ((req.query || {}).debug === 'env') {
      res.status(200).json({
        ok: true,
        env_present: {
          IQSMS_LOGIN: Boolean(process.env.IQSMS_LOGIN || '').valueOf(),
          IQSMS_PASSWORD: Boolean(process.env.IQSMS_PASSWORD || '').valueOf(),
          IQSMS_FROM: Boolean(process.env.IQSMS_FROM || '').valueOf(),
          IQSMS_AUTH_MODE: String(process.env.IQSMS_AUTH_MODE || 'query'),
          SUPABASE_URL: Boolean(process.env.SUPABASE_URL || '').valueOf(),
          SUPABASE_SERVICE_ROLE_KEY: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '')).valueOf(),
        }
      })
      return
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    // Rate-limit by phone: 5 per day
    try {
      const since = new Date(Date.now() - 24*60*60*1000).toISOString()
      const { data: rlRows } = await supabase
        .from('phone_verifications')
        .select('created_at')
        .eq('phone_e164', phone)
        .gte('created_at', since)
      if ((rlRows || []).length >= 5) { res.status(429).json({ error: 'rate_limited' }); return }
    } catch {}

    const ttlSec = Number(process.env.PHONE_CODE_TTL_SEC || '600')
    const code = generateCode(6)
    const secret = process.env.PHONE_CODE_SECRET || (process.env.SUPABASE_SERVICE_ROLE_KEY || '')
    const codeHash = hashCode(phone, code, secret)
    const expiresAt = new Date(Date.now() + ttlSec*1000).toISOString()

    // Upsert record
    try {
      await supabase
        .from('phone_verifications')
        .upsert({ phone_e164: phone, code_hash: codeHash, expires_at: expiresAt, attempts_left: 3, provider: 'iqsms', tg_id: tgId, user_id: userIdFromClient, created_at: new Date().toISOString() }, { onConflict: 'phone_e164' })
    } catch (e) {}

    // Dry-run mode (no real SMS). Enable by env IQSMS_DRY_RUN=1 or query ?dry=1
    const isDry = String(process.env.IQSMS_DRY_RUN || '') === '1' || String((req.query||{}).dry || '') === '1'
    const echo = String(process.env.PHONE_DEV_ECHO || '') === '1'
    if (isDry) {
      res.status(200).json({ ok: true, ttl: ttlSec, dev_code: echo ? code : undefined, dry: true })
      return
    }

    // Send SMS via IQSMS
    const sender = process.env.IQSMS_FROM ? String(process.env.IQSMS_FROM) : undefined
    // ASCII-текст ускоряет прохождение части маршрутов и меньше фильтруется
    const text = `KURSIK code: ${code}`
    const { ok: sent, detail, status } = await sendIqsms({ phone, text, sender })
    if (!sent) { res.status(502).json({ error: 'sms_failed', provider_status: status, detail }); return }

    res.status(200).json({ ok: true, ttl: ttlSec })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}

function normalizePhone(raw) {
  try {
    let d = String(raw || '').replace(/\D+/g, '')
    if (!d) return null
    if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1)
    if (d.length === 10 && !d.startsWith('7')) d = '7' + d
    if (d.length === 11 && d.startsWith('7')) return '+' + d
    if (d.length === 12 && d.startsWith('7')) return '+' + d.slice(0, 11)
    if (d.length === 12 && d.startsWith('+' )) return d
    if (d.length === 11 && d.startsWith('+')) return d
    if (d.startsWith('7') && d.length === 11) return '+' + d
    return '+' + d
  } catch { return null }
}

function generateCode(len=6) {
  const n = Math.pow(10, len-1)
  const v = Math.floor(Math.random() * 9*n) + n
  return String(v)
}

function hashCode(phone, code, secret) {
  return crypto.createHmac('sha256', String(secret || 's')).update(`${phone}:${code}`).digest('hex')
}

async function sendIqsms({ phone, text, sender }) {
  try {
    const login = process.env.IQSMS_LOGIN
    const pass = process.env.IQSMS_PASSWORD
    const to = phone // IQSMS expects +7123... per docs
    const authMode = String(process.env.IQSMS_AUTH_MODE || 'query').toLowerCase() // 'query' | 'basic'

    if (!login || !pass) {
      return { ok: false, detail: 'missing IQSMS_LOGIN or IQSMS_PASSWORD', status: 0 }
    }

    // Preferred: REST v2 GET with Basic or login/password in params
    {
      const params = new URLSearchParams()
      params.set('phone', to)
      params.set('text', text)
      if (sender) params.set('sender', sender)
      if (String(process.env.IQSMS_FLASH || '') === '1') params.set('flash', '1')
      // By default use query auth per docs; switch to basic only if explicitly requested
      if (authMode !== 'basic') {
        params.set('login', login)
        params.set('password', pass)
      }
      const url = `https://api.iqsms.ru/messages/v2/send/?${params.toString()}`
      const headers = authMode === 'basic' ? { 'Authorization': `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}` } : {}
      try {
        const r = await fetch(url, { method: 'GET', headers })
        const txt = await r.text().catch(() => '')
        if (r.ok) {
          // Plain text: accepted;ID or error text
          if (/^accepted;[A-F0-9-]{1,72}/i.test(txt.trim())) {
            return { ok: true, detail: txt, status: r.status }
          }
          return { ok: false, detail: txt || 'unknown_response', status: r.status }
        }
        if (txt) return { ok: false, detail: txt, status: r.status }
      } catch (e) {
        // continue to fallback
      }
    }

    // Fallback: legacy endpoint
    {
      const params = new URLSearchParams()
      if (login) params.set('login', login)
      if (pass) params.set('password', pass)
      params.set('phone', to)
      params.set('text', text)
      if (sender) params.set('sender', sender)
      if (String(process.env.IQSMS_FLASH || '') === '1') params.set('flash', '1')
      const url = `https://api.iqsms.ru/messages/send/?${params.toString()}`
      const r2 = await fetch(url, { method: 'GET' })
      const txt2 = await r2.text().catch(() => '')
      if (r2.ok) {
        if (/^accepted;[A-F0-9-]{1,72}/i.test(txt2.trim())) return { ok: true, detail: txt2, status: r2.status }
        return { ok: false, detail: txt2 || 'unknown_response', status: r2.status }
      }
      return { ok: false, detail: txt2, status: r2.status }
    }
  } catch (e) { return { ok: false, detail: String(e), status: 0 } }
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


