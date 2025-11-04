// ESM serverless function: Daily notifications at 17:00 MSK
// 1) Remind to preserve streak if yesterday had active/freeze but today is empty
// 2) Friendly nudge based on consecutive missed days
// 3) Purchase notifications are handled in payments/webhook.js

import { createClient } from '@supabase/supabase-js';

function publicBase(req) {
  try {
    const explicit = process.env.PUBLIC_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    const proto = (req?.headers?.['x-forwarded-proto'] || 'https');
    const host = (req?.headers?.host || process.env.VERCEL_URL || '').toString();
    if (host) return `${proto}://${host}`.replace(/\/$/, '');
  } catch {}
  return '';
}

function absPublicUrl(req, relPath) {
  const base = publicBase(req);
  const rel = String(relPath || '').startsWith('/') ? String(relPath) : `/${String(relPath || '')}`;
  return base ? `${base}${rel}` : rel;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(204).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!supabaseUrl || !serviceKey) { res.status(500).json({ error: 'missing_env', detail: 'SUPABASE_URL or KEY' }); return; }
    if (!botToken) { res.status(500).json({ error: 'missing_env', detail: 'TELEGRAM_BOT_TOKEN' }); return; }
    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Test mode: force one template to specific chat (guarded by token) ---
    try {
      const url = new URL(req?.url || '/', 'http://localhost');
      const force = String(url.searchParams.get('force') || '').toLowerCase();
      const token = String(url.searchParams.get('token') || '');
      const chat = String(url.searchParams.get('chat') || '');
      const tpl = String(url.searchParams.get('template') || '').toLowerCase();
      const allow = process.env.TEST_NOTIFY_TOKEN && token && token === process.env.TEST_NOTIFY_TOKEN;
      if (force === '1' && allow && chat) {
        const map = {
          streak: { text: '⚠️ Стрик шатается!\n\nЕщё один день без КУРСИКА — и твоя серия полетит в пропасть! Вернись, пока она не упала с криком «экзамен не сдан!» 😱', photo: '/notifications/streak_noti.png' },
          level1: { text: 'Эй, куда пропал?\n\nМы тут решаем тесты, вспоминаем формулы, а тебя нет! 😤 Вернись — без тебя скучно и подозрительно тихо…', photo: '/notifications/level1.png' },
          level2: { text: 'Ну ты и прогульщик!\n\nУже столько времени тебя не видно — я уже волнуюсь! 😡 Возвращайся, пока я не начал тренировать твоего клона. Серьёзно, нам нужны эти баллы!', photo: '/notifications/level2.png' },
          level3: { text: 'КУРСИК в ярости!\n\nТак долго без заданий. 😠 Ты хочешь, чтобы твой мозг ушёл в спячку до экзамена? Вернись, пока я не устроил тебе пробник во сне!', photo: '/notifications/level3.png' },
          energy: { text: 'Энергия на максимуме!\n\nАккуратнее, у тебя 100% заряда! 🔋\nСамое время штурмовать тесты, пока батарейка не ушла на мемы.', photo: '/notifications/full_energy.png' },
        };
        const picked = map[tpl] || null;
        if (!picked) { res.status(400).json({ error: 'unknown_template', templates: Object.keys(map) }); return; }
        const photo = absPublicUrl(req, picked.photo);
        await tgSendPhoto(botToken, chat, photo, picked.text);
        res.status(200).json({ ok: true, forced: tpl, chat });
        return;
      }
    } catch {}

    const tz = 'Europe/Moscow';
    const toIso = (d) => {
      const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      const p = fmt.formatToParts(d);
      const y = Number(p.find(x=>x.type==='year')?.value||0);
      const m = String(Number(p.find(x=>x.type==='month')?.value||0)).padStart(2,'0');
      const dd = String(Number(p.find(x=>x.type==='day')?.value||0)).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    };
    const today = new Date();
    const todayIso = toIso(today);
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yesterdayIso = toIso(yesterday);
    const startFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
    const startIso = toIso(startFrom);

    // Users with Telegram id
    const { data: users } = await supabase
      .from('users')
      .select('id, tg_id, energy, plus_until, metadata')
      .not('tg_id', 'is', null)
      .limit(50000);

    const userIds = (users || []).map(u => u.id).filter(Boolean);
    const slice = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i*size, (i+1)*size));
    const chunks = slice(userIds, 1000);

    const daysByUser = new Map(); // userId -> Map(dayIso -> kind)
    for (const ch of chunks) {
      const { data: rows } = await supabase
        .from('streak_days')
        .select('user_id, day, kind')
        .in('user_id', ch)
        .gte('day', startIso)
        .lte('day', todayIso);
      for (const r of rows || []) {
        const uid = r.user_id; const d = String(r.day); const kind = String(r.kind || '');
        if (!daysByUser.has(uid)) daysByUser.set(uid, new Map());
        daysByUser.get(uid).set(d, kind);
      }
    }

    const toSend = [];
    let cntStreak = 0, cntL1 = 0, cntL2 = 0, cntL3 = 0, cntEnergy = 0;

    // Определяем час по МСК, чтобы стричные уведомления слали только в ~17:00 МСК
    const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).formatToParts(today);
    const hourStr = parts.find(p => p.type === 'hour')?.value || '00';
    const hourMsk = parseInt(hourStr, 10);

    // Стрик/пропуски отправляем в 17:00 МСК
    if (hourMsk === 17) for (const u of (users || [])) {
        const uid = u.id; const tg = u.tg_id ? String(u.tg_id) : null;
        if (!tg) continue;
        const map = daysByUser.get(uid) || new Map();
        const hasToday = map.has(todayIso);
        if (hasToday) continue; // никаких сообщений сегодня

        const yKind = map.get(yesterdayIso) || '';
        if (yKind === 'active' || yKind === 'freeze') {
          // Напоминание: серия может слететь (шаблон 1)
          const text = '⚠️ Стрик шатается!\n\nЕщё один день без КУРСИКА — и твоя серия полетит в пропасть! Вернись, пока она не упала с криком «экзамен не сдан!» 😱';
          toSend.push({ tg, text, photo: '/notifications/streak_noti.png' });
          cntStreak++;
          continue;
        }
        // Подсчёт пропусков подряд до сегодня (вчера, позавчера, ...)
        let miss = 0;
        for (let i = 1; i <= 14; i++) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          const iso = toIso(d);
          if (map.has(iso)) break; // встречен актив/фриз — прекращаем счётчик
          miss += 1;
        }
        if (miss >= 1) {
          let text = '';
          if (miss <= 3) {
            // Шаблон 2
            text = 'Эй, куда пропал?\n\nМы тут решаем тесты, вспоминаем формулы, а тебя нет! 😤 Вернись — без тебя скучно и подозрительно тихо…';
            toSend.push({ tg, text, photo: '/notifications/level1.png' });
            cntL1++;
            continue;
          } else if (miss <= 7) {
            // Шаблон 3
            text = 'Ну ты и прогульщик!\n\nУже столько времени тебя не видно — я уже волнуюсь! 😡 Возвращайся, пока я не начал тренировать твоего клона. Серьёзно, нам нужны эти баллы!';
            toSend.push({ tg, text, photo: '/notifications/level2.png' });
            cntL2++;
            continue;
          } else {
            // Шаблон 4
            text = 'КУРСИК в ярости!\n\nТак долго без заданий. 😠 Ты хочешь, чтобы твой мозг ушёл в спячку до экзамена? Вернись, пока я не устроил тебе пробник во сне!';
            toSend.push({ tg, text, photo: '/notifications/level3.png' });
            cntL3++;
            continue;
          }
        }
    }

    // --- Энергия: уведомление при полном восстановлении до 25 для НЕ подписчиков ---
    const energyUpdates = [];
    for (const u of (users || [])) {
      const tg = u.tg_id ? String(u.tg_id) : null;
      if (!tg) continue;
      const plusActive = (() => { try { return Boolean(u.plus_until && new Date(String(u.plus_until)).getTime() > Date.now()); } catch { return false; } })();
      if (plusActive) continue; // только для неподписчиков
      const meta = (u.metadata && typeof u.metadata === 'object') ? { ...u.metadata } : {};

      const lastBelowTs = meta.energy_last_below_25_at ? Date.parse(String(meta.energy_last_below_25_at)) : null;
      const lastSentTs = meta.energy_full_last_sent_at ? Date.parse(String(meta.energy_full_last_sent_at)) : 0;

      // Если уже фиксировали «было ниже 25», проверим актуальную энергию через RPC (ленивая регенерация)
      if (lastBelowTs != null) {
        try {
          const r = await supabase.rpc('sync_energy', { p_tg_id: tg, p_delta: 0 });
          const row = Array.isArray(r.data) ? (r.data?.[0] || null) : (r.data || null);
          const eNow = Number(row?.energy ?? NaN);
          const fullAt = row?.full_at ? Date.parse(String(row.full_at)) : null;
          const isFull = (Number.isFinite(eNow) && eNow >= 25) || (fullAt != null && fullAt <= Date.now());
          if (isFull && lastBelowTs > lastSentTs) {
            toSend.push({ tg, text: 'Энергия на максимуме!\n\nАккуратнее, у тебя 100% заряда! 🔋\nСамое время штурмовать уроки, пока батарейка не ушла на мемы.', photo: '/notifications/full_energy.png' });
            cntEnergy++;
            meta.energy_full_last_sent_at = new Date().toISOString();
            delete meta.energy_last_below_25_at;
            energyUpdates.push({ id: u.id, metadata: meta });
          }
        } catch {}
        continue;
      }

      // Ещё не фиксировали «было ниже 25»: если сейчас в users.energy < 25 — пометим старт отсчёта
      const tabEnergy = Number(u.energy ?? 0);
      if (tabEnergy < 25) {
        meta.energy_last_below_25_at = new Date().toISOString();
        energyUpdates.push({ id: u.id, metadata: meta });
      }
    }

    // Send in small batches to respect Telegram limits
    const sendBatch = async (batch) => {
      for (const it of batch) {
        try {
          if (it.photo) {
            const url = absPublicUrl(req, it.photo);
            await tgSendPhoto(botToken, it.tg, url, it.text);
          } else {
            await tgSend(botToken, it.tg, it.text);
          }
        } catch {}
      }
    };
    const groups = slice(toSend, 25);
    for (const g of groups) { await sendBatch(g); }

    // Persist metadata updates for energy state
    for (const up of energyUpdates) {
      try { await supabase.from('users').update({ metadata: up.metadata }).eq('id', up.id); } catch {}
    }

    res.status(200).json({ ok: true, sent: toSend.length, users: (users || []).length, energy_updates: energyUpdates.length, hour_msk: hourMsk, by_type: { streak: cntStreak, level1: cntL1, level2: cntL2, level3: cntL3, energy: cntEnergy } });
  } catch (e) {
    try { console.error('[api/cron_notify] error', e); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}

async function tgSend(botToken, chatId, text) {
  if (!botToken || !chatId || !text) return;
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function tgSendPhoto(botToken, chatId, photoUrl, caption) {
  if (!botToken || !chatId || !photoUrl) return;
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption || undefined })
  });
}


