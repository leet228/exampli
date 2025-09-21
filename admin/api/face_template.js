import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }
  try {
    const { template } = req.body || {}
    if (!Array.isArray(template)) {
      res.status(400).json({ error: 'template[] required' })
      return
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE
    if (!url || !serviceKey) {
      res.status(500).json({ error: 'Supabase env not configured' })
      return
    }
    const supabase = createClient(url, serviceKey)

    // Ensure bucket exists
    const bucket = 'face-templates'
    // Храним единственный эталон (глобально)
    const path = `templates/master.json`
    let upload = await supabase.storage.from(bucket).upload(path, JSON.stringify({ v: 1, updated_at: new Date().toISOString(), template }), { upsert: true, contentType: 'application/json' })
    if (upload.error && /not found/i.test(upload.error.message || '')) {
      await supabase.storage.createBucket(bucket, { public: false })
      upload = await supabase.storage.from(bucket).upload(path, JSON.stringify({ v: 1, updated_at: new Date().toISOString(), template }), { upsert: true, contentType: 'application/json' })
    }
    if (upload.error) {
      res.status(500).json({ error: upload.error.message })
      return
    }
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}

