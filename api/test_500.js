// ESM serverless function: intentionally returns HTTP 500 for testing

export default async function handler(req, res) {
  // CORS preflight / allowed methods
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Optional message via query/body
  let message = 'Intentional 500 for testing';
  try { if (req?.query?.message) message = String(req.query.message); } catch {}
  try { if (req?.body && typeof req.body === 'object' && req.body?.message) message = String(req.body.message); } catch {}
  try {
    const url = new URL(req?.url || '/', 'http://localhost');
    const q = url.searchParams.get('message');
    if (q) message = String(q);
  } catch {}

  res.status(500).json({ ok: false, error: 'forced_error', message });
}


