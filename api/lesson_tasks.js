// Serverless cache-aware fetcher for lesson tasks with keyset pagination
import { createClient } from '@supabase/supabase-js';
import { cacheGetJSON, cacheSetJSON, kvAvailable } from './_kv.mjs';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const CACHE_TTL_SECONDS = Number(process.env.LESSON_TASKS_CACHE_TTL || 60);
const CACHE_VERSION = 'v2';

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clampLimit(rawLimit) {
  const n = Number(rawLimit);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, OPTIONS');
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const lessonId = (req.query?.lesson_id ?? req.query?.lessonId ?? '').toString().trim();
    if (!lessonId) {
      res.status(400).json({ error: 'lesson_id_required' });
      return;
    }

    const limit = clampLimit(req.query?.limit);
    const cursorOrder = parseNumber(req.query?.cursor_order ?? req.query?.cursorOrder);
    const cursorId = parseNumber(req.query?.cursor_id ?? req.query?.cursorId);
    const cacheKey = `lesson_tasks:${CACHE_VERSION}:${lessonId}:limit:${limit}`;

    if (!cursorOrder && !cursorId && kvAvailable()) {
      const cached = await cacheGetJSON(cacheKey);
      if (cached && Array.isArray(cached.tasks)) {
        res.status(200).json({ ...cached, cached: true });
        return;
      }
    }

    const supabase = getSupabase();
    let query = supabase
      .from('tasks')
      .select('id, lesson_id, prompt, task_text, answer_type, options, correct, order_index')
      .eq('lesson_id', lessonId)
      .order('order_index', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(limit + 1);

    if (Number.isFinite(cursorOrder) && Number.isFinite(cursorId)) {
      query = query.or(`order_index.gt.${cursorOrder},and(order_index.eq.${cursorOrder},id.gt.${cursorId})`);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: 'supabase_error', detail: error.message });
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const hasMore = rows.length > limit;
    const tasks = hasMore ? rows.slice(0, limit) : rows;
    const last = tasks[tasks.length - 1] || null;
    const nextCursor = hasMore && last
      ? { order_index: last.order_index ?? null, id: last.id ?? null }
      : null;

    const payload = {
      lessonId: lessonId,
      count: tasks.length,
      nextCursor,
      tasks,
    };

    if (!nextCursor && kvAvailable()) {
      await cacheSetJSON(cacheKey, payload, CACHE_TTL_SECONDS);
    }

    res.status(200).json(payload);
  } catch (err) {
    console.error('[api/lesson_tasks] error', err);
    res.status(500).json({ error: 'internal_error', detail: err?.message || String(err) });
  }
}

