// ESM serverless function: Telegram Bot webhook for Stars payments
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

      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (!supabaseUrl || !supabaseKey) { res.status(200).json({ ok: true, warn: 'missing_supabase' }); return; }
      const supabase = createClient(supabaseUrl, supabaseKey);

      const userId = metadata?.user_id || null;
      const tgId = metadata?.tg_id || message?.from?.id || null;

      let userRow = null;
      if (userId) {
        const { data } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
        userRow = data || null;
      } else if (tgId) {
        const { data } = await supabase.from('users').select('*').eq('tg_id', String(tgId)).maybeSingle();
        userRow = data || null;
      }

      if (userRow?.id) {
        // Convert Stars → RUB using env RUB_PER_STAR (default 1)
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

        if (metadata?.type === 'gems') {
          const addCoins = Number(metadata?.coins || 0);
          if (Number.isFinite(addCoins) && addCoins > 0) {
            const rpcRes = await supabase.rpc('rpc_add_coins', { p_user_id: userRow.id, p_delta: addCoins });
            if (rpcRes?.error) {
              await supabase
                .from('users')
                .update({ coins: Number(userRow.coins || 0) + addCoins })
                .eq('id', userRow.id);
            }
          }
          try {
            const { data: payIns, error: payErr } = await supabase.from('payments').upsert({
              id: paymentId,
              user_id: userRow.id,
              type: 'gems',
              product_id: String(metadata?.product_id || ''),
              amount_rub: amountRub,
              currency: 'XTR',
              status: 'succeeded',
              test: false,
              payment_method: null,
              metadata: { ...metadata, total_amount: successfulPayment.total_amount, stars: starsPaid },
              captured_at: new Date().toISOString(),
            });
            if (payErr) { try { console.error('[payments upsert gems] error:', payErr); } catch {} }
          } catch (e) { try { console.error('payments upsert (gems) failed', e); } catch {} }
        } else if (metadata?.type === 'plan') {
          const months = Number(metadata?.months || 1);
          const pcode = String(metadata?.product_id || metadata?.plan_code || '').trim() || 'm1';
          try {
            const { data: payIns2, error: payErr2 } = await supabase.from('payments').upsert({
              id: paymentId,
              user_id: userRow.id,
              type: 'plan',
              product_id: pcode,
              amount_rub: amountRub,
              currency: 'XTR',
              status: 'succeeded',
              test: false,
              payment_method: null,
              metadata: { ...metadata, total_amount: successfulPayment.total_amount, stars: starsPaid },
              captured_at: new Date().toISOString(),
            });
            if (payErr2) { try { console.error('[payments upsert plan] error:', payErr2); } catch {} }
          } catch (e) { try { console.error('payments upsert (plan) failed', e); } catch {} }

          const { error: extErr } = await supabase.rpc('extend_subscription', {
            p_user_id: userRow.id,
            p_plan_code: pcode,
            p_months: Number.isFinite(months) && months > 0 ? months : 1,
            p_payment_id: null,
          });
          if (extErr && months > 0) {
            const now = new Date();
            const until = new Date(now.getTime());
            until.setMonth(until.getMonth() + months);
            await supabase.from('users').update({ plus_until: until.toISOString() }).eq('id', userRow.id);
          }
        } else if (metadata?.type === 'ai_tokens') {
          // Обработка покупки КУРСИК AI + (месячная подписка на токены)
          const months = Number(metadata?.months || 1);
          const pcode = String(metadata?.product_id || '').trim() || 'ai_plus';
          
          // Сохраняем платеж (ВНИМАНИЕ: нужно добавить 'ai_tokens' в CHECK constraint payments_type_check в Supabase!)
          // Временно используем 'plan' если 'ai_tokens' не поддерживается
          let paymentType = 'ai_tokens';
          try {
            const { data: payIns3, error: payErr3 } = await supabase.from('payments').upsert({
              id: paymentId,
              user_id: userRow.id,
              type: paymentType,
              product_id: pcode,
              amount_rub: amountRub,
              currency: 'XTR',
              status: 'succeeded',
              test: false,
              payment_method: null,
              metadata: { ...metadata, total_amount: successfulPayment.total_amount, stars: starsPaid, original_type: 'ai_tokens' },
              captured_at: new Date().toISOString(),
            });
            if (payErr3) {
              // Если constraint не позволяет 'ai_tokens', пробуем 'plan' как fallback
              if (payErr3.code === '23514' && payErr3.message && payErr3.message.includes('payments_type_check')) {
                try {
                  console.warn('[payments] ai_tokens type not allowed, using plan as fallback. Please add ai_tokens to payments_type_check constraint in Supabase!');
                  await supabase.from('payments').upsert({
                    id: paymentId,
                    user_id: userRow.id,
                    type: 'plan',
                    product_id: pcode,
                    amount_rub: amountRub,
                    currency: 'XTR',
                    status: 'succeeded',
                    test: false,
                    payment_method: null,
                    metadata: { ...metadata, total_amount: successfulPayment.total_amount, stars: starsPaid, original_type: 'ai_tokens' },
                    captured_at: new Date().toISOString(),
                  });
                } catch (e2) {
                  try { console.error('[payments upsert ai_tokens fallback] error:', e2); } catch {}
                }
              } else {
                try { console.error('[payments upsert ai_tokens] error:', payErr3); } catch {}
              }
            }
          } catch (e) { try { console.error('payments upsert (ai_tokens) failed', e); } catch {} }

          // Устанавливаем дату окончания подписки на AI токены
          const now = new Date();
          const aiPlusUntil = new Date(now.getTime());
          aiPlusUntil.setMonth(aiPlusUntil.getMonth() + months);
          
          // Пытаемся обновить ai_plus_until напрямую
          // Если поле не существует, сохраняем в metadata как fallback
          const updateResult = await supabase
            .from('users')
            .update({ ai_plus_until: aiPlusUntil.toISOString() })
            .eq('id', userRow.id);
          
          // Если обновление не удалось (поле не существует), используем metadata
          if (updateResult.error) {
            try {
              // Получаем текущие данные пользователя
              const { data: currentUser } = await supabase
                .from('users')
                .select('metadata')
                .eq('id', userRow.id)
                .single();
              
              const currentMeta = (currentUser?.metadata && typeof currentUser.metadata === 'object') 
                ? currentUser.metadata 
                : {};
              const newMeta = { ...currentMeta, ai_plus_until: aiPlusUntil.toISOString() };
              
              await supabase
                .from('users')
                .update({ metadata: newMeta })
                .eq('id', userRow.id);
            } catch (e2) {
              try { console.error('[ai_tokens] failed to set ai_plus_until in metadata', e2); } catch {}
            }
          }
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    try { console.error('[api/payments/webhook] error', e); } catch {}
    res.status(500).json({ error: 'internal_error', detail: e?.message || String(e) });
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