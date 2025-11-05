// ESM serverless function: Telegram Bot webhook for Stars payments
import { createClient } from '@supabase/supabase-js';
import { qstashAvailable, enqueueJson } from '../_qstash.mjs';

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

    const update = await safeJson(req);
    try { console.log('[telegram:webhook] update:', JSON.stringify(update)); } catch {}

    // 0) Answer pre_checkout_query to allow Telegram to proceed with payment
    const pcq = update?.pre_checkout_query || null;
    if (pcq?.id) {
      try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) { console.warn('No TELEGRAM_BOT_TOKEN set; cannot answerPreCheckoutQuery'); }
        else {
          const ansUrl = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/answerPreCheckoutQuery`;
          const ansRes = await fetch(ansUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pre_checkout_query_id: pcq.id, ok: true })
          });
          const ansText = await ansRes.text();
          try { console.log('[telegram:webhook] answerPreCheckoutQuery:', ansText); } catch {}
        }
      } catch (e) { try { console.warn('answerPreCheckoutQuery failed', e); } catch {} }
      // Acknowledge update early; successful_payment will arrive next
      res.status(200).json({ ok: true });
      return;
    }

    const message = update?.message || update?.edited_message || null;
    const successfulPayment = message?.successful_payment || null;

    // Stars successful payment (currency XTR)
    if (successfulPayment && String(successfulPayment?.currency || '').toUpperCase() === 'XTR') {
      const payloadRaw = successfulPayment?.invoice_payload || '';
      let payload = null;
      // Try JSON first
      try { payload = payloadRaw ? JSON.parse(payloadRaw) : null; } catch {}
      // Fallback: parse compact "k=v;..." payload (t,pid,m,c,u,g)
      if (!payload && typeof payloadRaw === 'string' && payloadRaw.includes('=')) {
        const obj = {};
        for (const part of payloadRaw.split(';')) {
          const [k, v] = part.split('=');
          if (!k) continue;
          obj[k] = v ?? '';
        }
        payload = obj;
      }
      // Normalize to common metadata shape
      let metadata = payload || {};
      if (metadata && (metadata.t || metadata.pid || metadata.m || metadata.c)) {
        metadata = {
          type: metadata.t || metadata.type || null,
          product_id: metadata.pid || metadata.product_id || null,
          months: metadata.m != null ? Number(metadata.m) : (metadata.months != null ? Number(metadata.months) : undefined),
          coins: metadata.c != null ? Number(metadata.c) : (metadata.coins != null ? Number(metadata.coins) : undefined),
          user_id: metadata.u || metadata.user_id || null,
          tg_id: metadata.g || metadata.tg_id || null,
        };
      }

      // Normalize core data for async processing
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (!supabaseUrl || !supabaseKey) { res.status(200).json({ ok: true, warn: 'missing_supabase' }); return; }

      const tgId = metadata?.tg_id || message?.from?.id || null;
      const RUB_PER_STAR = Number(process.env.RUB_PER_STAR || '1');
      const starsPaid = Number(successfulPayment.total_amount || 0);
      const amountRub = Number.isFinite(starsPaid) && Number.isFinite(RUB_PER_STAR)
        ? Math.round(starsPaid * (RUB_PER_STAR > 0 ? RUB_PER_STAR : 1))
        : 0;
      const paymentId = String(
        successfulPayment.provider_payment_charge_id ||
        successfulPayment.telegram_payment_charge_id ||
        `xtr:${message?.date || Date.now()}:${message?.from?.id || 'unknown'}`
      );

      const job = {
        payment: {
          type: metadata?.type || null,
          product_id: metadata?.product_id || null,
          months: metadata?.months || null,
          coins: metadata?.coins || null,
          user_id: metadata?.user_id || null,
          tg_id: tgId ? String(tgId) : null,
          amount_rub: amountRub,
          stars: starsPaid,
          payment_id: paymentId,
          meta: { ...metadata, total_amount: successfulPayment.total_amount },
        }
      };

      // Use QStash if available: enqueue and ACK immediately
      if (qstashAvailable()) {
        try {
          const url = absPublicUrl(req, '/api/payments/apply');
          const pub = await enqueueJson({ url, body: job, deduplicationKey: `pay:${paymentId}` });
          if (pub && pub.ok) {
            res.status(200).json({ ok: true, enqueued: true });
            return;
          } else {
            try { console.warn('[payments] enqueue returned not ok:', pub?.error || pub); } catch {}
          }
        } catch (e) {
          try { console.warn('[payments] enqueue failed, will process inline', e); } catch {}
        }
      }

      // Fallback: inline processing (original logic)
      const supabase = createClient(supabaseUrl, supabaseKey);
      const userId = metadata?.user_id || null;
      let userRow = null;
      if (userId) {
        const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
        userRow = data || null;
      } else if (tgId) {
        const { data } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).maybeSingle();
        userRow = data || null;
      }
      if (userRow?.id) {
        await processPaymentInline({ supabase, req, userRow, paymentId, amountRub, starsPaid, metadata });
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    try { console.error('[api/payments/webhook] error', e); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
  }
}
async function processPaymentInline({ supabase, req, userRow, paymentId, amountRub, starsPaid, metadata }) {
  const tgId = tgIdFrom(userRow, metadata?.tg_id || null);
  if (metadata?.type === 'gems') {
    const addCoins = Number(metadata?.coins || 0);
    if (Number.isFinite(addCoins) && addCoins > 0) {
      const rpcRes = await supabase.rpc('rpc_add_coins', { p_user_id: userRow.id, p_delta: addCoins });
      if (rpcRes?.error) {
        await supabase.from('users').update({ coins: Number(userRow.coins || 0) + addCoins }).eq('id', userRow.id);
      }
    }
    try {
      await supabase.from('payments').upsert({
        id: paymentId, user_id: userRow.id, type: 'gems', product_id: String(metadata?.product_id || ''),
        amount_rub: amountRub, currency: 'XTR', status: 'succeeded', test: false, payment_method: null,
        metadata: { ...metadata, stars: starsPaid }, captured_at: new Date().toISOString(),
      });
    } catch {}
  } else if (metadata?.type === 'plan') {
    const months = Number(metadata?.months || 1);
    const pcode = String(metadata?.product_id || metadata?.plan_code || '').trim() || 'm1';
    try {
      await supabase.from('payments').upsert({
        id: paymentId, user_id: userRow.id, type: 'plan', product_id: pcode,
        amount_rub: amountRub, currency: 'XTR', status: 'succeeded', test: false, payment_method: null,
        metadata: { ...metadata, stars: starsPaid }, captured_at: new Date().toISOString(),
      });
    } catch {}
    const { error: extErr } = await supabase.rpc('extend_subscription', { p_user_id: userRow.id, p_plan_code: pcode, p_months: months > 0 ? months : 1, p_payment_id: null });
    if (extErr && months > 0) {
      const now = new Date(); const until = new Date(now.getTime()); until.setMonth(until.getMonth() + months);
      await supabase.from('users').update({ plus_until: until.toISOString() }).eq('id', userRow.id);
    }
    try {
      const chat = String(tgId);
      const photo = absPublicUrl(req, '/notifications/plus.png');
      await sendTelegramPhoto(process.env.TELEGRAM_BOT_TOKEN, chat, photo, '💎 КУРСИК PLUS активирован!');
    } catch {}
  } else if (metadata?.type === 'ai_tokens') {
    const months = Number(metadata?.months || 1);
    const pcode = String(metadata?.product_id || '').trim() || 'ai_plus';
    try {
      await supabase.from('payments').upsert({
        id: paymentId, user_id: userRow.id, type: 'ai_tokens', product_id: pcode,
        amount_rub: amountRub, currency: 'XTR', status: 'succeeded', test: false, payment_method: null,
        metadata: { ...metadata, stars: starsPaid }, captured_at: new Date().toISOString(),
      });
    } catch {}
    const now = new Date(); const aiPlusUntil = new Date(now.getTime()); aiPlusUntil.setMonth(aiPlusUntil.getMonth() + (months > 0 ? months : 1));
    await supabase.from('users').update({ ai_plus_until: aiPlusUntil.toISOString() }).eq('id', userRow.id);
    try {
      const chat = String(tgId);
      const photo = absPublicUrl(req, '/notifications/AI.png');
      await sendTelegramPhoto(process.env.TELEGRAM_BOT_TOKEN, chat, photo, '🤖 AI+ активирован!');
    } catch {}
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

function tgIdFrom(userRow, fallback) {
  return (userRow && userRow.tg_id) ? String(userRow.tg_id) : (fallback ? String(fallback) : null);
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

async function sendTelegram(botToken, chatId, text) {
  try {
    if (!botToken || !chatId || !text) return;
    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch {}
}

async function sendTelegramPhoto(botToken, chatId, photoUrl, caption) {
  try {
    if (!botToken || !chatId || !photoUrl) return;
    const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption: caption || undefined })
    });
  } catch {}
}