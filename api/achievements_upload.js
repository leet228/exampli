// Serverless endpoint to upload pre-rendered achievement PNGs with service role key (bypasses Storage RLS)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ ok: false, error: 'Missing Supabase env' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const userId = body?.user_id ? String(body.user_id) : '';
    const files = Array.isArray(body?.files) ? body.files : [];
    const bucket = String(body?.bucket || process.env.ACHIEVEMENTS_BUCKET || 'ai-uploads');
    if (!userId || !files.length) { res.status(400).json({ ok: false, error: 'user_id_and_files_required' }); return; }

    const results = {};
    for (const f of files) {
      try {
        const filename = String(f?.filename || '').trim();
        const contentType = String(f?.contentType || 'image/png');
        const b64 = String(f?.data || '');
        if (!filename || !b64) continue;
        const path = `achievements/${userId}/${filename}`;
        const buffer = Buffer.from(b64, 'base64');
        const { error: upErr } = await supabase.storage.from(bucket).upload(path, buffer, { upsert: true, cacheControl: '3600', contentType });
        if (upErr) { results[filename] = { ok: false, error: upErr.message }; continue; }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        results[filename] = { ok: true, url: data?.publicUrl || null };
      } catch (e) {
        results[(f && f.filename) || ''] = { ok: false, error: String(e?.message || e) };
      }
    }
    res.status(200).json({ ok: true, results });
  } catch (e) {
    try { console.error('[api/achievements_upload] error', e); } catch {}
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
}

async function safeJson(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let body = '';
    req.on?.('data', (c) => { body += c; });
    req.on?.('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on?.('error', () => resolve({}));
  });
}


