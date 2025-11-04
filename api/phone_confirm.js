// ESM serverless: confirm phone by code
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
    const phone = String(body?.phone || '').trim()
    const code = String(body?.code || '').trim()
    const tgId = body?.tg_id != null ? String(body.tg_id) : null
    const userIdFromClient = body?.user_id ? String(body.user_id) : null
    if (!phone || !code) { res.status(400).json({ error: 'bad_request' }); return }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
    if (!supabaseUrl) { res.status(500).json({ error: 'missing_supabase_url' }); return }
    if (!serviceKey) { res.status(500).json({ error: 'missing_service_key' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)

    if ((req.query || {}).debug === 'env') {
      res.status(200).json({ ok: true, env: { supabaseUrl, hasService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE), usedKeyIsService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE) } })
      return
    }

    // Load verification row
    const { data: row } = await supabase
      .from('phone_verifications')
      .select('phone_e164, code_hash, expires_at, attempts_left, tg_id, user_id')
      .eq('phone_e164', phone)
      .maybeSingle()
    if (!row) { res.status(400).json({ error: 'code_not_found' }); return }
    if (row.attempts_left != null && Number(row.attempts_left) <= 0) { res.status(429).json({ error: 'attempts_exceeded' }); return }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) { res.status(400).json({ error: 'code_expired' }); return }

    const secret = process.env.PHONE_CODE_SECRET || (process.env.SUPABASE_SERVICE_ROLE_KEY || '')
    const checkHash = hashCode(phone, code, secret)
    const ok = String(checkHash) === String(row.code_hash)
    if (!ok) {
      try { await supabase.from('phone_verifications').update({ attempts_left: Math.max(0, Number(row.attempts_left || 0) - 1) }).eq('phone_e164', phone) } catch {}
      res.status(400).json({ error: 'invalid_code', attempts_left: Math.max(0, Number(row.attempts_left || 0) - 1) });
      return
    }

    // Update user (use tgId from request, fallback to tg_id stored with verification)
    const ownerTgId = tgId || (row?.tg_id ? String(row.tg_id) : null)
    const ownerUserId = userIdFromClient || (row?.user_id ? String(row.user_id) : null)
    let updated = false
    let debugInfo = null
    if (ownerUserId) {
      const { data: userById } = await supabase.from('users').select('id').eq('id', ownerUserId).maybeSingle()
      if (userById?.id) {
        const { error: updErr } = await supabase.from('users').update({ phone_number: phone }).eq('id', userById.id)
        const { data: readBack, error: readErr } = await supabase.from('users').select('id, phone_number').eq('id', userById.id).maybeSingle()
        try {
          const { data: prof } = await supabase.from('user_profile').select('user_id').eq('user_id', userById.id).maybeSingle()
          if (prof?.user_id) {
            await supabase.from('user_profile').update({ phone_number: phone }).eq('user_id', userById.id)
          } else {
            await supabase.from('user_profile').insert({
              user_id: userById.id,
              phone_number: phone,
              first_name: '',
              username: '',
              background_color: '#3280c2',
              background_icon: 'bg_icon_cat',
            })
          }
        } catch {}
        updated = !updErr
        if ((req.query||{}).debug === '1') debugInfo = { method: 'by_user_id', updErr: updErr?.message || null, readErr: readErr?.message || null, after: readBack }
      }
    } else if (ownerTgId) {
      const { data: user } = await supabase.from('users').select('id').eq('tg_id', String(ownerTgId)).maybeSingle()
      if (user?.id) {
        const { error: updErr } = await supabase.from('users').update({ phone_number: phone }).eq('id', user.id)
        const { data: readBack, error: readErr } = await supabase.from('users').select('id, phone_number').eq('id', user.id).maybeSingle()
        try {
          const { data: prof } = await supabase.from('user_profile').select('user_id').eq('user_id', user.id).maybeSingle()
          if (prof?.user_id) {
            await supabase.from('user_profile').update({ phone_number: phone }).eq('user_id', user.id)
          } else {
            await supabase.from('user_profile').insert({
              user_id: user.id,
              phone_number: phone,
              first_name: '',
              username: '',
              background_color: '#3280c2',
              background_icon: 'bg_icon_cat',
            })
          }
        } catch {}
        updated = !updErr
        if ((req.query||{}).debug === '1') debugInfo = { method: 'by_tg_id', updErr: updErr?.message || null, readErr: readErr?.message || null, after: readBack }
      }
    }

    // As a last resort, if still not updated and we have exactly one user with this phone in user_profile, sync it to users
    if (!updated) {
      try {
        const { data: cand } = await supabase.from('user_profile').select('user_id').eq('phone_number', phone).limit(2)
        if (Array.isArray(cand) && cand.length === 1 && cand[0]?.user_id) {
          const uid = cand[0].user_id
          const { error: updErr2 } = await supabase.from('users').update({ phone_number: phone, phone_verified_at: new Date().toISOString() }).eq('id', uid)
          if (!updErr2) updated = true
          if ((req.query||{}).debug === '1') (debugInfo ||= {}), (debugInfo.fallback_profile = { uid, err: updErr2?.message || null })
        }
      } catch {}
    }
    try { await supabase.from('phone_verifications').delete().eq('phone_e164', phone) } catch {}

    res.status(200).json({ ok: true, updated, debug: debugInfo })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}

function hashCode(phone, code, secret) {
  return crypto.createHmac('sha256', String(secret || 's')).update(`${phone}:${code}`).digest('hex')
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


