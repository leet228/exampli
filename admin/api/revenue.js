// ESM serverless function: Admin revenue snapshot from paymentsdd
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(204).end(); return }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY
    if (!url || !key) { res.status(500).json({ error: 'supabase_env_missing' }); return }
    const supabase = createClient(url, key)

    const { data, error } = await supabase
      .from('payments')
      .select('id,user_id,type,product_id,amount_rub,currency,status,test,created_at,captured_at')
      .order('captured_at', { ascending: false })
      .limit(1000)
    if (error) { res.status(500).json({ error: error.message }); return }

    res.status(200).json({ ok: true, rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}


