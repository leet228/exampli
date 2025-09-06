// ESM serverless function for Vercel: Aggregated BOOT STEP 1 (critical path)
// Returns minimal data required for first render in one server call
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
        onboarding: { phone_given: false, course_taken: false, boarding_finished: false },
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

    // read minimal profile
    const [{ data: profData }, { data: friendsCnt }, subjectAndLessons] = await Promise.all([
      supabase.from('user_profile').select('background_color, background_icon, phone_number, first_name, username').eq('user_id', userRow.id).single(),
      supabase.rpc('rpc_friend_count', { caller: userRow.id }).then(r => ({ data: !r.error ? Number(r.data || 0) : 0 })),
      fetchActiveSubjectAndLessons(supabase, userRow, activeCodeFromClient),
    ]);

    const userProfile = profData || { background_color: '#3280c2', background_icon: 'nothing', phone_number: userRow.phone_number ?? null, first_name: null, username: null };

    const onboarding = {
      phone_given: !!userRow.phone_number,
      course_taken: true,
      boarding_finished: !!userRow.phone_number,
    };

    res.status(200).json({
      user: userRow,
      stats: { streak: userRow.streak ?? 0, energy: userRow.energy ?? 25, coins: userRow.coins ?? 500 },
      userProfile,
      friendsCount: friendsCnt ?? 0,
      avatar_url: userRow.avatar_url ?? null,
      subjects: subjectAndLessons.subject ? [subjectAndLessons.subject] : [],
      lessons: subjectAndLessons.lessons || [],
      active_code: subjectAndLessons.active_code || null,
      active_id: subjectAndLessons.active_id || null,
      onboarding,
      invite_token: startParam || null,
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
  let lessons = [];
  if (subject?.id) {
    const { data: rows } = await supabase
      .from('lessons')
      .select('id, title')
      .eq('subject_id', subject.id)
      .order('order_index', { ascending: true })
      .limit(12);
    lessons = (rows || []).map(l => ({ id: l.id, title: l.title, subject: { title: subject.title, level: subject.level || null } }));
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


