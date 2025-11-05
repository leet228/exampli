// Lightweight Upstash Redis helper for serverless ESM handlers
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { Redis } from '@upstash/redis';

let _redis = null;

export function kvAvailable() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getRedis() {
  if (!kvAvailable()) return null;
  if (_redis) return _redis;
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _redis;
}

export async function cacheGetJSON(key) {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return raw;
  } catch { return null; }
}

export async function cacheSetJSON(key, value, ttlSeconds) {
  const r = getRedis();
  if (!r) return false;
  try {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
      await r.set(key, payload, { ex: Math.floor(ttlSeconds) });
    } else {
      await r.set(key, payload);
    }
    return true;
  } catch { return false; }
}

// Simple lock (best-effort). Returns true if lock acquired.
export async function acquireLock(key, ttlSeconds = 30) {
  const r = getRedis();
  if (!r) return true; // if no redis, don't block
  try {
    const ok = await r.set(key, '1', { nx: true, ex: Math.max(1, Math.floor(ttlSeconds)) });
    return Boolean(ok);
  } catch { return true; }
}

export async function releaseLock(key) {
  const r = getRedis();
  if (!r) return;
  try { await r.del(key); } catch {}
}

// Simple fixed window rate limiter (per id)
// Example: await rateLimit({ key: `boot:${userId}`, limit: 30, windowSeconds: 60 })
export async function rateLimit({ key, limit, windowSeconds }) {
  const r = getRedis();
  if (!r) return { ok: true, remaining: Infinity };
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const k = `rl:${key}:${windowStart}`;
  try {
    const count = await r.incr(k);
    if (count === 1) {
      await r.expire(k, windowSeconds);
    }
    const ok = count <= limit;
    return { ok, remaining: Math.max(0, limit - count) };
  } catch {
    return { ok: true, remaining: Infinity };
  }
}


