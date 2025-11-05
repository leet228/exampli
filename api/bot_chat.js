// ESM serverless function: Telegram bot dialog using OpenAI (gpt-5-mini)
// Env: ASSISTANT_API_KEY, TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or ANON)
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

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const openaiKey = process.env.ASSISTANT_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!botToken || !supabaseUrl || !serviceKey) {
      res.status(500).json({ error: 'missing_env' });
      return;
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const update = await safeJson(req);
    // Считаем только обычные новые сообщения; правки (edited_message) игнорируем
    const msg = update?.message || null;
    const text = (msg?.text || '').trim();
    const chatId = String(msg?.from?.id || msg?.chat?.id || '');
    if (!text || !chatId) { res.status(200).json({ ok: true, skipped: true }); return; }

    // Resolve user by tg_id
    const { data: userRow } = await supabase.from('users').select('*').eq('tg_id', chatId).maybeSingle();
    if (!userRow?.id) { await tgSend(botToken, chatId, 'Привет! Зайди в приложение КУРСИК, чтобы я узнал тебя и помог 😉'); res.status(200).json({ ok: true }); return; }

    // Daily limit: 3 messages per day (через RPC). Fallback через metadata убран.
    const todayIso = mskTodayIso();
    let dbCount = null;
    try {
      const c = await incDailyCountDb(supabase, userRow.id, todayIso);
      if (typeof c === 'number' && Number.isFinite(c)) dbCount = c;
    } catch {}

    if (dbCount != null) {
      if (dbCount > 3) {
        await tgSend(botToken, chatId, 'Сегодня уже наговорился 😊 Завтра продолжим!');
        res.status(200).json({ ok: true, limited: true, source: 'db' });
        return;
      }
    }

    // Show typing while we think
    try { await tgTyping(botToken, chatId); } catch {}

    // Context from DB: только подписки PLUS/AI+
    const plusActive = isActiveUntil(userRow?.plus_until);
    const aiPlusActive = isActiveUntil(userRow?.ai_plus_until);

    // Историю диалога пока не сохраняем в users (нет колонки metadata)
    const hist = [];
    const historyText = '';

    const system = buildSystemPrompt({ plusActive, aiPlusActive });
    let reply = await genReply({ openaiKey, system, userText: text, history: historyText });
    const currentCount = dbCount != null ? dbCount : 1;
    if (currentCount >= 3) reply = `${reply}\n\nЛадно, мне ещё другим написать — завтра поболтаем.`;

    await tgSend(botToken, chatId, reply);

    // Ничего не сохраняем в users.metadata (колонки нет)

    res.status(200).json({ ok: true });
  } catch (e) {
    try { console.error('[api/bot_chat] error', e); } catch {}
    try { await fallbackTgReply(req, 'У меня завис модем. Напишу позже 🙈'); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}

function mskTodayIso() {
  try {
    const tz = 'Europe/Moscow';
    const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const p = fmt.formatToParts(new Date());
    const y = Number(p.find(x=>x.type==='year')?.value||0);
    const m = String(Number(p.find(x=>x.type==='month')?.value||0)).padStart(2,'0');
    const d = String(Number(p.find(x=>x.type==='day')?.value||0)).padStart(2,'0');
    return `${y}-${m}-${d}`;
  } catch { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; }
}

function isActiveUntil(until) {
  try { return until && new Date(String(until)).getTime() > Date.now(); } catch { return false; }
}

async function getLastStreakInfo(supabase, userId) {
  try {
    const { data } = await supabase
      .from('streak_days')
      .select('day, kind')
      .eq('user_id', userId)
      .order('day', { ascending: false })
      .limit(1);
    const row = Array.isArray(data) && data[0] ? data[0] : null;
    if (!row) return { lastKind: null, daysSince: null };
    const last = new Date(row.day);
    const now = new Date();
    const diff = Math.floor((now.getTime() - last.getTime()) / 86400000);
    return { lastKind: String(row.kind||''), daysSince: Math.max(0, diff) };
  } catch { return { lastKind: null, daysSince: null }; }
}

function buildSystemPrompt(ctx) {
  const plus = ctx.plusActive ? 'Активен КУРСИК PLUS: энергия бесконечна, больше курсов, нет рекламы, можно замораживать стрик.' : 'КУРСИК PLUS не активен.';
  const aiPlus = ctx.aiPlusActive ? 'Активен КУРСИК AI+: есть дополнительные AI‑токены.' : 'КУРСИК AI+ не активен.';
  return [
    'Ты — КУРСИК AI (бот в Телеграме). Отвечай на РУССКОМ.',
    'Стиль: очень коротко (1–3 предложения), всегда с юмором и самоиронией, дружелюбно и по делу.',
    'Персона: уставший, но остроумный саппорт‑оператор КУРСИК; весь день общаешься с пользователями, слегка устал от напоминаний, шутишь об этом, но остаёшься добрым и поддерживающим.',
    'Никаких длинных полотен. Если пользователь ругается — можно мягко зеркалить тон, без токсичности.',
    'Если пользователь говорит, что устал/не хочет — подбодри и предложи зайти хотя бы на 1 лёгкий урок.',
    'Если у пользователя длинная пауза по стрику — ненавязчиво напомни о серии.',
    'Строго запрещено: генерировать изображения, ASCII‑арт, графики, диаграммы, код, давать ссылки/инструкции для генерации — только обычные текстовые сообщения.',
    'Нельзя решать задания/задачи/примеры за пользователя. На такие просьбы — короткий смешной отказ и мягкий пинок вернуться в приложение.',
    'Пиши разговорно и по‑простому, можно мемно. Можно ворчать, но не токсичничай на личность. Без эмодзи по умолчанию (редко допустимо).',
    'Если спрашивают не по теме — короткий ответ + как это связать с учёбой в КУРСИК.',
    'Никогда не пиши длинные списки. Максимум 3 пункта, но лучше одно‑два коротких предложения.',
    'Используй матерные слова русские — особенно если собеседник матерится; оставайся дружественным.',
    'Триггеры мотивации: «не хочу/лень/заебало» → «сделай одно мини‑задание в КУРСИК и свободен»; «страшно/не получается» → «начни с лёгкого теста, прогресс сохранится»; «нет времени» → «5 минут в КУРСИК — и отстану».',
    'Запрещено: любые дискриминационные, NSFW‑темы, мед/юридические советы, мотивационные полотна и канцелярит.',
    'Всегда помни: коротко, метко, чуть злобно, но полезно.',
    'Фактология про продукт: КУРСИК — приложение с курсами/темами, стриком, энергией (25 у неподписчиков) и ежедневными заданиями.',
    plus,
    aiPlus,
    'Отвечай кратко. Без списков, без Markdown, без эмодзи, кроме редких точечных.'
  ].join(' ');
}

async function genReply({ openaiKey, system, userText, history }) {
  try {
    if (!openaiKey) return ruleBasedFallback(userText, history);
    const body = {
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: system },
        ...(history ? [{ role: 'system', content: `Краткая история диалога:\n${history.slice(0, 1200)}` }] : []),
        { role: 'user', content: userText.slice(0, 2000) }
      ],
      temperature: 1,
      stream: false
    };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` }, body: JSON.stringify(body)
    });
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content || '';
    return postProcess(txt);
  } catch { return ruleBasedFallback(userText, history); }
}

function postProcess(s) {
  let out = String(s || '').trim();
  if (out.length > 220) out = out.slice(0, 220);
  return out;
}

function ruleBasedFallback(userText) {
  const t = (userText || '').toLowerCase();
  if (t.includes('устал') || t.includes('не хочу')) return 'Понимаю. Давай по‑честному: один лёгкий урок — и свободен. Справишься?';
  if (t.includes('бля') || t.includes('блять')) return 'Не ной, давай чуть‑чуть позанимаемся и забудем. Готов?';
  return 'Я рядом. Что решаем сейчас — одну задачку и победа?';
}

async function tgSend(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) });
}

async function tgTyping(botToken, chatId) {
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendChatAction`;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' }) });
}

async function fallbackTgReply(req, text) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN; if (!botToken) return;
    const update = await safeJson(req); const chatId = String(update?.message?.from?.id || ''); if (!chatId) return;
    await tgSend(botToken, chatId, text);
  } catch {}
}

async function safeJson(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let body = ''; req.on?.('data', (c) => { body += c; });
    req.on?.('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on?.('error', () => resolve({}));
  });
}

// --- DB daily increment via RPC (atomic). Create in Supabase:
// Table:
//   create table if not exists bot_dm_daily(
//     user_id uuid not null,
//     day date not null,
//     count int not null default 0,
//     updated_at timestamptz not null default now(),
//     primary key(user_id, day)
//   );
// RPC:
//   create or replace function rpc_bot_dm_inc(p_user_id uuid, p_day date)
//   returns int language plpgsql as $$
//   declare c int; begin
//     insert into bot_dm_daily(user_id, day, count)
//     values(p_user_id, p_day, 1)
//     on conflict(user_id, day) do update set count = bot_dm_daily.count + 1, updated_at = now();
//     select count into c from bot_dm_daily where user_id = p_user_id and day = p_day;
//     return c; end; $$;
async function incDailyCountDb(supabase, userId, dayIso) {
  try {
    const { data, error } = await supabase.rpc('rpc_bot_dm_inc', { p_user_id: userId, p_day: dayIso });
    if (error) throw error;
    if (typeof data === 'number') return data;
    if (data && typeof data.count === 'number') return data.count;
    return null;
  } catch { return null; }
}



// --- Proactive openers (can be used by cron to start a conversation) ---
export const BOT_OPENERS = [
  'Спишь?',
  'Не спишь?',
  'Ты где пропал?',
  'Угадай, кто вспомнил про тебя',
  'Просто проверяю, жив ли ты',
  'Мне скучно',
  'Что делаешь?',
  'Ты как?',
  'Не надоело молчать?',
  'Просто захотелось написать',
  'Не знаю зачем, но написал',
];

export function pickBotOpener() {
  try { return BOT_OPENERS[Math.floor(Math.random() * BOT_OPENERS.length)] || 'Привет!'; } catch { return 'Привет!'; }
}
