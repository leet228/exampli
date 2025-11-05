// ESM serverless function: Apply payment effects (queued by webhook via QStash)
// Body: { payment: { type, product_id, months?, coins?, user_id?, tg_id?, amount_rub, stars, payment_id, meta? } }

import { createClient } from '@supabase/supabase-js';
import { kvAvailable, acquireLock, releaseLock } from '../_kv.mjs';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const body = await readJson(req);
    const p = body?.payment || null;
    if (!p || !p.payment_id) { res.status(400).json({ error: 'bad_request' }); return; }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !supabaseKey) { res.status(500).json({ error: 'supabase_env' }); return; }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Idempotent lock per payment
    const lockKey = `pay:lock:${p.payment_id}`;
    if (kvAvailable()) {
      const ok = await acquireLock(lockKey, 30);
      if (!ok) { res.status(200).json({ ok: true, skipped: 'locked' }); return; }
    }

    // Resolve user
    let userRow = null;
    if (p.user_id) {
      const { data } = await supabase.from('users').select('*').eq('id', p.user_id).maybeSingle();
      userRow = data || null;
    } else if (p.tg_id) {
      const { data } = await supabase.from('users').select('*').eq('tg_id', String(p.tg_id)).maybeSingle();
      userRow = data || null;
    }
    if (!userRow?.id) { res.status(200).json({ ok: true, skipped: 'user_not_found' }); return; }

    await applyPayment({ supabase, req, userRow, p });
    res.status(200).json({ ok: true });
  } catch (e) {
    try { console.error('[payments/apply] error', e); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  } finally {
    // best-effort unlock is not strictly needed (lock expires), but try anyway
    try { const body = await readJson(req); if (body?.payment?.payment_id && kvAvailable()) await releaseLock(`pay:lock:${body.payment.payment_id}`); } catch {}
  }
}

async function applyPayment({ supabase, req, userRow, p }) {
  const type = p?.type || null;
  if (type === 'gems') {
    const addCoins = Number(p?.coins || 0);
    if (Number.isFinite(addCoins) && addCoins > 0) {
      const rpcRes = await supabase.rpc('rpc_add_coins', { p_user_id: userRow.id, p_delta: addCoins });
      if (rpcRes?.error) {
        await supabase.from('users').update({ coins: Number(userRow.coins || 0) + addCoins }).eq('id', userRow.id);
      }
    }
    await supabase.from('payments').upsert({
      id: p.payment_id, user_id: userRow.id, type: 'gems', product_id: String(p?.product_id || ''),
      amount_rub: Number(p.amount_rub || 0), currency: 'XTR', status: 'succeeded', test: false, payment_method: null,
      metadata: { ...(p.meta || {}), stars: Number(p.stars || 0) }, captured_at: new Date().toISOString(),
    });
    // Optional notify about coins purchase
    try {
      const chat = String(tgIdFrom(userRow, p.tg_id || null));
      const text = `💰 Баланс пополнен: +${Number(p.coins || 0)} монет.`;
      await tgSend(process.env.TELEGRAM_BOT_TOKEN, chat, text);
    } catch {}
    return;
  }
  if (type === 'plan') {
    const months = Number(p?.months || 1);
    const pcode = String(p?.product_id || 'm1');
    await supabase.from('payments').upsert({
      id: p.payment_id, user_id: userRow.id, type: 'plan', product_id: pcode,
      amount_rub: Number(p.amount_rub || 0), currency: 'XTR', status: 'succeeded', test: false, payment_method: null,
      metadata: { ...(p.meta || {}), stars: Number(p.stars || 0) }, captured_at: new Date().toISOString(),
    });
    const { error: extErr } = await supabase.rpc('extend_subscription', { p_user_id: userRow.id, p_plan_code: pcode, p_months: months > 0 ? months : 1, p_payment_id: p.payment_id });
    if (extErr && months > 0) {
      const now = new Date(); const until = new Date(now.getTime()); until.setMonth(until.getMonth() + months);
      await supabase.from('users').update({ plus_until: until.toISOString() }).eq('id', userRow.id);
    }
    try {
      const chat = String(tgIdFrom(userRow, p.tg_id || null));
      const photo = absPublicUrl(req, '/notifications/plus.png');
      await tgSendPhoto(process.env.TELEGRAM_BOT_TOKEN, chat, photo, '💎 КУРСИК PLUS активирован!');
    } catch {}
    return;
  }
  if (type === 'ai_tokens') {
    const months = Number(p?.months || 1);
    const pcode = String(p?.product_id || 'ai_plus');
    const ins = await supabase.from('payments').upsert({
      id: p.payment_id, user_id: userRow.id, type: 'ai_tokens', product_id: pcode,
      amount_rub: Number(p.amount_rub || 0), currency: 'XTR', status: 'succeeded', test: false, payment_method: null,
      metadata: { ...(p.meta || {}), stars: Number(p.stars || 0) }, captured_at: new Date().toISOString(),
    });
    if (ins?.error && ins.error.code === '23514' && (ins.error.message || '').includes('payments_type_check')) {
      // Fallback type if constraint doesn't allow ai_tokens
      await supabase.from('payments').upsert({
        id: p.payment_id, user_id: userRow.id, type: 'plan', product_id: pcode,
        amount_rub: Number(p.amount_rub || 0), currency: 'XTR', status: 'succeeded', test: false, payment_method: null,
        metadata: { ...(p.meta || {}), stars: Number(p.stars || 0), original_type: 'ai_tokens' }, captured_at: new Date().toISOString(),
      });
    }
    const now = new Date(); const aiPlusUntil = new Date(now.getTime()); aiPlusUntil.setMonth(aiPlusUntil.getMonth() + (months > 0 ? months : 1));
    const updateResult = await supabase.from('users').update({ ai_plus_until: aiPlusUntil.toISOString() }).eq('id', userRow.id);
    // если колонка отсутствует — считаем это ошибкой схемы; fallback не используем
    try {
      const chat = String(tgIdFrom(userRow, p.tg_id || null));
      const photo = absPublicUrl(req, '/notifications/AI.png');
      await tgSendPhoto(process.env.TELEGRAM_BOT_TOKEN, chat, photo, '🤖 AI+ активирован!');
    } catch {}
    return;
  }
}

async function readJson(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let body = '';
    req.on?.('data', (c) => { body += c; });
    req.on?.('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
    req.on?.('error', () => resolve({}));
  });
}

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
async function tgSend(botToken, chatId, text) {
  try {
    if (!botToken || !chatId || !text) return;
    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch {}
}
async function tgSendPhoto(botToken, chatId, photoUrl, caption) {
  try {
    if (!botToken || !chatId || !photoUrl) return;
    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`;
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption || undefined })
    });
  } catch {}
}
function tgIdFrom(userRow, fallback) {
  return (userRow && userRow.tg_id) ? String(userRow.tg_id) : (fallback ? String(fallback) : null);
}


