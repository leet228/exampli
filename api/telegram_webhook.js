// Unified Telegram webhook: routes updates to payments or chat handlers
// Set BotFather webhook URL to /api/telegram_webhook

import paymentsWebhook from './payments/webhook.js';
import botChat from './bot_chat.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const update = await readJson(req);
    // Pass parsed body further to avoid re-reading stream in inner handlers
    req.body = update || {};

    const message = update?.message || update?.edited_message || null;
    const hasPCQ = Boolean(update?.pre_checkout_query && update.pre_checkout_query.id);
    const hasSuccessfulPayment = Boolean(message?.successful_payment);

    if (hasPCQ || hasSuccessfulPayment) {
      return await paymentsWebhook(req, res);
    }
    return await botChat(req, res);
  } catch (e) {
    try { console.error('[api/telegram_webhook] error', e); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
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


