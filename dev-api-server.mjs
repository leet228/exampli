// Minimal dev server to run Vercel-style ESM handlers from ./api on http://localhost:3000
// No external deps; provides res.status(...).json(...) helpers and auto reloads modules

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Best-effort load .env.local then .env (only sets missing variables)
function loadEnvOnce() {
  const candidates = ['.env.local', '.env'];
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      // ignore
    }
  }
}

loadEnvOnce();

// Helper to add Express-like methods
function wrapRes(res) {
  res.status = function status(code) { this.statusCode = code; return this; };
  res.json = function json(obj) {
    if (!this.getHeader('Content-Type')) this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(obj));
  };
  return res;
}

async function handleRequest(req, res) {
  try {
    // Default headers useful for tunnels/dev
    res.setHeader('ngrok-skip-browser-warning', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    let rel = url.pathname.slice('/api/'.length);
    if (!rel || rel.endsWith('/')) rel = rel.replace(/\/$/, '');
    const modulePath = join(process.cwd(), 'api', rel + '.js');

    if (!existsSync(modulePath)) {
      res.statusCode = 404;
      res.end('Missing handler');
      return;
    }

    // Bust module cache each request so changes are picked up without restart
    const modUrl = pathToFileURL(modulePath).href + `?t=${Date.now()}`;
    const mod = await import(modUrl);
    const handler = mod?.default;
    if (typeof handler !== 'function') {
      res.statusCode = 500;
      res.end('Handler missing default export');
      return;
    }

    await handler(req, wrapRes(res));
  } catch (e) {
    try { console.error('[dev-api] error', e); } catch {}
    try { wrapRes(res).status(500).json({ error: 'dev-api error', message: String(e?.message || e) }); } catch {}
  }
}

const server = createServer((req, res) => {
  // Ensure keep-alive default like Node does; delegate to async
  handleRequest(req, res);
});

const PORT = Number(process.env.API_PORT || 5174);
server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT}`);
});


