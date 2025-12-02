import { applyLessonFinalize } from './_lesson_finalize.mjs';
import { verifyQStash } from './_qstash.mjs';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(204).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const rawBody = await readRawBody(req);
    if (!verifyQStash(req, rawBody)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = rawBody ? JSON.parse(rawBody) : {};
    const result = await applyLessonFinalize(body);
    res.status(200).json(result);
  } catch (e) {
    try { console.error('[api/lesson_finalize_apply] error', e); } catch {}
    res.status(500).json({ error: 'Internal error' });
  }
}

function readRawBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on?.('data', (c) => { body += c; });
    req.on?.('end', () => resolve(body));
    req.on?.('error', () => resolve(''));
  });
}


