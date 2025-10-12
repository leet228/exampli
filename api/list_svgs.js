// ESM serverless function for Vercel: list all SVGs within /public recursively
import { promises as fs } from 'fs';
import path from 'path';

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

    const root = path.join(process.cwd(), 'public');
    const out = [];

    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        // skip hidden/system
        if (ent.name.startsWith('.')) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(full);
        } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.svg')) {
          const rel = path.relative(root, full).replace(/\\/g, '/');
          out.push('/' + rel);
        }
      }
    }

    await walk(root);
    // stable order
    out.sort();
    res.status(200).json({ svgs: out });
  } catch (e) {
    try { console.error('[api/list_svgs] error', e); } catch {}
    res.status(500).json({ error: 'Internal error' });
  }
}


