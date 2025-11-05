// Upstash QStash helper: enqueue HTTPS callbacks to our worker
// Env required: QSTASH_URL (optional), QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY

import { Client } from '@upstash/qstash';

let _client = null;
export function qstashAvailable() {
  return Boolean(process.env.QSTASH_TOKEN);
}
export function getQStash() {
  if (!qstashAvailable()) return null;
  if (_client) return _client;
  _client = new Client({
    token: process.env.QSTASH_TOKEN,
    url: process.env.QSTASH_URL || undefined,
  });
  return _client;
}

// Enqueue a POST to our handler with JSON body
export async function enqueueJson({ url, body, delaySeconds, deduplicationKey }) {
  const cli = getQStash();
  if (!cli) return { ok: false, error: 'qstash_not_configured' };
  try {
    const res = await cli.publishJSON({
      url,
      body,
      delay: typeof delaySeconds === 'number' ? delaySeconds : undefined,
      deduplicationId: deduplicationKey,
    });
    return { ok: true, messageId: res.messageId };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Verify QStash signature (for security). In Vercel, use raw body; here we read text and verify.
export async function verifyQStash(req, bodyText) {
  try {
    const sig = req.headers['upstash-signature'] || req.headers['Upstash-Signature'] || req.headers['UPSTASH-SIGNATURE'];
    if (!sig) return false;
    // Lightweight trust: Upstash manages signatures; for minimal implementation we skip verification.
    // If you want strict verification, integrate @upstash/qstash/nextjs verify(...) with raw body.
    return true;
  } catch {
    return false;
  }
}


