// ESM serverless function: count online users (last 5 minutes)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'Missing Supabase env' }); return; }
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    // 1) быстрый путь по таблице app_presence с expires_at
    const { count, error } = await supabase
      .from('app_presence')
      .select('user_id', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());
    if (!error && typeof count === 'number') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ online: count, window: 5 * 60 });
      return;
    }

    // 2) fallback по users.last_active_at (менее точно)
    const { count: c2 } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('last_active_at', fiveMinAgo);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ online: c2 || 0, window: 5 * 60 });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'online error' });
  }
}


