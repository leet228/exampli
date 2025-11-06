// ESM serverless function: QStash worker to deliver Telegram notifications in batches
// Body: { jobs: Array<{ tg: string, text: string, photo?: string, kind?: string, uid?: string }> }

import { verifyQStash } from './_qstash.mjs';
import { kvAvailable, getRedis } from './_kv.mjs';
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
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) { res.status(500).json({ error: 'missing_env', detail: 'TELEGRAM_BOT_TOKEN' }); return; }

    // Optional: Supabase client for energy revalidation
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = (supabaseUrl && serviceKey) ? createClient(supabaseUrl, serviceKey) : null;

    // Validate QStash signature if available (best-effort)
    try {
      const raw = await readText(req);
      const ok = await verifyQStash(req, raw);
      // We don't strictly reject to allow manual dev tests; uncomment to enforce.
      // if (!ok) { res.status(401).json({ error: 'invalid_signature' }); return; }
      req.body = JSON.parse(raw || '{}');
    } catch { req.body = req.body || {}; }

    const body = req.body || {};
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    if (!jobs.length) { res.status(200).json({ ok: true, sent: 0 }); return; }

    let sent = 0;
    // Helpers: timezone-aware date for daily keys
    const tz = 'Europe/Moscow';
    const toIso = (d) => {
      const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      const p = fmt.formatToParts(d);
      const y = Number(p.find(x=>x.type==='year')?.value||0);
      const m = String(Number(p.find(x=>x.type==='month')?.value||0)).padStart(2,'0');
      const dd = String(Number(p.find(x=>x.type==='day')?.value||0)).padStart(2,'0');
      return `${y}-${m}-${dd}`;
    };
    const todayIso = toIso(new Date());
    const canKv = kvAvailable();
    const r = canKv ? getRedis() : null;
    // Send sequentially to respect Telegram limits per chat; batches already chunked upstream
    for (const it of jobs) {
      const tg = String(it?.tg || '');
      const text = String(it?.text || '');
      const photo = it?.photo ? String(it.photo) : '';
      const kind = it?.kind ? String(it.kind) : '';
      const uid = it?.uid ? String(it.uid) : '';
      if (!tg || (!text && !photo)) continue;
      try {
        // Energy/streak de-dup at worker level to avoid marking sent when delivery fails upstream
        if (canKv && r && uid) {
          if (kind === 'energy' || photo.endsWith('/notifications/full_energy.png')) {
            const belowKey = `energy:last_below:v1:${uid}`;
            const hadBelow = await r.get(belowKey);
            if (!hadBelow) continue; // не было нового расхода — не отправляем
            // Revalidate energy if possible (lazy regeneration model)
            let okToSend = true;
            if (supabase) {
              try {
                const rr = await supabase.rpc('sync_energy', { p_tg_id: tg, p_delta: 0 });
                const row = Array.isArray(rr.data) ? (rr.data?.[0] || null) : (rr.data || null);
                const eNow = Number(row?.energy ?? Number.NaN);
                const fullAtMs = row?.full_at ? Date.parse(String(row.full_at)) : null;
                if (Number.isFinite(eNow)) {
                  okToSend = eNow >= 25 || (fullAtMs != null && fullAtMs <= Date.now());
                }
              } catch {}
            }
            if (!okToSend) continue;
            // deliver
            if (photo) {
              const url = absPublicUrl(req, photo);
              await tgSendPhoto(botToken, tg, url, text || undefined);
            } else {
              await tgSend(botToken, tg, text);
            }
            sent++;
            try { await r.del(belowKey); } catch {}
            continue;
          }
        }
        if (photo) {
          const url = absPublicUrl(req, photo);
          await tgSendPhoto(botToken, tg, url, text || undefined);
        } else {
          await tgSend(botToken, tg, text);
        }
        sent++;
      } catch {}
    }
    res.status(200).json({ ok: true, sent });
  } catch (e) {
    res.status(500).json({ error: 'notify_batch_error', detail: e?.message || String(e) });
  }
}

async function readText(req) {
  if (req?.body && typeof req.body === 'string') return req.body;
  if (req?.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return new Promise((resolve) => {
    let body = '';
    req.on?.('data', (c) => { body += c; });
    req.on?.('end', () => resolve(body));
    req.on?.('error', () => resolve(''));
  });
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


