// ESM serverless function: Roll three daily quests (MSK midnight)
// Picks one active template per difficulty: easy, medium, hard
// Idempotent for a given MSK day: uses upsert on daily_quests_day(day)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'env_missing' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const todayIsoMsk = moscowIsoDay(new Date());
    // Полный ресет перед новым днём: чистим глобальный выбор и прогресс пользователей
    // 1) Удаляем все строки выбора дня (перестрахуемся фильтром по day)
    try {
      const del1 = await supabase.from('daily_quests_day').delete().gte('day', '0001-01-01').select('day');
      // del1.data length = кол-во удалённых записей
    } catch {}
    // 2) Удаляем весь пользовательский прогресс за прошлые дни
    try {
      const del2 = await supabase.from('user_daily_quest_progress').delete().gte('day', '0001-01-01').select('user_id');
    } catch {}

    // Load active templates
    const { data: templates, error: tErr } = await supabase
      .from('daily_quest_templates')
      .select('code, difficulty')
      .eq('active', true);
    if (tErr) { res.status(500).json({ error: 'templates_query_failed', detail: tErr.message }); return; }
    const list = Array.isArray(templates) ? templates : [];
    const easy = list.filter((t) => String(t.difficulty) === 'easy');
    const medium = list.filter((t) => String(t.difficulty) === 'medium');
    const hard = list.filter((t) => String(t.difficulty) === 'hard');

    const easyPick = pickOne(easy)?.code || 'lessons_1';
    const medPick = pickOne(medium)?.code || 'lessons_2';
    const hardPick = pickOne(hard)?.code || 'perfect_1';

    const row = { day: todayIsoMsk, easy_code: easyPick, medium_code: medPick, hard_code: hardPick };
    const { data: wrote, error: wErr } = await supabase
      .from('daily_quests_day')
      .upsert(row, { onConflict: 'day' })
      .select('day, easy_code, medium_code, hard_code')
      .single();
    if (wErr) { res.status(500).json({ error: 'upsert_failed', detail: wErr.message }); return; }

    res.status(200).json({ ok: true, day: todayIsoMsk, picked: wrote });
  } catch (e) {
    res.status(500).json({ error: 'internal_error', detail: String(e?.message || e) });
  }
}

function pickOne(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

function moscowIsoDay(d) {
  const tz = 'Europe/Moscow';
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === 'year')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'month')?.value || 0);
  const day = Number(parts.find((p) => p.type === 'day')?.value || 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function safeUrl(u) { try { return new URL(u || '/', 'http://localhost'); } catch { return new URL('http://localhost'); } }


