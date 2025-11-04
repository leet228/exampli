import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env' }); return }
    const supabase = createClient(supabaseUrl, serviceKey)
    const url = new URL(req?.url || '/', 'http://localhost')
    const from = Math.max(0, parseInt(String(url.searchParams.get('from') || '0')) || 0)
    const to = Math.max(from, parseInt(String(url.searchParams.get('to') || '9')) || 9)
    const { data, error } = await supabase
      .from('bug_reports')
      .select('id, created_at, tg_id, text, images')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) { res.status(500).json({ error: error.message }); return }
    res.status(200).json({ ok: true, rows: data || [] })
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) })
  }
}


