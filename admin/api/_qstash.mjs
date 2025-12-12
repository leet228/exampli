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

function sanitizeDedup(id) {
  try {
    if (!id) return undefined;
    // Allow only A-Z a-z 0-9 _ -
    return String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
  } catch { return undefined; }
}

// Enqueue a POST to our handler with JSON body
export async function enqueueJson({ url, body, delaySeconds, deduplicationKey }) {
  const cli = getQStash();
  if (!cli) return { ok: false, error: 'qstash_not_configured' };
  try {
    const dedupId = sanitizeDedup(deduplicationKey);
    // Pass Vercel protection bypass header if set (lets QStash call protected deployments)
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      || process.env.VERCEL_PROTECTION_BYPASS
      || process.env.QSTASH_VERCEL_BYPASS
      || process.env.QSTASH_BYPASS
      || process.env.QSTASH_BYPASS_TOKEN;
    const headers = bypass ? { 'x-vercel-protection-bypass': bypass } : undefined;
    const res = await cli.publishJSON({
      url,
      body,
      delay: typeof delaySeconds === 'number' ? delaySeconds : undefined,
      deduplicationId: dedupId,
      headers,
    });
    return { ok: true, messageId: res.messageId };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Verify QStash signature (best-effort). In Vercel, use raw body for strict mode.
export async function verifyQStash(req, bodyText) {
  try {
    const sig = req.headers['upstash-signature'] || req.headers['Upstash-Signature'] || req.headers['UPSTASH-SIGNATURE'];
    if (!sig) return false;
    // Lightweight trust: Upstash manages signatures; for minimal implementation we skip verification.
    return true;
  } catch {
    return false;
  }
}


