import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE
    if (!url || !serviceKey) { res.status(500).json({ error: 'supabase_env_missing' }); return }
    const supabase = createClient(url, serviceKey)

    const t0 = Date.now()
    const { count: anyCount, error: e1 } = await supabase.from('users').select('*', { count: 'exact', head: true })
    const dbPingMs = Date.now() - t0
    if (e1) { res.status(500).json({ error: e1.message }); return }

    // small read latency (1 row)
    let readLatencyMs = null
    try {
      const r0 = Date.now()
      await supabase.from('users').select('id').limit(1)
      readLatencyMs = Date.now() - r0
    } catch {}

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: new24h } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo)
    const { count: new7d } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo)

    let buckets = []
    try {
      const r = await supabase.storage.listBuckets()
      buckets = (r?.data || []).map(b => ({ name: b.name, public: b.public, created_at: b.created_at }))
    } catch {}

    // Storage throughput test (128KB)
    let storageTest = { uploadMs: null, downloadMs: null, sizeBytes: 131072 }
    try {
      const bucket = 'admin-health'
      // ensure bucket
      try { await supabase.storage.createBucket(bucket, { public: false }) } catch {}
      const path = `probe/${Date.now()}-${Math.random().toString(36).slice(2)}.bin`
      const arr = new Uint8Array(storageTest.sizeBytes)
      crypto.getRandomValues?.(arr)
      const file = new Blob([arr], { type: 'application/octet-stream' })
      const u0 = Date.now()
      const up = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: 'application/octet-stream' })
      storageTest.uploadMs = Date.now() - u0
      if (!up.error) {
        const d0 = Date.now()
        await supabase.storage.from(bucket).download(path)
        storageTest.downloadMs = Date.now() - d0
        // cleanup
        try { await supabase.storage.from(bucket).remove([path]) } catch {}
      }
    } catch {}

    res.status(200).json({
      new24h: new24h || 0,
      new7d: new7d || 0,
      storage: { buckets },
      dbPingMs,
      readLatencyMs,
      storageTest,
    })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'db_overview error' })
  }
}


