// ESM serverless function for Vercel: Aggregated BOOT STEP 1 (critical path)
// Returns minimal data required for first render in one server call
import { createClient } from '@supabase/supabase-js';
import { kvAvailable, cacheGetJSON, cacheSetJSON, rateLimit } from './_kv.mjs';

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

    // Soft rate limit per IP (pre-user) — защита от бурста
    try {
      const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();
      if (ip && kvAvailable()) {
        const rl = await rateLimit({ key: `boot1:ip:${ip}`, limit: 60, windowSeconds: 60 });
        if (!rl.ok) { res.status(429).json({ error: 'rate_limited' }); return; }
      }
    } catch {}

    const body = await safeJson(req);
    const tgUser = body?.tg_user || null; // { id, username, first_name, last_name, photo_url }
    const startParam = body?.start_param || null;
    const activeCodeFromClient = body?.active_code || null;

    if (!tgUser?.id) {
      // guest path
      res.status(200).json({
        user: null,
        stats: { streak: 0, energy: 25, coins: 500 },
        userProfile: { background_color: '#3280c2', background_icon: 'nothing', phone_number: null, first_name: null, username: null },
        subjects: [],
        lessons: [],
        onboarding: { phone_given: false, course_taken: false },
        friendsCount: 0,
        invite_token: startParam || null,
      });
      return;
    }

    // ensure user
    const { data: userRowExisting } = await supabase.from('users').select('*').eq('tg_id', String(tgUser.id)).maybeSingle();
    let userRow = userRowExisting;
    if (!userRow) {
      const timezone = tryTimezone();
      const { data: created } = await supabase.from('users').upsert({
        tg_id: String(tgUser.id),
        username: tgUser.username,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        avatar_url: tgUser.photo_url ?? null,
        timezone,
        energy: 25,
        coins: 500,
        ai_plus_until: null,
      }, { onConflict: 'tg_id' }).select('*').single();
      userRow = created;
      if (userRow?.id) {
        await supabase.from('user_profile').upsert({
          user_id: userRow.id,
          first_name: tgUser.first_name ?? null,
          username: tgUser.username ?? null,
          phone_number: null,
          background_color: '#3280c2',
          background_icon: 'bg_icon_cat',
        }, { onConflict: 'user_id' });
      }
    } else {
      // lightweight avatar update if changed
      if (tgUser.photo_url && userRow.avatar_url !== tgUser.photo_url) {
        await supabase.from('users').update({ avatar_url: tgUser.photo_url }).eq('id', userRow.id);
        userRow.avatar_url = tgUser.photo_url;
      }
      // ensure user_profile exists
      const { data: prof } = await supabase.from('user_profile').select('user_id').eq('user_id', userRow.id).maybeSingle();
      if (!prof?.user_id) {
        await supabase.from('user_profile').insert({
          user_id: userRow.id,
          first_name: tgUser.first_name ?? null,
          username: tgUser.username ?? null,
          phone_number: userRow.phone_number ?? null,
          background_color: '#3280c2',
          background_icon: 'bg_icon_cat',
        });
      }
    }

    // read aggregated data via single RPC (with graceful fallback)
    let profData = null;
    let friendsCnt = 0;
    let subjectAndLessons = { active_id: null, active_code: null, subject: null, lessons: [] };
    let lessonProgress = [];
    let chosenSubjects = [];
    try {
      // per-user short cache (15-60s)
      let pack = null;
      const cacheKey = `boot_all:v1:u:${userRow.id}:ac:${activeCodeFromClient || '-'}`;
      if (kvAvailable()) {
        pack = await cacheGetJSON(cacheKey);
      }
      if (!pack) {
        const rpc = await supabase.rpc('rpc_boot_all', { p_user_id: userRow.id, p_active_code: activeCodeFromClient });
        if (rpc.error) throw rpc.error;
        pack = Array.isArray(rpc.data) ? (rpc.data[0] || {}) : (rpc.data || {});
        if (kvAvailable()) { try { await cacheSetJSON(cacheKey, pack, 45); } catch {} }
        // additionally seed long-lived caches for static catalogs
        try {
          if (kvAvailable()) {
            if (Array.isArray(pack.subjectsAll) && pack.subjectsAll.length) {
              await cacheSetJSON('subjectsAll:v1', pack.subjectsAll, 60 * 60 * 24 * 7);
            }
            const topicsBy = pack.topicsBySubject || {};
            for (const sid of Object.keys(topicsBy)) {
              await cacheSetJSON(`topicsBySubject:v1:${sid}`, topicsBy[sid], 60 * 60 * 24 * 7);
            }
            const lessonsBy = pack.lessonsByTopic || {};
            for (const tid of Object.keys(lessonsBy)) {
              await cacheSetJSON(`lessonsByTopic:v1:${tid}`, lessonsBy[tid], 60 * 60 * 24 * 7);
            }
          }
        } catch {}
      }
      const d = pack || {};
      profData = d.profile || null;
      friendsCnt = Number(d.friends_count || 0);
      subjectAndLessons = {
        active_id: d.active_id || null,
        active_code: d.active_code || null,
        subject: d.subject || null,
        lessons: d.lessons || [],
      };
      const arrChosen = Array.isArray(d.chosen_subjects) ? d.chosen_subjects : [];
      if (arrChosen.length) chosenSubjects = arrChosen;
    } catch (e) {
      // Fallback: previous 3 queries if RPC is unavailable
      const arr = await Promise.all([
        supabase.from('user_profile').select('background_color, background_icon, phone_number, first_name, username').eq('user_id', userRow.id).single(),
        supabase.rpc('rpc_friend_count', { caller: userRow.id }).then(r => ({ data: !r.error ? Number(r.data || 0) : 0 })),
        fetchActiveSubjectAndLessons(supabase, userRow, activeCodeFromClient),
      ]);
      profData = arr[0]?.data || null;
      friendsCnt = Number(arr[1]?.data || 0);
      subjectAndLessons = arr[2] || { active_id: null, active_code: null, subject: null, lessons: [] };
      // fallback: выбранные курсы из таблицы chosen_courses (если есть и если активен PLUS)
      const plusActiveFallback = (() => {
        try { return Boolean(userRow?.plus_until && new Date(String(userRow.plus_until)).getTime() > Date.now()); } catch { return false; }
      })();
      if (plusActiveFallback) {
        try {
          const { data: chosen } = await supabase
            .from('chosen_courses')
            .select('subject_id')
            .eq('user_id', userRow.id)
            .limit(4);
          const ids = Array.isArray(chosen) ? chosen.map(r => r.subject_id).filter(Boolean) : [];
          if (ids.length) {
            const { data: subs } = await supabase
              .from('subjects')
              .select('id,code,title,level')
              .in('id', ids);
            const byId = new Map((subs || []).map(s => [String(s.id), s]));
            chosenSubjects = ids.map(id => byId.get(String(id))).filter(Boolean);
          }
        } catch {}
      }
    }

    try {
      const rpc1 = await supabase.rpc('rpc_boot1', { p_user_id: userRow.id, p_active_code: activeCodeFromClient });
      if (!rpc1.error) {
        const base = Array.isArray(rpc1.data) ? (rpc1.data[0] || {}) : (rpc1.data || {});
        if (Array.isArray(base.lesson_progress)) {
          lessonProgress = base.lesson_progress;
        }
        if ((!subjectAndLessons.lessons || subjectAndLessons.lessons.length === 0) && Array.isArray(base.lessons)) {
          subjectAndLessons = {
            ...subjectAndLessons,
            lessons: base.lessons,
          };
        }
      }
    } catch {}

    const activeSubjectId = (() => {
      const subj = subjectAndLessons?.subject;
      if (subj && typeof subj === 'object' && subj.id) return String(subj.id);
      if (subjectAndLessons?.active_id) return String(subjectAndLessons.active_id);
      if (userRow?.added_course) return String(userRow.added_course);
      return null;
    })();

    if (activeSubjectId && lessonProgress.length) {
      lessonProgress = lessonProgress.filter((entry) => entry && String(entry.subject_id || '') === activeSubjectId);
    }

    if (activeSubjectId && lessonProgress.length === 0) {
      try {
        const { data } = await supabase
          .from('lesson_progress')
          .select('lesson_id, topic_id, subject_id, completed_at')
          .eq('user_id', userRow.id)
          .eq('subject_id', activeSubjectId);
        if (Array.isArray(data)) {
          lessonProgress = data;
        }
      } catch {}
    } else if (!activeSubjectId) {
      lessonProgress = [];
    }

    const userProfile = profData || { background_color: '#3280c2', background_icon: 'nothing', phone_number: userRow.phone_number ?? null, first_name: null, username: null };
    // Синхронизируем phone_number из профиля в users, чтобы клиентская логика видела номер в users
    try {
      const mergedPhone = userProfile?.phone_number ?? userRow.phone_number ?? null;
      if (mergedPhone && !userRow.phone_number) {
        await supabase.from('users').update({ phone_number: mergedPhone }).eq('id', userRow.id);
        userRow.phone_number = mergedPhone;
      }
    } catch {}

    // Логику пересчёта стрика на boot убрали: теперь сброс делает крон /api/streak/reset по МСК

    const onboarding = {
      phone_given: !!(userProfile?.phone_number || userRow.phone_number),
      course_taken: true,
    };

    // last streak day теперь возвращает rpc_boot_all, но оставим фоллбек через null
    const lastStreakDay = null;

    res.status(200).json({
      user: userRow,
      stats: { streak: userRow.streak ?? 0, energy: userRow.energy ?? 25, coins: userRow.coins ?? 500, plus_until: userRow.plus_until ?? null, frosts: userRow.frosts ?? 0 },
      userProfile,
      friendsCount: friendsCnt ?? 0,
      avatar_url: userRow.avatar_url ?? null,
      subjects: (chosenSubjects && chosenSubjects.length) ? chosenSubjects : (subjectAndLessons.subject ? [subjectAndLessons.subject] : []),
      lessons: subjectAndLessons.lessons || [],
      active_code: subjectAndLessons.active_code || null,
      active_id: subjectAndLessons.active_id || null,
      lesson_progress: lessonProgress,
      onboarding,
      invite_token: startParam || null,
      last_streak_day: lastStreakDay,
    });
  } catch (e) {
    console.error('[api/boot1] error', e);
    res.status(500).json({ error: 'Internal error' });
  }
}

function tryTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

async function fetchActiveSubjectAndLessons(supabase, userRow, activeCodeFromClient) {
  // resolve active subject: users.added_course or client hint by code
  let activeId = userRow?.added_course ? Number(userRow.added_course) : null;
  let subject = null;
  if (!activeId && activeCodeFromClient) {
    const { data: subjByCode } = await supabase.from('subjects').select('id,code,title,level').eq('code', activeCodeFromClient).maybeSingle();
    if (subjByCode?.id) activeId = subjByCode.id;
    subject = subjByCode || null;
  }
  if (activeId && !subject) {
    const { data: subj } = await supabase.from('subjects').select('id,code,title,level').eq('id', activeId).single();
    subject = subj || null;
  }
  // lessons are per topic now; take current_topic if exists
  let lessons = [];
  if (subject?.id) {
    const currentTopicId = userRow?.current_topic || null;
    if (currentTopicId) {
      const { data: rows } = await supabase
        .from('lessons')
        .select('id, topic_id, order_index')
        .eq('topic_id', currentTopicId)
        .order('order_index', { ascending: true })
        .limit(50);
      lessons = (rows || []).map(l => ({ id: l.id, topic_id: l.topic_id, order_index: l.order_index }));
    } else {
      lessons = [];
    }
  }
  return { active_id: subject?.id ?? null, active_code: subject?.code ?? null, subject, lessons };
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


