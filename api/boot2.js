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

  const [friendsListRaw, invites, subjectsAll, topicsOnly, lessonsByTopic, streakDaysAll, friendsStats] = await Promise.all([
      supabase.rpc('rpc_friend_list', { caller: userId }).then(({ data, error }) => (!error && Array.isArray(data) ? data : [])),
      supabase.rpc('rpc_friend_incoming', { caller: userId }).then(({ data, error }) => (!error && Array.isArray(data) ? data : [])),
      supabase.from('subjects').select('id,code,title,level').order('level', { ascending: true }).order('title', { ascending: true }).then(({ data }) => data || []),
    fetchTopics(supabase, activeId),
    fetchLessonsByTopic(supabase, activeId),
    fetchAllStreakDays(supabase, userId),
    fetchFriendsStats(supabase, userId),
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

    // Merge extended stats from friendsStats map (users table: max_streak, perfect_lessons, duel_wins, added_course, plus_until)
    try {
      const statsMap = friendsStats || {};
      friendsList = (friendsList || []).map((f) => {
        const s = statsMap[String(f.user_id)] || {};
        return {
          ...f,
          plus_until: s?.plus_until ?? null,
          max_streak: Number(s?.max_streak ?? 0),
          perfect_lessons: Number(s?.perfect_lessons ?? 0),
          duel_wins: Number(s?.duel_wins ?? 0),
          added_course: s?.added_course ?? null,
        };
      });
    } catch {}

    // Compute friends_count for each friend in one query
    try {
      const ids = Array.from(new Set((friendsList || []).map(r => r.user_id).filter(Boolean)));
      if (ids.length) {
        const { data: links } = await supabase
          .from('friend_links')
          .select('a_id,b_id,status')
          .eq('status', 'accepted')
          .or(ids.map(id => `a_id.eq.${id}`).concat(ids.map(id => `b_id.eq.${id}`)).join(','));
        const countMap = new Map();
        (links || []).forEach((l) => {
          const a = String(l.a_id || '');
          const b = String(l.b_id || '');
          if (ids.includes(a)) countMap.set(a, (countMap.get(a) || 0) + 1);
          if (ids.includes(b)) countMap.set(b, (countMap.get(b) || 0) + 1);
        });
        friendsList = friendsList.map((f) => ({ ...f, friends_count: Number(countMap.get(String(f.user_id)) || 0) }));
      }
    } catch {}

    // Attach course_code/title for each friend using subjectsAll
    try {
      const subjById = new Map((subjectsAll || []).map((s) => [String(s.id), s]));
      friendsList = friendsList.map((f) => {
        const sid = f?.added_course != null ? String(f.added_course) : null;
        const subj = sid ? subjById.get(sid) : null;
        return { ...f, course_code: subj?.code ?? null, course_title: subj?.title ?? null };
      });
    } catch {}

    // Дополнительно проложим added_course/метрики в friendsList из friendsStats
    try {
      const keys = ['streak','coins','avatar_url','plus_until','max_streak','perfect_lessons','duel_wins','added_course'];
      if (friendsList && friendsStats && typeof friendsStats === 'object') {
        friendsList = friendsList.map((f) => {
          const st = (friendsStats || {})[String(f.user_id)] || {};
          const extra = {};
          for (const k of keys) if (st[k] !== undefined) extra[k] = st[k];
          return { ...f, ...extra };
        });
      }
    } catch {}
    res.status(200).json({ friends: friendsList, invites, subjectsAll, topicsBySubject: topicsOnly.topicsBySubject, lessonsByTopic, streakDaysAll, friendsStats });
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

async function fetchAllStreakDays(supabase, userId) {
  try {
    const { data } = await supabase
      .from('streak_days')
      .select('day, kind')
      .eq('user_id', userId)
      .order('day', { ascending: true });
    return (data || []).map(r => ({ day: String(r.day), kind: String(r.kind || 'active') }));
  } catch {
    return [];
  }
}

async function fetchFriendsStats(supabase, userId) {
  try {
    // Собираем всех друзей и тянем их ключевые поля (streak, coins, avatar_url, plus_until, max_streak, perfect_lessons, duel_wins)
    const { data: links } = await supabase
      .from('friend_links')
      .select('a_id,b_id,status')
      .eq('status', 'accepted')
      .or(`a_id.eq.${userId},b_id.eq.${userId}`);
    const ids = Array.from(new Set((links || []).map(l => (l.a_id === userId ? l.b_id : l.a_id)).filter(Boolean)));
    if (!ids.length) return {};
    const { data: users } = await supabase
      .from('users')
      .select('id, streak, coins, avatar_url, plus_until, max_streak, perfect_lessons, duel_wins, added_course')
      .in('id', ids);
    const map = {};
    (users || []).forEach(u => { map[String(u.id)] = u; });
    return map;
  } catch {
    return {};
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


