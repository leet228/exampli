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

  const [friendsListRaw, invites, subjectsAll, topicsOnly, lessonsByTopic] = await Promise.all([
      supabase.rpc('rpc_friend_list', { caller: userId }).then(({ data, error }) => (!error && Array.isArray(data) ? data : [])),
      supabase.rpc('rpc_friend_incoming', { caller: userId }).then(({ data, error }) => (!error && Array.isArray(data) ? data : [])),
      supabase.from('subjects').select('id,code,title,level').order('level', { ascending: true }).order('title', { ascending: true }).then(({ data }) => data || []),
    fetchTopics(supabase, activeId),
    fetchLessonsByTopic(supabase, activeId),
    ]);

    // Try server RPC that already returns streaks/avatars; fallback to manual enrichment
    let friendsList = Array.isArray(friendsListRaw) ? friendsListRaw : [];
    let usedRpc = false;
    try {
      const rpc = await supabase.rpc('rpc_friend_streaks', { caller: userId });
      if (!rpc.error && Array.isArray(rpc.data)) {
        friendsList = (rpc.data || []).map((row) => ({
          user_id: String(row.user_id || row.friend_id || row.a_id || row.b_id || ''),
          first_name: row.first_name ?? null,
          username: row.username ?? null,
          background_color: row.background_color ?? null,
          background_icon: row.background_icon ?? null,
          avatar_url: row.avatar_url ?? null,
          streak: Number(row.streak ?? 0),
          coins: Number(row.coins ?? 0),
        }));
        usedRpc = true;
      }
    } catch {}

    if (!usedRpc) {
      try {
        const ids = Array.from(new Set(friendsList.map(r => r.user_id || r.friend_id || r.a_id || r.b_id).filter(Boolean)));
        if (ids.length) {
          const { data: usersRows } = await supabase
            .from('users')
            .select('id, streak, coins, avatar_url')
            .in('id', ids);
          const byId = new Map((usersRows || []).map(u => [String(u.id), u]));
          friendsList = friendsList.map((p) => {
            const uid = String(p.user_id || p.friend_id || p.a_id || p.b_id || '');
            const u = byId.get(uid) || {};
            return { ...p, user_id: uid, streak: Number(u?.streak ?? 0), coins: Number(u?.coins ?? 0), avatar_url: p?.avatar_url ?? u?.avatar_url ?? null };
          });
        }
      } catch {}
    }

    res.status(200).json({ friends: friendsList, invites, subjectsAll, topicsBySubject: topicsOnly.topicsBySubject, lessonsByTopic });
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

async function fetchLessonsByTopic(supabase, subjectId) {
  const map = {};
  if (!subjectId) return map;
  // Получаем все темы, затем одним запросом — все их уроки
  const { data: topics } = await supabase
    .from('topics')
    .select('id')
    .eq('subject_id', subjectId);
  const ids = (topics || []).map(t => t.id);
  if (!ids.length) return map;
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, topic_id, order_index')
    .in('topic_id', ids)
    .order('topic_id', { ascending: true })
    .order('order_index', { ascending: true });
  (lessons || []).forEach((l) => {
    const tid = String(l.topic_id);
    if (!map[tid]) map[tid] = [];
    map[tid].push({ id: l.id, topic_id: l.topic_id, order_index: l.order_index });
  });
  return map;
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


