import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
if (!serviceKey) {
  const isProd = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  if (!isProd) {
    serviceKey = process.env.SUPABASE_ANON_KEY || '';
  }
}

function getClient() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase env');
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function applyLessonFinalize(payload) {
  const { user_id: userIdRaw, tg_id: tgIdRaw, lesson_id, perfect, minutes, seconds } = payload || {};
  const userId = userIdRaw ? String(userIdRaw) : null;
  const tgId = tgIdRaw ? String(tgIdRaw) : null;
  if (!userId && !tgId) {
    throw new Error('user_id_or_tg_id_required');
  }
  const supabase = getClient();

  const userRow = await loadUserRow(supabase, { userId, tgId });
  if (!userRow?.id) {
    throw new Error('user_not_found');
  }

  const streakResult = await finalizeStreak({
    supabase,
    userRow,
    lessonId: lesson_id,
    perfect: Boolean(perfect),
  });

  const questResult = await updateDailyQuests({
    supabase,
    userId: userRow.id,
    perfect: Boolean(perfect),
    minutes: Math.max(0, Number(minutes || 0)),
    seconds: Math.max(0, Math.min(59, Number(seconds || 0))),
  });

  return {
    ok: true,
    streak: streakResult,
    quests: questResult,
  };
}

async function loadUserRow(supabase, { userId, tgId }) {
  if (userId) {
    const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (data) return data;
  }
  if (tgId) {
    const { data } = await supabase.from('users').select('*').eq('tg_id', tgId).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function finalizeStreak({ supabase, userRow, lessonId, perfect }) {
  const now = new Date();
  const tz = userRow?.timezone || 'Europe/Moscow';
  const offsetMs = tz === 'Europe/Moscow' ? 3 * 60 * 60 * 1000 : 0;
  const localNow = new Date(now.getTime() + offsetMs);
  const todayIso = localNow.toISOString().slice(0, 10);
  const yesterdayIso = new Date(Date.parse(`${todayIso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

  // Check streak days
  const { data: todayRow } = await supabase
    .from('streak_days')
    .select('day, kind')
    .eq('user_id', userRow.id)
    .eq('day', todayIso)
    .maybeSingle();
  const hasToday = Boolean(todayRow && String(todayRow.kind || 'active') === 'active');

  const { data: yesterdayRow } = await supabase
    .from('streak_days')
    .select('day, kind')
    .eq('user_id', userRow.id)
    .eq('day', yesterdayIso)
    .maybeSingle();
  const hasYesterdayActive = yesterdayRow ? String(yesterdayRow.kind || 'active') === 'active' : false;
  const hasYesterdayFreeze = yesterdayRow ? String(yesterdayRow.kind || '') === 'freeze' : false;

  const resultBase = {
    ok: true,
    user_id: userRow.id,
    timezone: tz,
  };

  if (hasToday) {
    const update = await updateStreakCounters({
      supabase,
      userRow,
      increment: 0,
      perfectInc: perfect ? 1 : 0,
    });
    const completedLesson = lessonId ? await markLessonCompleted(supabase, userRow.id, lessonId) : null;
    return {
      ...resultBase,
      streak: update.streak,
      last_active_at: userRow.last_active_at || null,
      max_streak: update.max_streak,
      perfect_lessons: update.perfect_lessons,
      completed_lesson: completedLesson,
      debug: { todayIso, hasToday: true },
    };
  }

  const currentStreak = Number(userRow.streak || 0);
  let newStreak = 1;
  if (hasYesterdayActive || hasYesterdayFreeze) {
    newStreak = currentStreak + 1;
  }

  const update = await updateStreakCounters({
    supabase,
    userRow,
    increment: newStreak - currentStreak,
    perfectInc: perfect ? 1 : 0,
    todayIso,
  });

  const completedLesson = lessonId ? await markLessonCompleted(supabase, userRow.id, lessonId) : null;

  return {
    ...resultBase,
    streak: update.streak,
    last_active_at: update.last_active_at,
    max_streak: update.max_streak,
    perfect_lessons: update.perfect_lessons,
    completed_lesson: completedLesson,
    debug: { todayIso, hasToday: false, hasYesterdayActive, hasYesterdayFreeze, currentStreak, computed: newStreak },
  };
}

async function updateStreakCounters({ supabase, userRow, increment, perfectInc, todayIso }) {
  const prevMax = Number(userRow.max_streak || 0);
  const prevPerfect = Number(userRow.perfect_lessons || 0);
  const targetStreak = Math.max(1, Number(userRow.streak || 0) + increment);
  const nextMax = Math.max(prevMax, targetStreak);
  const nextPerfect = prevPerfect + (perfectInc ? 1 : 0);
  const lastActive = todayIso ? new Date(`${todayIso}T00:00:00.000Z`) : new Date(userRow.last_active_at || Date.now());

  const { data, error } = await supabase
    .from('users')
    .update({
      streak: targetStreak,
      last_active_at: todayIso ? lastActive.toISOString() : userRow.last_active_at,
      max_streak: nextMax,
      ...(perfectInc ? { perfect_lessons: nextPerfect } : {}),
    })
    .eq('id', userRow.id)
    .select('streak, last_active_at, max_streak, perfect_lessons')
    .single();
  if (error) {
    throw new Error(error.message);
  }

  if (todayIso) {
    await supabase
      .from('streak_days')
      .upsert({ user_id: userRow.id, day: todayIso, kind: 'active', timezone: userRow.timezone || 'Europe/Moscow' }, { onConflict: 'user_id,day' });
  }

  return {
    streak: Number(data?.streak ?? targetStreak),
    last_active_at: data?.last_active_at ?? userRow.last_active_at ?? null,
    max_streak: Number(data?.max_streak ?? nextMax),
    perfect_lessons: Number(data?.perfect_lessons ?? (perfectInc ? nextPerfect : prevPerfect)),
  };
}

async function updateDailyQuests({ supabase, userId, perfect, minutes, seconds }) {
  const dayIso = moscowIsoDay(new Date());
  const minutesStudied = minutes + seconds / 60;
  const inc = new Map();
  inc.set('lessons_finished', 1);
  if (perfect) inc.set('perfect_lessons', 1);
  if (minutesStudied > 0) inc.set('minutes_studied', minutesStudied);

  if (inc.size === 0) {
    return { day: dayIso, updated: [] };
  }

  // Update user_daily_metrics
  const metricPayload = {
    lessons_finished: inc.get('lessons_finished') || 0,
    perfect_lessons: inc.get('perfect_lessons') || 0,
    minutes_studied: inc.get('minutes_studied') || 0,
  };
  if (metricPayload.lessons_finished || metricPayload.perfect_lessons || metricPayload.minutes_studied) {
    const { data: cur } = await supabase
      .from('user_daily_metrics')
      .select('lessons_finished, perfect_lessons, minutes_studied')
      .eq('user_id', userId)
      .eq('day', dayIso)
      .maybeSingle();
    const next = {
      user_id: userId,
      day: dayIso,
      lessons_finished: Number(cur?.lessons_finished || 0) + metricPayload.lessons_finished,
      perfect_lessons: Number(cur?.perfect_lessons || 0) + metricPayload.perfect_lessons,
      minutes_studied: Number(cur?.minutes_studied || 0) + metricPayload.minutes_studied,
    };
    await supabase.from('user_daily_metrics').upsert(next, { onConflict: 'user_id,day' });
  }

  const { data: dayRow } = await supabase
    .from('daily_quests_day')
    .select('day, easy_code, medium_code, hard_code')
    .eq('day', dayIso)
    .maybeSingle();
  if (!dayRow) return { day: dayIso, updated: [] };

  const codes = [dayRow.easy_code, dayRow.medium_code, dayRow.hard_code].filter(Boolean);
  const { data: templates } = await supabase
    .from('daily_quest_templates')
    .select('code, metric_key, target')
    .in('code', codes);

  const updated = [];
  for (const tpl of templates || []) {
    const key = String(tpl.metric_key);
    const value = Number(inc.get(key) || 0);
    if (!value) continue;
    const existingQuery = await supabase
      .from('user_daily_quest_progress')
      .select('progress, target, status')
      .eq('user_id', userId)
      .eq('day', dayIso)
      .eq('code', tpl.code)
      .maybeSingle();
    const existing = existingQuery?.data;

    if (key === 'minutes_studied') {
      const prevSec = Math.max(0, Number(existing?.progress || 0));
      const incSec = Math.round(value * 60);
      const targetSec = Number(existing?.target || tpl.target || 60);
      const nextSec = Math.min(targetSec, prevSec + incSec);
      const completed = nextSec >= targetSec;
      const status = completed ? 'completed' : (existing?.status || 'in_progress');
      const up = {
        user_id: userId,
        day: dayIso,
        code: tpl.code,
        progress: nextSec,
        target: targetSec,
        status,
        ...(completed && !existing?.completed_at ? { completed_at: new Date().toISOString() } : {}),
      };
      const { data: wrote } = await supabase
        .from('user_daily_quest_progress')
        .upsert(up, { onConflict: 'user_id,day,code' })
        .select('code, progress, target, status, completed_at')
        .single();
      if (wrote) updated.push({ ...wrote, metric_key: key, seconds_partial: nextSec % 60 });
    } else {
      const prev = Number(existing?.progress || 0);
      const target = Number(existing?.target || tpl.target || 1);
      const next = Math.min(target, prev + value);
      const completed = next >= target;
      const status = completed ? 'completed' : (existing?.status || 'in_progress');
      const up = {
        user_id: userId,
        day: dayIso,
        code: tpl.code,
        progress: next,
        target,
        status,
        ...(completed && !existing?.completed_at ? { completed_at: new Date().toISOString() } : {}),
      };
      const { data: wrote } = await supabase
        .from('user_daily_quest_progress')
        .upsert(up, { onConflict: 'user_id,day,code' })
        .select('code, progress, target, status, completed_at')
        .single();
      if (wrote) updated.push({ ...wrote, metric_key: key });
    }
  }

  return { day: dayIso, updated };
}

async function markLessonCompleted(supabase, userId, lessonId) {
  if (!userId || !lessonId) return null;
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, topic_id')
    .eq('id', lessonId)
    .maybeSingle();
  if (!lesson?.id || !lesson?.topic_id) return null;
  const { data: topic } = await supabase
    .from('topics')
    .select('id, subject_id')
    .eq('id', lesson.topic_id)
    .maybeSingle();
  const subjectId = topic?.subject_id;
  if (!subjectId) return null;
  const payload = {
    user_id: userId,
    lesson_id: lesson.id,
    topic_id: lesson.topic_id,
    subject_id: subjectId,
    completed_at: new Date().toISOString(),
  };
  await supabase.from('lesson_progress').upsert(payload, { onConflict: 'user_id,lesson_id' });
  return payload;
}

function moscowIsoDay(date) {
  const tz = 'Europe/Moscow';
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === 'year')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'month')?.value || 0);
  const d = Number(parts.find((p) => p.type === 'day')?.value || 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}


