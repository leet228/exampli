// ESM serverless function for Vercel: list all SVGs within /public recursively
import manifest from '../public/svg-manifest.json' assert { type: 'json' };

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

    const payload = manifest && typeof manifest === 'object'
      ? manifest
      : null;
    if (!payload || !Array.isArray(payload.svgs)) {
      res.status(500).json({ error: 'manifest_missing' });
      return;
    }
    res.status(200).json(payload);
  } catch (e) {
    try { console.error('[api/list_svgs] error', e); } catch {}
    res.status(500).json({ error: 'Internal error' });
  }
}


