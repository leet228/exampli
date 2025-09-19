// ESM serverless function for Vercel: Aggregated BOOT STEP 2 (background)
// Returns heavy/secondary data in one server call
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      res.status(500).json({ error: 'Missing Supabase env' });
      return;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await safeJson(req);
    const userId = body?.user_id || null;
    const activeId = body?.active_id || null;

    if (!userId) {
      res.status(200).json({
        friends: [],
        invites: [],
        subjectsAll: [],
        topicsBySubject: {},
      });
      return;
    }

    const [friendsList, invites, subjectsAll, topicsOnly] = await Promise.all([
      supabase.rpc('rpc_friend_list', { caller: userId }).then(({ data, error }) => (!error && Array.isArray(data) ? data : [])),
      supabase.rpc('rpc_friend_incoming', { caller: userId }).then(({ data, error }) => (!error && Array.isArray(data) ? data : [])),
      supabase.from('subjects').select('id,code,title,level').order('level', { ascending: true }).order('title', { ascending: true }).then(({ data }) => data || []),
      fetchTopics(supabase, activeId),
    ]);

    res.status(200).json({
      friends: friendsList,
      invites,
      subjectsAll,
      topicsBySubject: topicsOnly.topicsBySubject,
    });
  } catch (e) {
    console.error('[api/boot2] error', e);
    res.status(500).json({ error: 'Internal error' });
  }
}

async function fetchTopics(supabase, subjectId) {
  const topicsBySubject = {};
  if (!subjectId) return { topicsBySubject };
  const { data: topics } = await supabase
    .from('topics')
    .select('id, subject_id, title, order_index')
    .eq('subject_id', subjectId)
    .order('order_index', { ascending: true });
  const tlist = topics || [];
  if (tlist.length) topicsBySubject[String(subjectId)] = tlist;
  return { topicsBySubject };
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


